"""The road: the course rebuilt around the life of a load, plus the tools that go with it.

Called from build_content.py. Reads sources/road/ in the private content repo:
  stops/*.json      one file per stop (Learn / See it real / Do it / Look it up)
  messages.json     every message template, shared by the stops and the Message builder
  glossary.json, teams.json, customers.json
  photos/*.webp     embedded into the pages that use them
and returns {page file name: html}. The page JavaScript lives in tools/road/*.js.
"""
import base64, html, json, pathlib, random, re

esc = html.escape
HERE = pathlib.Path(__file__).resolve().parent
JS = {n: (HERE / "road" / f"{n}.js").read_text(encoding="utf-8") for n in ("drills", "tools")}
TO = {"broker": "TO THE BROKER · EMAIL", "group": "IN THE DRIVER'S GROUP"}
SRC_TAG = {"team": "TEAM TEMPLATE", "course": "COURSE WORDING"}


def md(s):
    """Escape, then **bold**."""
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", esc(s))


def short(label):
    """Field label -> the word shown in a blank: "Amount ($)" -> "amount"."""
    return re.sub(r"\s*\(.*?\)", "", label).lower()


def blanks(text, fields):
    """Template text -> HTML with each {field} shown as a labelled blank."""
    out = []
    for part in re.split(r"(\{[a-z_]+\})", text):
        m = re.fullmatch(r"\{([a-z_]+)\}", part)
        out.append(f'<span class="blank">{esc(short(fields.get(m.group(1), m.group(1))))}</span>' if m else esc(part))
    return "".join(out).replace("\n", "<br>")


def js_data(obj):
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


