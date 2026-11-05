"""The road: the course rebuilt around the life of a load, plus the tools that go with it.

Called from build_content.py. Reads sources/road/ in the private content repo:
  stops/*.json      one file per stop (Learn / See it real / Do it / Look it up)
  messages.json     every message template, shared by the stops and the Message Builder
  glossary.json, teams.json, customers.json
  photos/*.webp     the photos a page uses go into media/<page>.pack next to it
and returns {bucket path: html or bytes}. The page JavaScript is tools/road/*.js, published as
one static file (ugl-road.js) that every road page loads; a page carries only its data.

Photos are not embedded in the page: each <img> carries a tiny blurred placeholder whose URL
ends in "#k=<name>", and the real pictures arrive a moment later from the page's media pack
(module.html on the live site, photo files in the offline preview), so the text shows at once
and the pack is kept on the device like the page itself.
"""
import base64, html, io, json, os, pathlib, random, re

from PIL import Image

import road_svg
from pack import pack

esc = html.escape
PHOTO_W, PHOTO_Q = 640, 62      # what a page shows (and zooms): reefer digits stay readable at 640
LQIP_W, LQIP_Q = 20, 40         # the blurred placeholder inline in the page
BLANK = "....."                 # what an empty blank copies as: the team's own templates use dots
TO = {"broker": "TO THE BROKER · EMAIL", "group": "IN THE DRIVER'S GROUP", "driver": "TO THE DRIVER · IN THE GROUP"}
SRC_TAG = {"team": "TEAM TEMPLATE", "course": "COURSE WORDING"}
CALLOUT = {"tip": ("gray", "Note"), "warn": ("red", "Careful")}
DRILL_KIND = {"choice": "PICK ONE", "order": "PUT IN ORDER", "write": "WRITE IT", "number": "WORK IT OUT",
              "cloze": "FILL THE BLANKS", "spot": "FIND THE MISTAKE", "sort": "SORT THEM"}
ASK_EXAMPLES = ["What do I send the broker for a van pickup?", "The box temperature is far from the set point", "How many load locks for short pallets?",
                "The broker does not answer about the lumper fee", "When do I send the POD?", "What is SLC?", "The steer axle is 12,300 lb", "Who do I tag for a reefer alarm?"]


def md(s):
    """Escape, then **bold**."""
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", esc(s))


# Pictures with a white background or a drawing on them: shown whole in their tile, not cropped to fill it.
FIT = {"tandem-slide", "tandem-backward", "zones", "us-interstates", "us-topography", "flatbed", "step-deck", "rgn", "van-outside", "reefer-outside",
       "headache-rack", "lumber-tarp", "winch-bar", "gear-dot-decal", "gear-dunnage-bags", "gear-flatbed-chains", "gear-hook-drop", "gear-load-bars",
       "gear-pallet-jack", "gear-ratchet-straps", "gear-sleeper-truck", "gear-trailer-lock"}


def short(label):
    """Field label -> the word shown in a blank: "Amount ($)" -> "amount"."""
    return re.sub(r"\s*\(.*?\)", "", label).lower()


def blanks(text, fields):
    """Template text -> HTML: each {field} is a dotted blank that names what goes there."""
    out = []
    for part in re.split(r"(\{[a-z_]+\})", text):
        m = re.fullmatch(r"\{([a-z_]+)\}", part)
        if m:
            lab = fields.get(m.group(1), m.group(1))
            out.append(f'<span class="blank" title="{esc(lab)}">{BLANK}<small>{esc(short(lab))}</small></span>')
        else:
            out.append(esc(part))
    return "".join(out).replace("\n", "<br>")


def copy_text(text):
    """What the Copy button puts on the clipboard: the template with every blank as dots."""
    return re.sub(r"\{[a-z_]+\}", BLANK, text)


def js_data(obj):
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


def plain(s):
    """Markup-free text for the search index."""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s)).replace("**", "").strip()


class Road:
    def __init__(self, src, catalog_text, shell, toc_script, widgets=None):
        self.src, self.shell, self.toc_script, self.widgets = src / "road", shell, toc_script, widgets or {}
        load = lambda n: json.loads((self.src / n).read_text(encoding="utf-8"))
        self.msgs = load("messages.json")
        self.fields = self.msgs["fields"]
        self.by_id = {m["id"]: m for m in self.msgs["messages"]}
        self.groups = {g["id"]: g for g in self.msgs["groups"]}
        self.glossary = load("glossary.json")
        self.gloss = {t[0]: t[1] for t in self.glossary["terms"]}
        self.teams = load("teams.json")
        self.customers = load("customers.json")
        self.stops = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((self.src / "stops").glob("*.json"))]
        # Catalog titles for "Look it up" links: one item per line in ugl-catalog.js.
        self.cat = {m.group(1): {"title": m.group(2), "desc": m.group(3)} for m in re.finditer(
            r"\{\s*id:\s*'([^']+)'.*?title:\s*'((?:[^'\\]|\\.)*)'.*?desc:\s*'((?:[^'\\]|\\.)*)'", catalog_text)}
        self._photo = {}   # name -> (bytes for the pack, placeholder src, width, height)
        self._used = []    # photos the page being built refers to, in page order
        self.check()

    # ------------------------------------------------------------------ checks
    def check(self):
        """Everything the stops refer to exists, and the drills cannot be guessed from their shape."""
        bad = []
        def fields_ok(text, where):
            for f in re.findall(r"\{([a-z_]+)\}", text):
                if f not in self.fields: bad.append(f"{where}: unknown blank {{{f}}}")
        for st in self.stops:
            for sec in ("learn", "real"):
                for b in st[sec]:
                    for m in b.get("msgs", []):
                        if m not in self.by_id: bad.append(f"{st['id']}: unknown message {m}")
                    for name, _ in b.get("photos", []):
                        if not (self.src / "photos" / f"{name}.webp").exists(): bad.append(f"{st['id']}: missing photo {name}")
                    for t in b.get("terms", []):
                        if t not in self.gloss: bad.append(f"{st['id']}: term not in the glossary: {t}")
                    if "diagram" in b and b["diagram"] not in road_svg.DIAGRAMS: bad.append(f"{st['id']}: unknown diagram {b['diagram']}")
                    if "widget" in b and b["widget"] not in self.widgets: bad.append(f"{st['id']}: unknown widget {b['widget']}")
            for k, d in enumerate(st["drills"], 1):
                where = f"{st['id']} drill {k}"
                if d["type"] not in DRILL_KIND: bad.append(f"{where}: unknown type {d['type']}"); continue
                if d["type"] == "choice":
                    right = [o for o in d["opts"] if o[1]]; wrong = [o for o in d["opts"] if not o[1]]
                    if len(right) != 1: bad.append(f"{where}: needs exactly one right option")
                    if not os.environ.get("UGL_SKIP_LINT"):  # the drill-shape rules; skipped only for a quick technical build
                        if len(d["opts"]) < 3: bad.append(f"{where}: fewer than 3 options (a coin flip)")
                        # The right answer must not stand out as the long one.
                        if right and wrong and len(right[0][0]) > 1.15 * max(len(o[0]) for o in wrong) + 10:
                            bad.append(f"{where}: the right answer is much longer than every wrong one")
                if d["type"] == "order" and len(d["items"]) < 3: bad.append(f"{where}: fewer than 3 items")
                if d["type"] == "write":
                    if d["model"] not in self.by_id: fields_ok(d["model"], where)
                if d["type"] == "cloze" and len(re.findall(r"\{[^{}]+\}", d["tpl"])) < 1: bad.append(f"{where}: no blank in the template")
                if d["type"] == "spot" and not (0 <= d["bad"] < len(d["lines"])): bad.append(f"{where}: bad line index")
                if d["type"] == "sort" and (len(d["buckets"]) != 2 or len(d["items"]) < 3 or any(x[1] not in (0, 1) for x in d["items"])): bad.append(f"{where}: needs 2 buckets and 3+ items")
                for r in d.get("need", []) + d.get("never", []): re.compile(r[0], re.I)
            for t in st["tools"]:
                if t[0] not in self.cat: bad.append(f"{st['id']}: look-it-up link to unknown item {t[0]}")
        for m in self.msgs["messages"]:
            if m["group"] not in self.groups: bad.append(f"{m['id']}: unknown group")
            if m["to"] not in TO or m["src"] not in SRC_TAG: bad.append(f"{m['id']}: bad to/src")
            fields_ok(m["text"], m["id"])
        for c in self.customers["customers"]:
            for case in c["cases"]:
                if "msg" in case:
                    if case["msg"] not in self.by_id: bad.append(f"{c['id']}/{case['id']}: unknown message")
                else: fields_ok(case["text"], f"{c['id']}/{case['id']}")
        if bad: raise SystemExit("sources/road problems:\n  " + "\n  ".join(bad))

    # ------------------------------------------------------------------ photos
    def photo(self, name):
        """The page-size picture for the pack and the blurred placeholder shown until it arrives."""
        if name not in self._photo:
            im = Image.open(self.src / "photos" / f"{name}.webp").convert("RGB")
            if im.width > PHOTO_W: im = im.resize((PHOTO_W, round(im.height * PHOTO_W / im.width)), Image.LANCZOS)
            full, tiny = io.BytesIO(), io.BytesIO()
            im.save(full, "WEBP", quality=PHOTO_Q, method=4)
            im.resize((LQIP_W, max(1, round(im.height * LQIP_W / im.width))), Image.LANCZOS).save(tiny, "WEBP", quality=LQIP_Q, method=4)
            self._photo[name] = (full.getvalue(), "data:image/webp;base64," + base64.b64encode(tiny.getvalue()).decode(), im.width, im.height)
        return self._photo[name]

    def img(self, name, alt=""):
        data, lqip, w, h = self.photo(name)
        if name not in self._used: self._used.append(name)
        return f'<img class="ph-img" src="{lqip}#k={name}" width="{w}" height="{h}" alt="{esc(alt)}" data-zoom>'

    def media_pack(self):
        """The pack for the page just built (pictures in page order), and a clean slate for the next one."""
        used, self._used = self._used, []
        return pack({n: (self.photo(n)[0], "image/webp") for n in used}) if used else None

    # ------------------------------------------------------------------ blocks
    def msg_card(self, m, when=True):
        """A template card: the text with dotted blanks, what to attach, and a Copy button. The text may be
        selected and copied by hand too (data-copy-ok tells the copy guard it is meant to be pasted)."""
        attach = "".join(f"<span>{esc(a)}</span>" for a in m.get("attach", []))
        never = "".join(f'<span class="no">{esc(a)}</span>' for a in m.get("never", []))
        chips = (f'<div class="msg__att"><small>ATTACH</small>{attach}</div>' if attach else "") + \
                (f'<div class="msg__att"><small>NEVER</small>{never}</div>' if never else "")
        return (f'<article class="msg msg--{m["to"]}" id="msg-{m["id"]}" data-msg="{m["id"]}"><div class="msg__top"><span>{TO[m["to"]]}</span><span class="msg__src">{SRC_TAG[m["src"]]}</span></div>'
                f'<div class="msg__head"><h4>{esc(m["title"])}</h4><button type="button" class="btn msg__copy" data-copy="{esc(copy_text(m["text"]))}" aria-label="Copy: {esc(m["title"])}">Copy</button></div>'
                + (f'<p class="msg__when">{md(m["when"])}</p>' if when and m.get("when") else "")
                + f'<div class="msg__text" data-copy-ok>{blanks(m["text"], self.fields)}</div>{chips}</article>')

    def block(self, b):
        if "p" in b: return f"<p>{md(b['p'])}</p>"
        if "h" in b: return f'<h3 class="sub" id="{esc(b.get("id", ""))}">{esc(b["h"])}</h3>' if b.get("id") else f'<h3 class="sub">{esc(b["h"])}</h3>'
        if "rule" in b: return f'<div class="gate"><b>RULE</b><span>{md(b["rule"])}</span></div>'
        for k, (cls, default) in CALLOUT.items():
            if k in b: return f'<div class="callout callout--{cls}"><b>{esc(b.get("t", default))}</b><p>{md(b[k])}</p></div>'
        if "list" in b: return '<ul class="plain plain--doc">' + "".join(f"<li>{md(x)}</li>" for x in b["list"]) + "</ul>"
        if "steps" in b:
            return '<ol class="numlist">' + "".join(
                f'<li><span class="nl-n">{i}</span><span><b>{md(t)}</b>{(" " + md(d)) if d else ""}</span></li>' for i, (t, d) in enumerate(b["steps"], 1)) + "</ol>"
        if "by" in b:
            return '<div class="by">' + "".join(
                f'<div class="by__col"><h4>{esc(t)}</h4><ul>' + "".join(f"<li>{md(x)}</li>" for x in xs) + "</ul></div>" for t, xs in b["by"]) + "</div>"
        if "table" in b:
            t = b["table"]
            return ('<div class="tbl-wrap"><table class="tbl tbl--doc"><thead><tr>' + "".join(f"<th>{esc(h)}</th>" for h in t["head"]) + "</tr></thead><tbody>"
                    + "".join("<tr>" + "".join(f"<td>{md(c)}</td>" for c in r) + "</tr>" for r in t["rows"]) + "</tbody></table></div>")
        if "photos" in b:
            return '<div class="ph-grid">' + "".join(
                f'<figure class="shot ph{" ph--fit" if n in FIT else ""}">{self.img(n, alt=c)}<figcaption>{esc(c)}</figcaption></figure>' for n, c in b["photos"]) + "</div>"
        if "msgs" in b: return '<div class="msgs">' + "".join(self.msg_card(self.by_id[i]) for i in b["msgs"]) + "</div>"
        if "videos" in b:
            return '<div class="vids">' + "".join(
                f'<a class="vid" href="{esc(u)}" target="_blank" rel="noopener"><span class="vid__play" aria-hidden="true"></span><span><b>{esc(t)}</b><small>{esc(s)}</small></span></a>' for u, t, s in b["videos"]) + "</div>"
        if "stats" in b:
            head = f'<h4 class="stats__k">{esc(b["t"])}</h4>' if b.get("t") else ""
            return head + '<div class="road-stats">' + "".join(f'<div class="stat"><small>{esc(l)}</small><b>{esc(v)}</b><span>{esc(s)}</span></div>' for v, l, s in b["stats"]) + "</div>"
        if "timeline" in b:
            return '<ol class="tline">' + "".join(
                f'<li><span class="tline__t">{esc(t)}</span><div><b>{esc(h)}</b><p>{md(d)}</p></div></li>' for t, h, d in b["timeline"]) + "</ol>"
        if "terms" in b:
            return '<dl class="gloss">' + "".join(f"<dt>{esc(t)}</dt><dd>{esc(self.gloss[t])}</dd>" for t in b["terms"]) + "</dl>"
        if "pre" in b: return f'<figure class="pre"><figcaption>{esc(b.get("t", ""))}</figcaption><pre>{esc(b["pre"])}</pre></figure>'
        if "pres" in b: return '<div class="pres">' + "".join(f'<figure class="pre"><figcaption>{esc(t)}</figcaption><pre>{esc(x)}</pre></figure>' for t, x in b["pres"]) + "</div>"
        if "chat" in b:
            return (f'<figure class="tg"><figcaption>{esc(b.get("t", ""))}</figcaption>' + "".join(
                f'<div class="tg__m{" tg__m--me" if who == "Updater" else ""}"><small>{esc(who)}</small>{esc(t)}</div>' for who, t in b["chat"]) + "</figure>")
        if "ticket" in b:
            s, d, t = b["ticket"]; g = s + d + t
            row = lambda k, v, lim: f'<div class="ticket__r{" is-over" if v > lim else ""}"><span>{k}</span><b>{v:,} lb</b></div>'
            return (f'<figure class="ticket"><div class="ticket__h">SCALE TICKET <small>{esc(b.get("k", "EXAMPLE"))}</small></div>{row("STEER AXLE", s, 12400)}{row("DRIVE AXLE", d, 34000)}'
                    f'{row("TRAILER AXLE", t, 34000)}{row("GROSS WEIGHT", g, 80000)}<figcaption>{esc(b.get("t", ""))}</figcaption></figure>')
        if "tickets" in b: return '<div class="tickets">' + "".join(self.block({"ticket": x[0], "k": x[1], "t": x[2]}) for x in b["tickets"]) + "</div>"
        if "routes" in b:
            return f'<figure class="dg dg--routes">{road_svg.routes(b["routes"])}<figcaption>{md(b.get("t", ""))}</figcaption></figure>'
        if "diagram" in b or "zones" in b:
            name = b.get("diagram", "zones")
            cap = f'<figcaption>{md(b["t"])}</figcaption>' if b.get("t") else ""
            return f'<figure class="dg dg--{esc(name)}">{road_svg.DIAGRAMS[name]()}{cap}</figure>'
        if "widget" in b:
            return f'<div class="widget" id="widget-{esc(b["widget"])}">{self.widgets[b["widget"]][0]}</div>'
        raise ValueError(b)

    # ------------------------------------------------------------------ drills
    def drill(self, d, i, n, seed):
        rnd = random.Random(f"{seed}:{i}")
        head = f'<div class="drill__top"><span>DRILL {i + 1} / {n}</span><span>{DRILL_KIND[d["type"]]}</span></div><p class="drill__q">{md(d["q"])}</p>'
        if d.get("img"): head += f'<figure class="shot ph drill__img">{self.img(d["img"])}</figure>'
        data = {"type": d["type"]}
        why = md(d["why"]) if d.get("why") else ""
        if d["type"] == "choice":
            opts = list(enumerate(d["opts"])); rnd.shuffle(opts)
            body = '<div class="drill__opts">' + "".join(f'<button type="button" class="opt" data-o="{k}">{md(o[0])}</button>' for k, o in opts) + "</div>"
            data["opts"] = [[o[1], md(o[2])] for o in d["opts"]]
        elif d["type"] == "order":
            idx = list(range(len(d["items"])))
            while idx == sorted(idx): rnd.shuffle(idx)
            body = '<ol class="drill__order">' + "".join(
                f'<li data-k="{k}"><span class="ord__n"></span><span class="ord__t">{md(d["items"][k])}</span><span class="ord__b"><button type="button" data-mv="-1" aria-label="Move up">↑</button><button type="button" data-mv="1" aria-label="Move down">↓</button></span></li>' for k in idx) + "</ol>"
            body += '<button type="button" class="btn drill__check">Check the order</button>'
            data["why"] = why
        elif d["type"] == "number":
            body = f'<div class="drill__num"><input type="number" inputmode="decimal" aria-label="Your answer"><span>{esc(d.get("unit", ""))}</span><button type="button" class="btn drill__check">Check</button></div>'
            data.update(answer=d["answer"], tol=d.get("tol", 0), why=why, hint=md(d["hint"]) if d.get("hint") else "")
        elif d["type"] == "cloze":
            parts, answers = [], []
            for part in re.split(r"(\{[^{}]+\})", d["tpl"]):
                m = re.fullmatch(r"\{([^{}]+)\}", part)
                if m:
                    acc = [a.strip() for a in m.group(1).split("|")]
                    answers.append(acc)
                    parts.append(f'<input class="cloze" data-k="{len(answers) - 1}" size="{max(4, len(acc[0]) + 2)}" autocomplete="off" aria-label="Blank {len(answers)}">')
                else:
                    parts.append(esc(part).replace("\n", "<br>"))
            body = f'<div class="cloze__text" data-copy-ok>{"".join(parts)}</div><button type="button" class="btn drill__check">Check the blanks</button>'
            data.update(blanks=answers, why=why)
        elif d["type"] == "spot":
            body = '<div class="spot">' + "".join(f'<button type="button" class="spot__line" data-k="{k}">{esc(l)}</button>' for k, l in enumerate(d["lines"])) + "</div>"
            data.update(bad=d["bad"], why=why)
        elif d["type"] == "sort":
            idx = list(range(len(d["items"]))); rnd.shuffle(idx)
            bk = "".join(f'<button type="button" data-b="{j}">{esc(x)}</button>' for j, x in enumerate(d["buckets"]))
            body = ('<div class="sort">' + "".join(f'<div class="sort__row"><span>{md(d["items"][k][0])}</span><span class="sort__b">{bk}</span></div>' for k in idx)
                    + '</div><button type="button" class="btn drill__check">Check</button>')
            data.update(items=[d["items"][k] for k in idx], why=why)
        else:
            body = ('<textarea class="drill__text" rows="6" spellcheck="true" aria-label="Your message" placeholder="Write the message as you would send it, in the team\'s wording…"></textarea>'
                    '<button type="button" class="btn drill__check">Check my message</button>')
            model = self.by_id[d["model"]]["text"] if d["model"] in self.by_id else d["model"]
            model = re.sub(r"\{([a-z_]+)\}", lambda m: "[" + short(self.fields.get(m.group(1), m.group(1))) + "]", model)
            data.update(need=d["need"], never=d.get("never", []), model=model)
        return (f'<article class="drill drill--{d["type"]}{" has-img" if d.get("img") else ""}" data-i="{i}"><script type="application/json">{js_data(data)}</script>{head}{body}'
                f'<div class="drill__fb" aria-live="polite"></div></article>')

    # ------------------------------------------------------------------ pages
    def stop_num(self, st):
        return "PO" if st["n"] == "po" else str(st["n"])

    def strip(self, cur):
        return '<nav class="roadstrip" aria-label="The life of a load">' + "".join(
            f'<a href="module.html?m={s["id"]}" data-stop="{s["id"]}"{" class=is-on aria-current=page" if s["id"] == cur else ""}><b>{self.stop_num(s)}</b><span>{esc(s["short"])}</span></a>'
            for s in self.stops) + "</nav>"

    def stop_page(self, k):
        st = self.stops[k]
        nd = len(st["drills"])
        learn, subs = self.numbered("".join(self.block(b) for b in st["learn"]), "learn", 1)
        real = "".join(self.block(b) for b in st["real"])
        drills = "".join(self.drill(d, i, nd, st["id"]) for i, d in enumerate(st["drills"]))
        tools = '<div class="lookup">' + "".join(
            f'<a class="lookup__a" href="module.html?m={t[0]}{("#" + t[2]) if len(t) > 2 and t[2] else ""}"><b>{esc(self.cat[t[0]]["title"])}</b><span>{esc(t[1])}</span></a>' for t in st["tools"]) + "</div>"
        prv = self.stops[k - 1] if k else None
        nxt = self.stops[k + 1] if k + 1 < len(self.stops) else None
        foot = '<div class="stop-foot">' + (f'<a class="prevstop" href="module.html?m={prv["id"]}">← {esc(prv["short"])}</a>' if prv else "<span></span>") + (
            f'<a class="nextstop" href="module.html?m={nxt["id"]}"><small>NEXT STOP</small><b>{esc(nxt["title"])}</b><span aria-hidden="true">→</span></a>' if nxt
            else '<a class="nextstop" href="index.html#course"><small>END OF THE ROAD</small><b>Back to the course</b><span aria-hidden="true">→</span></a>') + "</div>"
        part = lambda n, t, s: f'<h2><span class="part">{n}</span>{t}</h2><p class="part__lead">{s}</p>'
        body = (f'<section class="sec" id="learn">{part(1, "Learn", "What you do at this stage, and why.")}{learn}</section>'
                f'<section class="sec" id="real">{part(2, "See it real", "The team&#39;s own messages and pictures for this moment. Copy copies the template.")}{real}</section>'
                f'<section class="sec" id="drills">{part(3, "Do it", "Answer each one. Wrong the first time? Read why, then try again. Finish them all to mark the stop as read.")}{drills}'
                f'<div class="drill-score" id="drill-score"></div></section>'
                f'<section class="sec" id="tools">{part(4, "Look it up", "The tools and files for this stage.")}{tools}</section>{foot}')
        half = re.fullmatch(r"(\d+)([a-z])", str(st["n"]))  # a stage split in two pages: 3a, 3b
        stage = ("START HERE" if st["n"] == 0 else "POWER ONLY" if st["n"] == "po"
                 else f"STAGE {half.group(1)} OF 8 · PART {half.group(2).upper()}" if half else f"STAGE {st['n']} OF 8")
        num = self.stop_num(st)
        before = f'<div class="mile" aria-hidden="true">{num}</div>' + self.strip(st["id"])
        widgets = "".join(self.widgets[b["widget"]][1] for b in st["learn"] + st["real"] if "widget" in b)
        script = (self.toc_script + '<script src="ugl-road.js"></script>'
                  + f"<script>window.UGL_DRILL_KEY={json.dumps(st['id'])};UGLRoadDrills();</script>" + widgets)
        return self.shell(st["title"], "THE LIFE OF A LOAD · " + stage, esc(st["lead"]), body,
                          chips=[f"~{st['minutes']} MIN", f"{nd} DRILLS"], script=script, before=before,
                          toc=[("learn", "1 · Learn")] + subs + [("real", "2 · See it real"), ("drills", "3 · Do it"), ("tools", "4 · Look it up")])

    def numbered(self, html_, sec, n):
        """The sub-heads of a part get a number (1.1, 1.2 …) and an id, and come back as TOC entries (id, title, "sub")."""
        subs = []
        def rep(m):
            k = len(subs) + 1
            i = m.group(1) or f"{sec}-{k}"
            subs.append((i, html.unescape(m.group(2)), "sub"))
            return f'<h3 class="sub chk" id="{i}" data-n="{n}.{k}">'
        return re.sub(r'<h3 class="sub"(?: id="([^"]*)")?>(?=([^<]*)</h3>)', rep, html_), subs

    def tool(self, title, eyebrow, lead, init, data, chips=(), body='<div id="tool"></div>'):
        script = f'<script src="ugl-road.js"></script><script>window.UGL_TOOL={js_data(data)};UGLRoad.{init}(window.UGL_TOOL);</script>'
        return self.shell(title, eyebrow, lead, body, chips=chips, script=script)

    def message_builder(self):
        msgs = [{"id": m["id"], "group": m["group"], "title": m["title"], "when": m.get("when", ""), "text": copy_text(m["text"]), "find": m.get("find", ""),
                 "html": self.msg_card(m)} for m in self.msgs["messages"]]
        groups = [{"id": g["id"], "title": g["title"], "note": md(g["note"]) if g.get("note") else ""} for g in self.msgs["groups"]]
        return self.tool("Message Builder", "ON A LOAD", "Every message the team sends, ready to copy. Find the moment, press Copy, paste it in Gmail or Telegram and fill in the dots.",
                         "builder", {"groups": groups, "messages": msgs}, chips=[f"{len(msgs)} MESSAGES", "ONE TAP TO COPY"])

    def efs(self):
        return self.tool("EFS Request Builder", "ON A LOAD", "The request in the EFS group's format: company expense or load fee, with the proof each one needs.",
                         "efs", {}, chips=["2 FORMATS", "COPY READY"])

    def fees(self):
        t = lambda i: self.by_id[i]["text"]
        return self.tool("Lumper and Late Fees", "ON A LOAD", "The facility wants a fee paid. Follow it step by step: the clocks tell you when to call and when to request an EFS.",
                         "fees", {"ask": t("fee-ask"), "reimburse": t("fee-reimburse"), "receipt": t("fee-receipt")}, chips=["STEP BY STEP", "5 · 20 MIN CLOCKS"])

    def customer_rules(self):
        cs = []
        for c in self.customers["customers"]:
            cases = []
            for case in c["cases"]:
                text, src = (self.by_id[case["msg"]]["text"], self.by_id[case["msg"]]["src"]) if "msg" in case else (case["text"], case.get("src", "course"))
                cases.append({"t": case["t"], "need": case["need"], "html": blanks(text, self.fields), "copy": copy_text(text), "src": SRC_TAG[src]})
            cs.append({"name": c["name"], "what": c["what"], "rules": [md(r) for r in c["rules"]], "cases": cases})
        return self.tool("Customer Rules", "ON A LOAD", "Customers with their own rules for pickups and drop-offs. Pick the customer: every case has what to collect and the message to copy.",
                         "customers", {"customers": cs}, chips=[f"{len(cs)} CUSTOMERS"])

    def glossary_page(self):
        g = self.glossary
        return self.tool("Glossary", "REFERENCE", "Every word and abbreviation the team uses, in plain English.", "glossary",
                         {"terms": g["terms"], "groups": g["groups"]}, chips=[f"{len(g['terms'])} TERMS"])

    def who_page(self):
        t = self.teams
        cards = []
        for tm in t["teams"]:
            items = "".join(f"<li>{esc(x)}</li>" for x in tm["for"])
            badge = '<span class="who__tbc">TO CONFIRM</span>' if tm.get("confirm") else ""
            tag = f'<code>{esc(tm["tag"])}</code>' if tm.get("tag") else ""
            note = '<p class="who__note">What to tag this team for will be added by your manager.</p>' if tm.get("confirm") and not tm["for"] else ""
            cards.append(f'<article class="card who" data-s="{esc((tm["name"] + " " + " ".join(tm["for"])).lower())}"><h3>{esc(tm["name"])}{badge}</h3>{tag}'
                         + (f"<ul>{items}</ul>" if items else "") + f"{note}</article>")
        body = ('<input class="search" id="q" type="search" placeholder="What is happening? e.g. alarm, fuel, logbook" autocomplete="off" aria-label="Search">'
                f'<div class="callout callout--gray"><b>Broker after-hours sheet</b><p>{esc(t["broker_sheet"])}</p></div>'
                f'<div class="sg" id="who">{"".join(cards)}</div><p class="empty" id="none" style="display:none">NOTHING MATCHES. ASK YOUR MANAGER.</p>')
        return self.tool("Who to Tag", "REFERENCE", "Which team handles what. Search for what is happening on the load.", "who", {},
                         chips=[f"{len(t['teams'])} TEAMS"], body=body)

    # ------------------------------------------------------------------ Ask the Course: the search index
    def passages(self, extra=()):
        """Short passages with a title and a link, for the search box and the AI helper."""
        out = []
        def add(t, u, x):
            x = plain(x)
            if not x: return
            # Long passages are split so each one stays focused (and small for the model).
            while len(x) > 700:
                cut = x.rfind(". ", 300, 700); cut = cut + 1 if cut > 0 else 700
                out.append({"t": t, "u": u, "x": x[:cut].strip()}); x = x[cut:].strip()
            out.append({"t": t, "u": u, "x": x})
        def block_text(b):
            if "p" in b: return b["p"]
            if "rule" in b: return "Rule: " + b["rule"]
            for k in CALLOUT:
                if k in b: return b.get("t", "") + ": " + b[k]
            if "list" in b: return " ".join(b["list"])
            if "steps" in b: return " ".join(f"{t}: {d}" for t, d in b["steps"])
            if "by" in b: return " ".join(f"{t}: {'; '.join(xs)}" for t, xs in b["by"])
            if "table" in b: return " ".join(" — ".join(r) for r in b["table"]["rows"])
            if "timeline" in b: return " ".join(f"{t} {h}: {d}" for t, h, d in b["timeline"])
            if "stats" in b: return " ".join(f"{l} {v}: {s}" for v, l, s in b["stats"])
            if "pre" in b: return b["pre"]
            if "pres" in b: return " ".join(x for _, x in b["pres"])
            if "terms" in b: return " ".join(f"{t}: {self.gloss[t]}" for t in b["terms"])
            return b.get("t", "") if ("diagram" in b or "routes" in b or "photos" in b) else ""
        for st in self.stops:
            num = self.stop_num(st)
            head, buf = None, [st["lead"]]
            def flush():
                if buf: add(f"Stop {num} · {st['title']}" + (f" · {head}" if head else ""), f"module.html?m={st['id']}#learn", " ".join(buf))
            for b in st["learn"]:
                if "h" in b:
                    flush(); head, buf = b["h"], []
                else:
                    buf.append(block_text(b))
            flush()
        for m in self.msgs["messages"]:
            add(f"Message: {m['title']} ({self.groups[m['group']]['title']})", f"module.html?m=message-builder#{m['id']}", f"{m.get('when', '')} Template: {copy_text(m['text'])}")
        for t, d, _ in self.glossary["terms"]:
            add(f"Word: {t}", "module.html?m=glossary", d)
        for tm in self.teams["teams"]:
            if tm["for"]: add(f"Who to tag: {tm['name']}", "module.html?m=who-to-tag", " ".join(tm["for"]))
        for c in self.customers["customers"]:
            add(f"{c['name']} rules", "module.html?m=customer-rules", " ".join(c["rules"]))
            for case in c["cases"]:
                text = self.by_id[case["msg"]]["text"] if "msg" in case else case["text"]
                add(f"{c['name']}: {case['t']}", "module.html?m=customer-rules", "Collect: " + "; ".join(case["need"]) + ". Message: " + copy_text(text))
        for t, u, x in extra:
            add(t, u, x)
        for i, p in enumerate(out): p["id"] = f"p{i}"
        return out

    def ask_page(self, passages):
        return self.tool("Ask the Course", "HELP", "Type what is happening or what you want to know. The course answers with the passage that covers it; on the live site an AI helper can explain it, from the course only.",
                         "ask", {"passages": passages, "examples": ASK_EXAMPLES}, chips=[f"{len(passages)} PASSAGES", "COURSE ONLY"])

    def pages(self, extra_passages=()):
        """{'pages/<name>.html': html, 'media/<name>.pack': bytes, 'ask/index.json': json}."""
        out = {}
        for k, s in enumerate(self.stops):
            out[f"pages/{s['id']}.html"] = self.stop_page(k)
            mp = self.media_pack()
            if mp: out[f"media/{s['id']}.pack"] = mp
        for name, build in (("message-builder", self.message_builder), ("efs-request", self.efs), ("fee-flow", self.fees),
                            ("customer-rules", self.customer_rules), ("glossary", self.glossary_page), ("who-to-tag", self.who_page)):
            out[f"pages/{name}.html"] = build()
            assert not self._used, name
        ps = self.passages(extra_passages)
        out["pages/ask.html"] = self.ask_page(ps)
        out["ask/index.json"] = json.dumps({"passages": ps}, ensure_ascii=False)
        return out

    def media_pages(self):
        """Catalog ids of the stops that come with a media pack (module.html starts that download with the page)."""
        return [s["id"] for s in self.stops if any("photos" in b for b in s["learn"] + s["real"]) or any(d.get("img") for d in s["drills"])]