class Road:
    def __init__(self, src, catalog_text, shell, toc_script):
        self.src, self.shell, self.toc_script = src / "road", shell, toc_script
        load = lambda n: json.loads((self.src / n).read_text(encoding="utf-8"))
        self.msgs = load("messages.json")
        self.fields = self.msgs["fields"]
        self.by_id = {m["id"]: m for m in self.msgs["messages"]}
        self.glossary = load("glossary.json")
        self.teams = load("teams.json")
        self.customers = load("customers.json")
        self.stops = [json.loads(p.read_text(encoding="utf-8")) for p in sorted((self.src / "stops").glob("*.json"))]
        # Catalog titles for "Look it up" links: one item per line in ugl-catalog.js.
        self.cat = {m.group(1): {"title": m.group(2), "desc": m.group(3)} for m in re.finditer(
            r"\{\s*id:\s*'([^']+)'.*?title:\s*'((?:[^'\\]|\\.)*)'.*?desc:\s*'((?:[^'\\]|\\.)*)'", catalog_text)}
        self._img = {}
        self.check()

    def check(self):
        for st in self.stops:
            for sec in ("learn", "real"):
                for b in st[sec]:
                    for m in b.get("msgs", []):
                        assert m in self.by_id, (st["id"], m)
                    for name, _ in b.get("photos", []):
                        assert (self.src / "photos" / f"{name}.webp").exists(), name
            for d in st["drills"]:
                assert d["type"] in ("choice", "order", "write", "number"), d
                if d["type"] == "choice": assert sum(1 for o in d["opts"] if o[1]) == 1, d["q"]
                if d["type"] == "write" and d["model"] in self.by_id: pass
                for r in d.get("need", []) + d.get("never", []): re.compile(r[0], re.I)
            for t in st["tools"]:
                assert t[0] in self.cat, (st["id"], t[0])
        for m in self.msgs["messages"]:
            assert m["group"] in {g["id"] for g in self.msgs["groups"]}, m["id"]
            for f in re.findall(r"\{([a-z_]+)\}", m["text"]): assert f in self.fields, (m["id"], f)

    def img(self, name):
        if name not in self._img:
            self._img[name] = "data:image/webp;base64," + base64.b64encode((self.src / "photos" / f"{name}.webp").read_bytes()).decode()
        return self._img[name]

    # ------------------------------------------------------------------ blocks
    def msg_card(self, m, link=True):
        attach = "".join(f"<span>{esc(a)}</span>" for a in m.get("attach", []))
        never = "".join(f'<span class="no">{esc(a)}</span>' for a in m.get("never", []))
        chips = (f'<div class="msg__att"><small>ATTACH</small>{attach}</div>' if attach else "") + \
                (f'<div class="msg__att"><small>NEVER</small>{never}</div>' if never else "")
        go = f'<a class="msg__go" href="module.html?m=message-builder#{m["id"]}">Fill it in →</a>' if link else ""
        return (f'<article class="msg msg--{m["to"]}" id="msg-{m["id"]}"><div class="msg__top"><span>{TO[m["to"]]}</span><span class="msg__src">{SRC_TAG[m["src"]]}</span></div>'
                f'<h4>{esc(m["title"])}</h4><p class="msg__when">{md(m["when"])}</p><div class="msg__text">{blanks(m["text"], self.fields)}</div>{chips}{go}</article>')

    def block(self, b):
        if "p" in b: return f"<p>{md(b['p'])}</p>"
        if "h" in b: return f'<h3 class="sub">{esc(b["h"])}</h3>'
        if "rule" in b: return f'<div class="gate"><b>RULE</b><span>{md(b["rule"])}</span></div>'
        if "tip" in b: return f'<div class="callout callout--gray"><b>{esc(b.get("t", "Note"))}</b><p>{md(b["tip"])}</p></div>'
        if "warn" in b: return f'<div class="callout callout--red"><b>{esc(b.get("t", "Careful"))}</b><p>{md(b["warn"])}</p></div>'
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
                f'<figure class="shot ph"><img src="{self.img(n)}" alt="{esc(c)}" loading="lazy" data-zoom><figcaption>{esc(c)}</figcaption></figure>' for n, c in b["photos"]) + "</div>"
        if "msgs" in b: return '<div class="msgs">' + "".join(self.msg_card(self.by_id[i]) for i in b["msgs"]) + "</div>"
        if "videos" in b:
            return '<div class="vids">' + "".join(
                f'<a class="vid" href="{esc(u)}" target="_blank" rel="noopener"><span class="vid__play" aria-hidden="true"></span><span><b>{esc(t)}</b><small>{esc(s)}</small></span></a>' for u, t, s in b["videos"]) + "</div>"
        if "stats" in b:
            return '<div class="road-stats">' + "".join(f'<div class="stat"><small>{esc(l)}</small><b>{esc(v)}</b><span>{esc(s)}</span></div>' for v, l, s in b["stats"]) + "</div>"
        if "timeline" in b:
            return '<ol class="tline">' + "".join(
                f'<li><span class="tline__t">{esc(t)}</span><div><b>{esc(h)}</b><p>{md(d)}</p></div></li>' for t, h, d in b["timeline"]) + "</ol>"
        if "terms" in b:
            g = {t[0]: t[1] for t in self.glossary["terms"]}
            return '<dl class="gloss">' + "".join(f"<dt>{esc(t)}</dt><dd>{esc(g[t])}</dd>" for t in b["terms"]) + "</dl>"
        if "pre" in b: return f'<figure class="pre"><figcaption>{esc(b.get("t", ""))}</figcaption><pre>{esc(b["pre"])}</pre></figure>'
        if "chat" in b:
            return (f'<figure class="tg"><figcaption>{esc(b.get("t", ""))}</figcaption>' + "".join(
                f'<div class="tg__m{" tg__m--me" if who == "Updater" else ""}"><small>{esc(who)}</small>{esc(t)}</div>' for who, t in b["chat"]) + "</figure>")
        if "ticket" in b:
            s, d, t = b["ticket"]; g = s + d + t
            row = lambda k, v, lim: f'<div class="ticket__r{" is-over" if v > lim else ""}"><span>{k}</span><b>{v:,} lb</b></div>'
            return (f'<figure class="ticket"><div class="ticket__h">SCALE TICKET <small>EXAMPLE</small></div>{row("STEER AXLE", s, 12400)}{row("DRIVE AXLE", d, 34000)}'
                    f'{row("TRAILER AXLE", t, 34000)}{row("GROSS WEIGHT", g, 80000)}<figcaption>{esc(b.get("t", ""))}</figcaption></figure>')
        if "zones" in b:
            Z = [("PACIFIC", "PT · PST / PDT", "9:00 AM", "Los Angeles, Seattle, Las Vegas"), ("MOUNTAIN", "MT · MST / MDT", "10:00 AM", "Denver, Phoenix, Salt Lake City"),
                 ("CENTRAL", "CT · CST / CDT", "11:00 AM", "Chicago, Dallas, Kansas City"), ("EASTERN", "ET · EST / EDT", "12:00 PM", "New York, Atlanta, Miami")]
            return ('<div class="zones">' + "".join(f'<div class="zone"><small>{a}</small><b>{c}</b><span>{z}</span><p>{e}</p></div>' for a, z, c, e in Z)
                    + '</div><p class="note">Same moment in all 4 zones. Some states are split between two zones: check the city, not the state.</p>')
        if "routes" in b:
            return '<div class="routes">' + "".join(
                f'<div class="route"><h4>{esc(t)}</h4><ol>' + "".join(f"<li><b>{esc(a)}</b><span>{esc(x)}</span></li>" for a, x in steps) + "</ol></div>" for t, steps in b["routes"]) + "</div>"
        raise ValueError(b)

    # ------------------------------------------------------------------ drills
    def drill(self, d, i, n, seed):
        rnd = random.Random(f"{seed}:{i}")
        kind = {"choice": "PICK ONE", "order": "PUT IN ORDER", "write": "WRITE IT", "number": "WORK IT OUT"}[d["type"]]
        head = f'<div class="drill__top"><span>DRILL {i + 1} / {n}</span><span>{kind}</span></div><p class="drill__q">{md(d["q"])}</p>'
        if d.get("img"): head += f'<figure class="shot ph drill__img"><img src="{self.img(d["img"])}" alt="" data-zoom></figure>'
        data = {"type": d["type"]}
        if d["type"] == "choice":
            opts = list(enumerate(d["opts"])); rnd.shuffle(opts)
            body = '<div class="drill__opts">' + "".join(f'<button type="button" class="opt" data-o="{k}">{md(o[0])}</button>' for k, o in opts) + "</div>"
            data["opts"] = [[o[1], o[2]] for o in d["opts"]]
        elif d["type"] == "order":
            idx = list(range(len(d["items"])))
            while idx == sorted(idx): rnd.shuffle(idx)
            body = '<ol class="drill__order">' + "".join(
                f'<li data-k="{k}"><span class="ord__n"></span><span class="ord__t">{md(d["items"][k])}</span><span class="ord__b"><button type="button" data-mv="-1" aria-label="Move up">↑</button><button type="button" data-mv="1" aria-label="Move down">↓</button></span></li>' for k in idx) + "</ol>"
            body += '<button type="button" class="btn drill__check">Check the order</button>'
        elif d["type"] == "number":
            body = f'<div class="drill__num"><input type="number" inputmode="decimal" aria-label="Your answer"><span>{esc(d.get("unit", ""))}</span><button type="button" class="btn drill__check">Check</button></div>'
            data.update(answer=d["answer"], tol=d.get("tol", 0), why=d.get("why", ""))
        else:
            body = '<textarea class="drill__text" rows="6" spellcheck="true" aria-label="Your message" placeholder="Write the message as you would send it…"></textarea><button type="button" class="btn drill__check">Check my message</button>'
            model = self.by_id[d["model"]]["text"] if d["model"] in self.by_id else d["model"]
            for f, lab in self.fields.items(): model = model.replace("{" + f + "}", "[" + short(lab) + "]")
            data.update(need=d["need"], never=d["never"], model=model)
        return (f'<article class="drill" data-i="{i}"><script type="application/json">{js_data(data)}</script>{head}{body}'
                f'<div class="drill__fb" aria-live="polite"></div></article>')

    # ------------------------------------------------------------------ pages
    def strip(self, cur):
        return '<nav class="roadstrip" aria-label="The life of a load">' + "".join(
            f'<a href="module.html?m={s["id"]}"{" class=is-on aria-current=page" if s["id"] == cur else ""}><b>{"PO" if s["n"] == "po" else s["n"]}</b><span>{esc(s["short"])}</span></a>'
            for s in self.stops) + "</nav>"

    def stop_page(self, k):
        st = self.stops[k]
        nd = len(st["drills"])
        learn = "".join(self.block(b) for b in st["learn"])
        real = "".join(self.block(b) for b in st["real"])
        drills = "".join(self.drill(d, i, nd, st["id"]) for i, d in enumerate(st["drills"]))
        tools = '<div class="lookup">' + "".join(
            f'<a class="lookup__a" href="module.html?m={t[0]}{("#" + t[2]) if len(t) > 2 and t[2] else ""}"><b>{esc(self.cat[t[0]]["title"])}</b><span>{esc(t[1])}</span></a>' for t in st["tools"]) + "</div>"
        nxt = self.stops[k + 1] if k + 1 < len(self.stops) else None
        foot = (f'<a class="nextstop" href="module.html?m={nxt["id"]}"><small>NEXT STOP</small><b>{esc(nxt["title"])}</b><span aria-hidden="true">→</span></a>' if nxt
                else '<a class="nextstop" href="index.html#course"><small>END OF THE ROAD</small><b>Back to the course</b><span aria-hidden="true">→</span></a>')
        part = lambda n, t: f'<h2><span class="part">{n}</span>{t}</h2>'
        body = (f'<section class="sec" id="learn">{part(1, "Learn")}{learn}</section>'
                f'<section class="sec" id="real">{part(2, "See it real")}{real}</section>'
                f'<section class="sec" id="drills">{part(3, "Do it")}<p>Answer each one. Wrong first time? Read why, then try again. Your score stays in this browser.</p>{drills}'
                f'<div class="drill-score" id="drill-score"></div></section>'
                f'<section class="sec" id="tools">{part(4, "Look it up")}{tools}</section>{foot}')
        stage = "START HERE" if st["n"] == 0 else "POWER ONLY" if st["n"] == "po" else f"STAGE {st['n']} OF 8"
        script = (self.toc_script + f"<script>window.UGL_DRILL_KEY={json.dumps(st['id'])};</script><script>{JS['drills']}</script>")
        page = self.shell(st["title"], "THE LIFE OF A LOAD · " + stage, esc(st["lead"]), body,
                          chips=[f"~{st['minutes']} MIN", f"{nd} DRILLS"], script=script,
                          toc=[("learn", "1 · Learn"), ("real", "2 · See it real"), ("drills", "3 · Do it"), ("tools", "4 · Look it up")])
        return page.replace('<div class="layout">', self.strip(st["id"]) + '<div class="layout">', 1)

    def tool(self, title, eyebrow, lead, body, init, data, chips=()):
        script = f"<script>window.UGL_TOOL={js_data(data)};</script><script>{JS['tools']}</script><script>UGLRoad.{init}(window.UGL_TOOL);</script>"
        return self.shell(title, eyebrow, lead, body, chips=chips, script=script)

    def message_builder(self):
        n = len(self.msgs["messages"])
        body = ('<div class="mb"><aside class="mb__list"><input class="search" id="mb-q" type="search" placeholder="Search: traffic, lumper, seal…" autocomplete="off" aria-label="Search messages"><div id="mb-groups"></div></aside>'
                '<div class="mb__main" id="mb-main"></div></div>')
        return self.tool("Message Builder", "ON A LOAD", "Pick the moment, fill in the blanks, copy the message. Every template the team uses, from the road to the shipper to the trailer drop.",
                         body, "builder", {"fields": self.fields, "groups": self.msgs["groups"], "messages": self.msgs["messages"], "to": TO, "src": SRC_TAG},
                         chips=[f"{n} MESSAGES", "COPY READY"])

    def efs(self):
        body = '<div id="efs"></div>'
        return self.tool("EFS Request Builder", "ON A LOAD", "Fill in the request in the EFS group's format. Company expense or load fee, with the proof each one needs.",
                         body, "efs", {}, chips=["2 FORMATS", "COPY READY"])

    def fees(self):
        body = '<div id="fee"></div>'
        return self.tool("Lumper and Late Fees", "ON A LOAD", "The facility wants a fee paid. Follow it step by step: the timers tell you when to call and when to request an EFS.",
                         body, "fees", {"ask": self.by_id["fee-ask"]["text"], "reimburse": self.by_id["fee-reimburse"]["text"], "receipt": self.by_id["fee-receipt"]["text"]},
                         chips=["STEP BY STEP", "5 · 15–20 MIN TIMERS"])

    def customer_rules(self):
        cs = self.customers["customers"]
        for c in cs:
            for case in c["cases"]:
                if "msg" in case: case["text"], case["src"] = self.by_id[case["msg"]]["text"], self.by_id[case["msg"]]["src"]
        body = '<div id="cr"></div>'
        return self.tool("Customer Rules", "ON A LOAD", "Customers with their own rules for pickups and drop-offs. Pick the customer and the case, and get what to collect and the message to send.",
                         body, "customers", {"customers": cs, "fields": self.fields, "src": SRC_TAG}, chips=[f"{len(cs)} CUSTOMERS"])

    def glossary_page(self):
        g = self.glossary
        body = ('<input class="search" id="gl-q" type="search" placeholder="Search a word: SLC, TONU, detention…" autocomplete="off" aria-label="Search the glossary">'
                '<div class="gl-cats" id="gl-cats"></div><div id="gl-out"></div><p class="empty" id="gl-none" style="display:none;margin-top:14px">NO WORDS MATCH</p>')
        return self.tool("Glossary", "REFERENCE", "Every word and abbreviation the team uses, in plain English.", body, "glossary",
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
        body = ('<input class="search" id="who-q" type="search" placeholder="What is happening? e.g. alarm, fuel, logbook" autocomplete="off" aria-label="Search">'
                f'<div class="callout callout--gray"><b>Broker after-hours sheet</b><p>{esc(t["broker_sheet"])}</p></div>'
                f'<div class="sg" id="who">{"".join(cards)}</div><p class="empty" id="who-none" style="display:none;margin-top:14px">NOTHING MATCHES. ASK YOUR MANAGER.</p>')
        return self.tool("Who to Tag", "REFERENCE", "Which team handles what. Search for what is happening on the load.", body, "who", {},
                         chips=[f"{len(t['teams'])} TEAMS"])

    def pages(self):
        out = {f"{s['id']}.html": self.stop_page(k) for k, s in enumerate(self.stops)}
        out.update({"message-builder.html": self.message_builder(), "efs-request.html": self.efs(), "fee-flow.html": self.fees(),
                    "customer-rules.html": self.customer_rules(), "glossary.html": self.glossary_page(), "who-to-tag.html": self.who_page()})
        return out
