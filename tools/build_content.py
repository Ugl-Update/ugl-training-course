#!/usr/bin/env python3
"""Build the private-bucket content from the source documents in sources/.

  python3 tools/build_content.py

Reads sources/ and writes upload-to-supabase/ in the private content repo, by default
../ugl-training-sources next to this repo (override with UGL_SOURCES). The output
mirrors the Supabase 'course' bucket:
  pages/*.html   native pages (policies, tools, references, the road stops: tools/road.py)
  files/*        PDFs shown as downloads
Needs: python-docx and poppler's pdftotext.
"""
import html, json, os, pathlib, re, shutil, subprocess, sys, zlib
import docx
from road import Road

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = pathlib.Path(os.environ.get("UGL_SOURCES", ROOT.parent / "ugl-training-sources"))  # private content repo
SRC = DATA / "sources"
OUT = DATA / "upload-to-supabase"
esc = html.escape

# ---------------------------------------------------------------- page shell
def shell(title, eyebrow, lead, body, chips=(), script="", toc=None, wide=False):
    chip_html = "".join(f'<span class="chip{" chip--red" if c.startswith("!") else ""}">{esc(c.lstrip("!"))}</span>' for c in chips)
    toc_html = ""
    if toc:
        toc_html = '<aside class="toc"><div class="toc__label">ON THIS PAGE</div>' + "".join(
            f'<a href="#{i}">{esc(t)}</a>' for i, t in toc) + "</aside>"
        body = f'<div class="layout">{toc_html}<div>{body}</div></div>'
    return f"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(title)} · Unified Service and Consulting</title>
<link rel="icon" href="favicon.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="ugl-site.css"><link rel="stylesheet" href="ugl-page.css">
</head><body class="ugl-unlocked"><div class="app-shell">
<header class="topbar"><div class="topbar__brand"><img class="topbar__mark" src="assets/unified-logo-icon.png" alt="Unified Service and Consulting">
<div><span class="topbar__title">DISPATCH</span><span class="topbar__sub">/ ACADEMY</span></div></div>
<div class="topbar__right"><a class="back" href="index.html">← ACADEMY</a></div></header>
<main class="page{" page--wide" if wide else ""}"><section class="page-hero"><div class="eyebrow"><i></i>{esc(eyebrow)}</div><h1>{esc(title)}</h1>
<p class="lead">{lead}</p><div class="chips">{chip_html}</div></section>
{body}</main></div>{script}</body></html>
"""

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

# ------------------------------------------------------------ policy parser
SECTIONS = ["Purpose", "Scope", "Policy Statement", "Required Dispatch Procedures",
            "Documentation and Communication", "Policy Compliance", "Exceptions and Safety Escalation"]
GATE_RE = re.compile(r"^\(Dispatcher must not give Good to Go", re.I)
BUL_RE = re.compile(r"^-+\s*(.*)$")
NUM_RE = re.compile(r"^\d+\s*[-.)]\s*(.*)$")

def read_lines(path):
    d = docx.Document(str(path))
    out = []
    for p in d.paragraphs:
        for l in p.text.split("\n"):
            l = l.replace("\xa0", " ").strip()
            if l:
                out.append(l)
    return out

def parse_policy(path):
    L = read_lines(path)
    title = L[0]
    secs, cur, blocks = [], None, None
    i = 1
    def nxt(k=1):
        return L[i + k] if i + k < len(L) else ""
    while i < len(L):
        l = L[i]
        if l in SECTIONS:
            cur = {"h": l, "blocks": []}; secs.append(cur); blocks = cur["blocks"]; i += 1; continue
        if GATE_RE.match(l):
            blocks.append(("gate", l.strip("()"))); i += 1; continue
        if l.rstrip(":") == "Delivery Confirmation" and l.endswith(":") and nxt():
            blocks.append(("quote", "Delivery confirmation", nxt())); i += 2; continue
        m = BUL_RE.match(l)
        if m:
            if blocks and blocks[-1][0] == "ul": blocks[-1][1].append(m.group(1))
            else: blocks.append(("ul", [m.group(1)]))
            i += 1; continue
        m = NUM_RE.match(l)
        if m:
            if blocks and blocks[-1][0] == "ol": blocks[-1][1].append(m.group(1))
            else: blocks.append(("ol", [m.group(1)]))
            i += 1; continue
        if cur and cur["h"] == "Required Dispatch Procedures" and GATE_RE.match(nxt()):
            blocks.append(("phase", l.rstrip(":"))); i += 1; continue
        if l.startswith("((") and l.endswith("))"):
            blocks.append(("sub", l.strip("()"))); i += 1; continue
        n1 = nxt()
        if (cur and cur["h"] == "Required Dispatch Procedures" and n1 and len(l) <= 45
                and not l.endswith((".", ":", ",")) and not GATE_RE.match(n1) and n1 not in SECTIONS):
            blocks.append(("sub", l)); i += 1; continue
        blocks.append(("p", l)); i += 1
    return title, secs

def render_policy(path, trailer):
    title, secs = parse_policy(path)
    key = path.stem
    parts, toc = [], []
    for s in secs:
        sid = slug(s["h"]); toc.append((sid, s["h"]))
        out = [f'<section class="sec" id="{sid}"><h2>{esc(s["h"])}</h2>']
        if s["h"] == "Required Dispatch Procedures":
            out.append('<p class="no-print">Tick steps off as you confirm them. Your progress is saved in this browser only.</p>')
            open_card = False
            for b in s["blocks"]:
                k = b[0]
                if k == "phase":
                    if open_card: out.append("</div>")
                    out.append(f'<div class="card" data-phase><h3>{esc(b[1])}<small data-count></small></h3><div class="progress"><i></i></div>')
                    open_card = True
                elif not open_card:
                    out.append(render_block(b, key, checks=False))
                else:
                    out.append(render_block(b, key, checks=True))
            if open_card: out.append("</div>")
        else:
            for b in s["blocks"]:
                out.append(render_block(b, key, checks=False))
        out.append("</section>")
        parts.append("".join(out))
    n_steps = sum(len(b[1]) for s in secs if s["h"] == "Required Dispatch Procedures" for b in s["blocks"] if b[0] in ("ul", "ol"))
    purpose = next((b[1] for s in secs if s["h"] == "Purpose" for b in s["blocks"] if b[0] == "p"), "")
    script = """<script>
(function(){var key='ugl-checks:'+__KEY__,saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')}catch(e){}
function save(){try{localStorage.setItem(key,JSON.stringify(saved))}catch(e){}}
document.querySelectorAll('[data-phase]').forEach(function(card){
 var boxes=card.querySelectorAll('input[type=checkbox]'),bar=card.querySelector('.progress i'),cnt=card.querySelector('[data-count]');
 function upd(){var n=0;boxes.forEach(function(b){if(b.checked)n++;b.parentNode.classList.toggle('done',b.checked)});
  if(boxes.length){bar.style.width=(n/boxes.length*100)+'%';cnt.textContent=n+' / '+boxes.length}}
 boxes.forEach(function(b){b.checked=!!saved[b.id];b.addEventListener('change',function(){saved[b.id]=b.checked;save();upd()})});upd()});
document.querySelectorAll('.toc a').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();var t=document.getElementById(a.getAttribute('href').slice(1));if(t)t.scrollIntoView({behavior:'smooth'})})});
var links=[].slice.call(document.querySelectorAll('.toc a')),secs=links.map(function(a){return document.getElementById(a.getAttribute('href').slice(1))});
function spy(){var y=window.scrollY+200,on=0;secs.forEach(function(s,i){if(s&&s.offsetTop<=y)on=i});links.forEach(function(a,i){a.classList.toggle('is-on',i===on)})}
window.addEventListener('scroll',spy,{passive:true});spy();
var pb=document.getElementById('print');if(pb)pb.addEventListener('click',function(){window.print()});
})();
</script>""".replace("__KEY__", json.dumps(key))
    body = "".join(parts) + f'<p class="note">{esc(trailer)}</p>'
    return shell(title, "DISPATCH POLICY", esc(purpose),
                 body, chips=[f"{n_steps} CHECKPOINTS", "!NO ‘GOOD TO GO’ UNTIL CONFIRMED"], script=script, toc=toc)

def render_block(b, key, checks):
    k = b[0]
    if k == "p": return f"<p>{esc(b[1])}</p>"
    if k == "sub": return f"<h4>{esc(b[1])}</h4>"
    if k == "gate": return f'<div class="gate"><b>RULE</b><span>{esc(b[1])}</span></div>'
    if k == "quote": return f'<div class="quote"><b>{esc(b[1]).upper()}</b>{esc(b[2])}</div>'
    tag = "ul" if k == "ul" else "ol"
    if checks:
        lis = "".join(f'<li><input type="checkbox" id="c-{slug(key)}-{zlib.crc32(t.encode())}" aria-label="done"><span>{esc(t)}</span></li>' for t in b[1])
        return f'<{tag} class="steps">{lis}</{tag}>'
    return f'<{tag} class="plain">' + "".join(f"<li>{esc(t)}</li>" for t in b[1]) + f"</{tag}>"

# ----------------------------------------------------------- data extraction
def pdf_text(name):
    return subprocess.run(["pdftotext", "-layout", str(SRC / name), "-"], capture_output=True, text=True, check=True).stdout

def parse_axles():
    rows = []
    for l in pdf_text("axle-weights.pdf").splitlines():
        m = re.match(r"^\s*([A-Z]{2})\s+([\d,]+)\s+([\d,]+)\s+(.+?)\s*$", l)
        if m:
            rows.append({"st": m.group(1), "single": int(m.group(2).replace(",", "")),
                         "tandem": int(m.group(3).replace(",", "")), "bridge": m.group(4)})
    return rows

STATE_FIX = {"LOUSIANA": "LOUISIANA"}
LABELS = ["Length/Overhang", "Length", "Overhang", "Width", "Height", "Weight", "Notes", "Note"]

def parse_states():
    txt = pdf_text("state-legal-limits.pdf").replace("′", "'").replace("″", '"')
    states, cur = [], None
    for l in txt.splitlines():
        s = l.strip().replace("\f", "")
        if not s or s.startswith("LEGAL LIMITS"): continue
        if re.fullmatch(r"[A-Z][A-Z ]+", s) and len(s) > 3 and not s.startswith("NOTE"):
            cur = {"name": STATE_FIX.get(s, s).title(), "raw": []}; states.append(cur); continue
        if cur is not None: cur["raw"].append(s)
    out = []
    for st in states:
        text = " ".join(st["raw"]).replace("\uf0b7", "•")
        text = re.sub(r"\s+", " ", text)
        pat = r"(?:(?<=\s)|^)(" + "|".join(LABELS) + r"):"
        pieces = re.split(pat, text)
        fields = {}
        pre = pieces[0].strip()
        for j in range(1, len(pieces) - 1, 2):
            fields.setdefault(pieces[j], "")
            fields[pieces[j]] = (fields[pieces[j]] + " " + pieces[j + 1].strip()).strip()
        w = fields.get("Weight", "")
        nums = {}
        for lab, key in (("Gross", "gross"), ("Single", "single"), ("Tandem", "tandem"), ("Tridem", "tridem")):
            m = re.search(lab + r"\s*[–-]?\s*([\d,]{5,7})", w)
            if lab == "Gross":
                m = re.search(r"(80,000|[\d,]{6,7})", w)
            if m: nums[key] = m.group(1)
        out.append({"name": st["name"], "fields": fields, "nums": nums, "pre": pre})
    return out

# -------------------------------------------------------------- tool pages
def page_axles(rows):
    data = json.dumps(rows)
    body = f"""<input class="search" id="q" type="search" placeholder="Search a state (e.g. TX) or bridge rule…" autocomplete="off" aria-label="Search">
<div class="tbl-wrap"><table class="tbl" id="t"><thead><tr><th data-k="st">STATE</th><th data-k="single">SINGLE AXLE</th><th data-k="tandem">TANDEM AXLE</th><th data-k="bridge">BRIDGE (53 FT TRAILER)</th></tr></thead><tbody></tbody></table></div>
<p class="empty" id="none" style="display:none;margin-top:14px">NO STATES MATCH</p>
<p class="note">Interstate system allowable axle weights and bridge settings with 53 ft trailers, in pounds. Maximum combined tractor/semi-trailer weight on the interstate is 80,000 lb. Regardless of the allowable axle weights, you cannot exceed the ratings of the steer tires. Always confirm with the state before a permit-sensitive run.</p>"""
    script = f"""<script>
(function(){{var D={data},k='st',asc=true,q=document.getElementById('q'),tb=document.querySelector('#t tbody'),none=document.getElementById('none');
function fmt(n){{return n.toLocaleString('en-US')}}
function draw(){{var t=q.value.trim().toLowerCase();
 var r=D.filter(function(x){{return !t||(x.st+' '+x.bridge).toLowerCase().indexOf(t)!==-1}}).sort(function(a,b){{var A=a[k],B=b[k];return (A<B?-1:A>B?1:0)*(asc?1:-1)}});
 tb.innerHTML=r.map(function(x){{return '<tr><td class="st">'+x.st+'</td><td class="num">'+fmt(x.single)+'</td><td class="num">'+fmt(x.tandem)+'</td><td>'+x.bridge+'</td></tr>'}}).join('');
 none.style.display=r.length?'none':'block'}}
q.addEventListener('input',draw);
document.querySelectorAll('th[data-k]').forEach(function(th){{th.addEventListener('click',function(){{var n=th.getAttribute('data-k');asc=(k===n)?!asc:true;k=n;draw()}})}});
draw()}})();
</script>"""
    return shell("Axle Weights by State", "WEIGHTS & LIMITS", "Single and tandem axle limits plus bridge settings for 53 ft trailers. Search a state or click a column to sort.",
                 body, chips=[f"{len(rows)} STATES", "80,000 LB GROSS"], script=script)

def page_states(states):
    cards = []
    for s in states:
        f = s["fields"]
        dl = "".join(f"<dt>{esc(k)}</dt><dd>{esc(f[k])}</dd>" for k in LABELS + [] if k in f and k != "Weight")
        n = s["nums"]
        chips = "".join(f'<div class="stat"><small>{lab}</small><b>{esc(n[key])}</b></div>' for lab, key in
                        (("GROSS", "gross"), ("SINGLE", "single"), ("TANDEM", "tandem"), ("TRIDEM", "tridem")) if key in n)
        extra = f'<p class="note">{esc(s["pre"])}</p>' if s["pre"] else ""
        wt = f'<dl class="kv"><dt>Weight</dt><dd>{esc(f["Weight"])}</dd></dl>' if "Weight" in f and not chips else ""
        cards.append(f'<article class="card" data-s="{esc(s["name"].lower())}"><h3>{esc(s["name"])}</h3><div class="chipw">{chips}</div>{wt}<dl class="kv" style="margin-top:12px">{dl}</dl>{extra}</article>')
    body = ('<input class="search" id="q" type="search" placeholder="Search a state…" autocomplete="off" aria-label="Search">'
            f'<div class="sg">{"".join(cards)}</div><p class="empty" id="none" style="display:none;margin-top:14px">NO STATES MATCH</p>'
            '<p class="note">Limits as listed in the company reference sheet. Weights are in pounds; “Gross” is the maximum total vehicle weight. Rules change; confirm permit-sensitive moves with the state or the UGL Permit Department. Alaska and Hawaii are not on the source sheet.</p>')
    script = """<script>(function(){var q=document.getElementById('q'),c=[].slice.call(document.querySelectorAll('[data-s]')),n=document.getElementById('none');
q.addEventListener('input',function(){var t=q.value.trim().toLowerCase(),s=0;c.forEach(function(x){var ok=!t||x.getAttribute('data-s').indexOf(t)!==-1;x.style.display=ok?'':'none';if(ok)s++});n.style.display=s?'none':'block'})})();</script>"""
    return shell("Legal Limits by State", "WEIGHTS & LIMITS", "Length, overhang, width, height and weight limits for each state. Search to jump to one.",
                 body, chips=[f"{len(states)} STATES"], script=script)

LEVELS = [
 ("I", "North American Standard Inspection", "The most thorough roadside inspection: driver and vehicle.",
  ["Driver’s license", "Medical examiner’s certificate & waiver", "Alcohol and drugs", "Record of duty status", "Hours of service", "Seat belt", "Vehicle inspection report",
   "Brake system", "Coupling devices", "Exhaust system", "Frame", "Fuel system", "Turn signals", "Brake lamps", "Tail lamps", "Head lamps", "Lamps on projecting loads", "Safe loading",
   "Steering mechanism", "Suspension", "Tires", "Van and open-top trailer bodies", "Wheels and rims", "Windshield wipers", "Emergency exits (buses)", "Hazardous materials requirements"], []),
 ("II", "Walk-Around Driver/Vehicle Inspection", "Everything in Level I, but only what can be checked without getting under the vehicle.",
  ["Driver’s license", "Medical examiner’s certificate & waiver", "Alcohol and drugs", "Record of duty status", "Hours of service", "Seat belt", "Vehicle inspection report",
   "Brake system", "Coupling devices", "Exhaust system", "Frame", "Fuel system", "Lamps", "Safe loading", "Steering mechanism", "Suspension", "Tires", "Trailer bodies", "Wheels and rims", "Windshield wipers", "Hazardous materials requirements"], []),
 ("III", "Driver-Only Inspection", "A roadside check of the driver and paperwork. The vehicle itself is not examined.",
  ["Driver’s license", "Medical certification & waiver", "Record of duty status", "Hours of service", "Seat belt", "Vehicle inspection report", "Hazardous materials requirements"], []),
 ("IV", "Special Inspections", "A one-time examination of a particular item, usually in support of a study or to verify a suspected trend.", [], []),
 ("V", "Vehicle-Only Inspection", "Every vehicle item from Level I, with no driver present, at any location.",
  ["All Level I vehicle items", "No driver check"], []),
 ("VI", "Enhanced NAS Inspection for Radioactive Shipments", "Level I plus radiological requirements and enhanced out-of-service criteria, for select radiological shipments only (highway route controlled quantities and all transuranics).", [], []),
]

def page_levels():
    cards = []
    for n, name, desc, items, _ in LEVELS:
        tags = "".join(f"<span>{esc(i)}</span>" for i in items)
        cards.append(f'<article class="card level" id="l{n.lower()}"><div class="level__n">{n}</div><div><h3>{esc(name)}</h3><p style="margin:6px 0 0">{esc(desc)}</p>'
                     + (f'<div class="tags">{tags}</div>' if tags else "") + "</article>")
    body = "".join(cards) + ('<p class="note">Source: FMCSA DataQs Help Center, “What is included in each of the Level I–VI inspections?” (printed 2/10/2017). '
                             'Level II lamp items are condensed here; see the full FMCSA text for the exact wording.</p>')
    return shell("DOT Inspection Levels", "COMPLIANCE & SAFETY", "What an officer examines at each of the six roadside inspection levels. Know what to expect, and what the driver must have ready.",
                 body, chips=["LEVEL I–VI", "FMCSA"])

def page_accident():
    body = """<div class="card" id="box"></div><div id="res"></div><div class="trail" id="trail"></div>
<p class="note">Based on the Accident Testing Flow-chart (CDL Consultant, Inc., 2020). Answer for the driver involved. If you are unsure, treat it as a test and call the dispatch manager.</p>"""
    script = """<script>
(function(){
var Q={fat:{t:'Was there a fatality?',y:'TEST',n:'cit'},
cit:{t:'Was the citation a moving violation?',y:'inj',n:'NO'},
inj:{t:'Was there an injury that required immediate medical attention?',y:'TEST',n:'tow'},
tow:{t:'Did a vehicle receive damage requiring it to be towed from the accident?',y:'TEST',n:'NO'}};
var box=document.getElementById('box'),res=document.getElementById('res'),trail=document.getElementById('trail'),path=[],n=0;
function ask(id){box.style.display='';res.innerHTML='';n++;
 box.innerHTML='<div class="q-count">QUESTION '+n+'</div><div class="q">'+Q[id].t+'</div><div class="answers"><button class="btn" data-a="y">Yes</button><button class="btn btn--ghost" data-a="n">No</button></div>';
 box.querySelectorAll('button').forEach(function(b){b.onclick=function(){var a=b.getAttribute('data-a');path.push([Q[id].t,a==='y'?'Yes':'No']);var nx=Q[id][a];if(Q[nx])ask(nx);else done(nx)}});show()}
function show(){trail.innerHTML=path.map(function(p){return p[0]+' <b>'+p[1]+'</b>'}).join('<br>')}
function done(r){box.style.display='none';show();
 res.innerHTML=r==='TEST'?'<div class="result result--yes"><h2 class="bad">Drug test required</h2><p>Send the driver for a post-accident test and tell the dispatch manager now. Document the accident details and the instructions you were given.</p></div>'
 :'<div class="result result--no"><h2 class="ok">No test required</h2><p>Based on your answers, no post-accident drug test is required. Still report the accident to dispatch management and record what happened.</p></div>';
 res.innerHTML+='<p style="margin-top:16px"><button class="btn btn--ghost" id="again">Start over</button></p>';
 document.getElementById('again').onclick=function(){path=[];n=0;trail.innerHTML='';ask('fat')}}
ask('fat')})();
</script>"""
    return shell("Post-Accident Test Check", "COMPLIANCE & SAFETY", "Answer up to four questions to find out whether a drug test is required after an accident.",
                 body, chips=["4 QUESTIONS", "DECISION TOOL"], script=script)

def page_fix_weight():
    body = """<div class="grid2"><div class="card"><h3>Scale ticket</h3><p style="margin:4px 0 14px">Enter the axle weights from the scale ticket (lb).</p>
<label class="field"><label for="s">STEER</label><input id="s" type="number" inputmode="numeric" value="11380"></label>
<label class="field"><label for="d">DRIVE</label><input id="d" type="number" inputmode="numeric" value="34500"></label>
<label class="field"><label for="t">TRAILER</label><input id="t" type="number" inputmode="numeric" value="33640"></label>
<div class="grid2"><label class="field"><label for="f">FUEL LEVEL (%)</label><input id="f" type="number" inputmode="numeric" value="40"></label>
<label class="field"><label for="g">TANK SIZE (GAL)</label><input id="g" type="number" inputmode="numeric" value="240"></label></div>
<div class="proof"><h4>THE DRIVER SAYS</h4><label><input type="checkbox" id="nt"> <span>The tandem can't slide (stuck, or already all the way)</span></label>
<label><input type="checkbox" id="nf"> <span>The fifth wheel can't slide</span></label></div>
<p class="note no-print">Pre-filled with the case from the training: 11,380 / 34,500 / 33,640 at 40% fuel.</p></div>
<div class="card"><h3>Result</h3><div id="out" style="margin-top:12px"></div></div></div>
<section class="sec" style="margin-top:34px" id="how"><h2>How it works</h2>
<div class="grid3">
<div class="stat"><small>LEGAL LIMITS</small><b>12k · 34k · 34k</b><span>Steer · drive · trailer. Gross 80,000 lb. The steer may go up to 12,400 lb when drive and trailer are at most 34,000 and gross at most 80,000.</span></div>
<div class="stat"><small>TANDEM</small><b>1 hole = 250 lb</b><span>Forward moves weight from drive to trailer axle.</span></div>
<div class="stat"><small>FIFTH WHEEL</small><b>1 hole = 500 lb</b><span>Forward moves weight from drive axle to steer.</span></div></div>
<div class="card" style="margin-top:16px"><h3>The worked case</h3>
<ol class="plain"><li>Scale ticket: 11,380 / <b>34,500</b> / 33,640. Drive is 500 lb over the 34,000 limit.</li>
<li>Tandem 2 holes forward gives 11,380 / 34,000 / <b>34,140</b>. Now the trailer axle is over. Not good.</li>
<li>Fifth wheel 1 hole forward instead gives 11,880 / 34,000 / 33,640. Legal.</li>
<li>Then tandem 1 hole forward gives 11,880 / 33,750 / 33,890. Legal, with 250 lb of room on the drive axle.</li>
<li>Fuel: the truck scaled at 40% of 240 gal = 96 gal. 250 lb ÷ 7 lb per gal = 35 gal more. 96 + 35 = 131 gal = <b>54%</b>. Tell the fuel team the tank must not go above 54%.</li></ol></div>
<div class="card"><h3>Gross slightly over 80,000: burn the fuel</h3>
<ol class="plain"><li>Over by 220 lb with the tank at 98%: 220 ÷ 7 = <b>32 gal</b> to burn, × 6 miles per gallon = <b>192 miles</b>.</li>
<li>The driver rolls and burns it, but only if <b>all weigh stations on the next ~200 miles are closed</b> (they check the GPS).</li>
<li>The fuel tanks sit by the drive axle, so the burned fuel comes off the drive axle. Then slide as usual.</li>
<li>Fuel team: 98% of 240 = 235 gal, − 32 = 203 gal = <b>84%</b> (round down to be safe). "We cannot go above 84 %."</li>
<li>Too many miles to burn (1,120 lb over = 160 gal = 960 miles): no. The truck goes back to the shipper.</li></ol>
<p class="note">Always rescale after moving anything. Tank size is taken as 240 gal (trucks run 200–240; ask the fuel team for a specific truck). Fuel weighs 7 lb per gallon and the truck rolls about 6 miles on one. Still stuck: the driver checks the sticker on the door for the axle ratings the manufacturer allows.</p></div></section>"""
    script = """<script>
(function(){var L={s:12000,s2:12400,d:34000,t:34000,g:80000},BURN_MI=200;
function $(i){return document.getElementById(i)}
function num(i){return parseFloat($(i).value)||0}
function fmt(n){return Math.round(n).toLocaleString('en-US')}
function steerOk(s,d,t){return s<=L.s||(s<=L.s2&&d<=L.d&&t<=L.t&&s+d+t<=L.g)}
function legal(s,d,t){return d<=L.d&&t<=L.t&&steerOk(s,d,t)}
function search(S,D,T){var best=null,fewest=null,FH=$('nf').checked?0:3,TH=$('nt').checked?0:5;
 for(var fh=-FH;fh<=FH;fh++)for(var th=-TH;th<=TH;th++){var s=S+500*fh,d=D-500*fh-250*th,t=T+250*th;
  if(s>0&&d>0&&t>0&&legal(s,d,t)){var moves=Math.abs(fh)+Math.abs(th),head=Math.min(L.d-d,L.g-(s+d+t)),low=s<=L.s?1:0,c={fh:fh,th:th,s:s,d:d,t:t,moves:moves,head:head,low:low};
   if(!fewest||moves<fewest.moves||(moves===fewest.moves&&(low>fewest.low||(low===fewest.low&&head>fewest.head))))fewest=c;
   if(!best||low>best.low||(low===best.low&&(head>best.head||(head===best.head&&moves<best.moves))))best=c}}
 return {best:best,fewest:fewest}}
function tile(lab,v,lim,warn){var c=v>lim?(warn&&v<=L.s2?'warn':'bad'):'ok';
 return '<div class="stat '+(c==='bad'?'bad-b':'ok-b')+'"><small>'+lab+'</small><b class="'+(c==='warn'?'':c)+'"'+(c==='warn'?' style="color:var(--u-amber)"':'')+'>'+fmt(v)+'</b><span>limit '+fmt(lim)+(warn?' (12,400 allowed)':'')+'</span></div>'}
function mv(c){var a=[];if(c.fh)a.push('Fifth wheel '+Math.abs(c.fh)+' hole'+(Math.abs(c.fh)>1?'s':'')+(c.fh>0?' forward':' back'));if(c.th)a.push('Tandem '+Math.abs(c.th)+' hole'+(Math.abs(c.th)>1?'s':'')+(c.th>0?' forward':' back'));return a.join(' + ')||'No move needed'}
function calc(){var S=num('s'),D=num('d'),T=num('t'),pct=num('f'),tank=num('g')||240,gross=S+D+T,have=pct/100*tank;
 var h='<div class="grid3" style="margin-bottom:14px">'+tile('STEER',S,L.s,true)+tile('DRIVE',D,L.d)+tile('TRAILER',T,L.t)+'</div>';
 h+='<p style="margin:-4px 0 12px">Gross: <b class="'+(gross>L.g?'bad':'ok')+'">'+fmt(gross)+' lb</b> (limit 80,000).</p>';
 function block(t,c,burned){var maxGal=have-(burned||0),extra=burned?0:Math.floor(Math.max(0,c.head)/7),max=Math.min(100,Math.floor((maxGal+extra)/tank*100));
  return '<div class="card" style="margin:0 0 12px"><h3>'+t+'</h3><p style="margin:4px 0 10px"><b>'+mv(c)+'</b></p><div class="chipw"><div class="stat"><small>STEER</small><b>'+fmt(c.s)+'</b></div><div class="stat"><small>DRIVE</small><b>'+fmt(c.d)+'</b></div><div class="stat"><small>TRAILER</small><b>'+fmt(c.t)+'</b></div></div>'
  +(c.s>L.s?'<p class="note" style="margin-top:8px">Steer '+fmt(c.s)+' lb is allowed: drive and trailer are at most 34,000 and gross at most 80,000 (up to 12,400 lb).</p>':'')
  +(burned?'<p style="margin:10px 0 0">After burning, fuel must stay <b>at or below '+max+'%</b>. Tell the fuel team.</p>'
   :'<p style="margin:10px 0 0">Room: <b>'+fmt(Math.max(0,c.head))+' lb</b> = '+extra+' more gal. Truck has '+fmt(have)+' gal, so fuel must stay <b>at or below '+max+'%</b>.</p>')+'</div>'}
 function burnPlan(over,why){var gal=Math.ceil(over/7),mi=gal*6;
  if(gal>have)return '<div class="result result--yes"><h2 class="bad">Back to the shipper</h2><p>'+why+' needs '+gal+' gal burned, but the truck only has '+fmt(have)+' gal. The load has to be fixed at the shipper.</p></div>';
  if(mi>BURN_MI)return '<div class="result result--yes"><h2 class="bad">Back to the shipper</h2><p>'+why+': '+fmt(over)+' lb = '+gal+' gal = about '+fmt(mi)+' miles of driving. Too far to pass no open weigh station. The truck goes back to the shipper.</p></div>';
  return {gal:gal,mi:mi,html:'<div class="result result--no" style="margin:0 0 12px"><h2 class="ok">Burn the fuel</h2><p>'+why+': '+fmt(over)+' lb ÷ 7 = <b>'+gal+' gal</b> = about <b>'+mi+' miles</b>. Only if <b>all weigh stations on the next ~'+BURN_MI+' miles are closed</b>: the driver checks the GPS.</p></div>'}}
 if(gross>L.g){var p=burnPlan(gross-L.g,'Gross is over');if(typeof p==='string')return h+p;
  var D2=D-p.gal*7,r=search(S,D2,T);h+=p.html;
  if(!r.best)return h+'<div class="result result--yes"><h2 class="bad">Still not legal after burning</h2><p>No slide in range fixes the axles. Ask the driver to check the door sticker for the axle ratings, or go back to the shipper.</p></div>';
  return h+block('After burning (~'+p.mi+' mi), then',r.best,p.gal)}
 if(legal(S,D,T))h+='<p class="ok" style="margin-bottom:12px"><b>All axles are already legal.</b> Moves below only add fuel room.</p>';
 var r=search(S,D,T);
 if(!r.best){var p2=D>L.d?burnPlan(D-L.d,'The drive axle is over'):null;
  if(p2&&typeof p2!=='string'){var r2=search(S,D-p2.gal*7,T);if(r2.best)return h+p2.html+block('After burning (~'+p2.mi+' mi)',r2.best,p2.gal)}
  return h+(typeof p2==='string'?p2:'')+'<div class="result result--yes"><h2 class="bad">No fix by sliding</h2><p>No combination of fifth wheel and tandem moves in range makes every axle legal. Ask the driver to check the sticker on the door for the axle ratings the manufacturer allows; otherwise the load is fixed at the shipper.</p></div>'}
 h+=block('Best for fuel room',r.best);
 if(r.fewest&&(r.fewest.fh!==r.best.fh||r.fewest.th!==r.best.th))h+=block('Fewest moves',r.fewest);
 return h}
['s','d','t','f','g'].forEach(function(i){$(i).addEventListener('input',function(){$('out').innerHTML=calc()})});
['nt','nf'].forEach(function(i){$(i).addEventListener('change',function(){$('out').innerHTML=calc()})});
$('out').innerHTML=calc()})();
</script>"""
    return shell("Fix the Weight", "WEIGHTS & LIMITS", "Turn an overweight scale ticket into a fix: how far to slide the tandem and fifth wheel, when to burn fuel, and how much fuel the truck can carry afterwards.",
                 body, chips=["12-34-34 LIMITS", "STEER UP TO 12,400", "CALCULATOR"], script=script)

# ------------------------------------------------------------ FMCSA summary
TOC_SCRIPT = """<script>
(function(){var links=[].slice.call(document.querySelectorAll('.toc a'));
links.forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();var t=document.getElementById(a.getAttribute('href').slice(1));if(t)t.scrollIntoView({behavior:'smooth'})})});
var secs=links.map(function(a){return document.getElementById(a.getAttribute('href').slice(1))});
function spy(){var y=window.scrollY+200,on=0;secs.forEach(function(s,i){if(s&&s.offsetTop<=y)on=i});links.forEach(function(a,i){a.classList.toggle('is-on',i===on)})}
window.addEventListener('scroll',spy,{passive:true});spy();})();
</script>"""

# Quick-reference figures, each taken from the summary text (section number in brackets).
FMCSA_KEYS = [
    ("10,001 lb", "A CMV under the FMCSRs", "2"), ("26,001 lb", "CDL required (or placarded hazmat, 16+ people)", "5"),
    ("11 h", "Driving after 10 h off duty", "7"), ("14 h", "On-duty window; breaks do not stop it", "7"),
    ("30 min", "Break after 8 h of driving", "7"), ("60 / 70 h", "On duty in 7 / 8 days; 34 h restart", "7"),
    ("0.04", "Alcohol: no duty at or above; none 4 h before", "6"), ("2 h · 32 h", "Post-accident alcohol (max 8 h) · drug test", "6"),
]

def iter_blocks(d):
    from docx.table import Table
    from docx.text.paragraph import Paragraph
    for child in d.element.body.iterchildren():
        if child.tag.endswith("}p"): yield Paragraph(child, d)
        elif child.tag.endswith("}tbl"): yield Table(child, d)

def label_split(t):
    m = re.match(r"^([A-Z][^:.]{1,40}):\s+(.*)$", t)
    return (m.group(1), m.group(2)) if m else (None, t)

def render_fmcsa(path):
    from docx.table import Table
    d = docx.Document(str(path))
    title, subtitle, intro, secs = None, None, [], []
    cur, ul = None, None
    def out():
        return cur["html"] if cur else intro
    for b in iter_blocks(d):
        if isinstance(b, Table):
            ul = None
            rows = [[c.text.strip() for c in r.cells] for r in b.rows]
            if len(rows) == 1 and len(rows[0]) == 1:
                lead = re.match(r"^(.{2,40}?[.:])\s+(.*)$", rows[0][0], re.S)
                head, rest = (lead.group(1).rstrip(".:"), lead.group(2)) if lead else ("Note", rows[0][0])
                out().append(f'<div class="callout"><b>{esc(head)}</b><p>{esc(rest)}</p></div>')
            else:
                th = "".join(f"<th>{esc(c)}</th>" for c in rows[0])
                trs = "".join("<tr>" + "".join(f"<td>{esc(c)}</td>" for c in r) + "</tr>" for r in rows[1:])
                out().append(f'<div class="tbl-wrap"><table class="tbl tbl--doc"><thead><tr>{th}</tr></thead><tbody>{trs}</tbody></table></div>')
            continue
        t = b.text.strip()
        if not t: continue
        style = b.style.name
        if title is None: title = t; continue
        if subtitle is None and style == "Normal" and not secs: subtitle = t; continue
        if style == "Heading 1":
            ul = None
            num, _, name = t.partition(". ")
            cur = {"id": "s" + num, "label": t, "html": [f'<h2>{esc(t)}</h2>']}
            secs.append(cur); continue
        if style == "Heading 2":
            ul = None; out().append(f'<h3 class="sub">{esc(t)}</h3>'); continue
        if style.startswith("List"):
            lab, rest = label_split(t)
            li = f"<li><b>{esc(lab)}.</b> {esc(rest)}</li>" if lab else f"<li>{esc(t)}</li>"
            if ul is None:
                ul = []; out().append(ul)
            ul.append(li); continue
        ul = None; out().append(f"<p>{esc(t)}</p>")
    def flat(parts):
        return "".join(f'<ul class="plain plain--doc">{"".join(x)}</ul>' if isinstance(x, list) else x for x in parts)
    words = len(re.sub(r"<[^>]+>", " ", flat(intro) + "".join(flat(s["html"]) for s in secs)).split())
    keys = "".join(f'<div class="stat"><small>SECTION {sec}</small><b>{esc(v)}</b><span>{esc(l)}</span></div>' for v, l, sec in FMCSA_KEYS)
    body = (flat(intro) + f'<section class="sec" id="keys"><h2>Key numbers</h2><div class="keynums">{keys}</div></section>'
            + "".join(f'<section class="sec" id="{s["id"]}">{flat(s["html"])}</section>' for s in secs))
    toc = [("keys", "Key numbers")] + [(s["id"], re.sub(r"\s*\((?:Parts?|Sec\.)[^)]*\)", "", s["label"])) for s in secs]
    return shell(title, "COMPLIANCE SUMMARY", esc(subtitle) + ". The FMCSA rules a dispatcher needs, from who is covered to hours of service, testing, vehicles, accidents and CSA.",
                 body, chips=[f"{len(secs)} SECTIONS", f"~{max(1, round(words / 220))} MIN READ", "!STUDY AID, NOT LEGAL ADVICE"], script=TOC_SCRIPT, toc=toc)

# ------------------------------------------------------- responsibility checklist
def render_checklist(path):
    d = docx.Document(str(path))
    title, stages = None, []
    for para in d.paragraphs:
        t = para.text.replace("\xa0", " ").strip()
        if not t: continue
        bold = bool(para.runs) and all(r.bold for r in para.runs if r.text.strip())
        if title is None: title = t; continue
        m = re.match(r"^(\d+)\.\s+(.*?)(?:\s*\((.*)\))?$", t)
        if bold and m:
            note = m.group(3) or ""
            title_ = m.group(2) if len(note.split()) > 1 or not note else f"{m.group(2)} ({note})"
            stages.append({"n": m.group(1), "title": title_, "note": note if len(note.split()) > 1 else "", "blocks": []}); continue
        item = re.sub(r"^\u2610\s*", "", t)
        if bold:
            stages[-1]["blocks"].append(("sub", item.rstrip(":")))
        else:
            stages[-1]["blocks"].append(("item", item))
    total = sum(1 for st in stages for b in st["blocks"] if b[0] == "item")
    parts, toc = [], []
    for st in stages:
        sid = "stage-" + st["n"]; toc.append((sid, f'{st["n"]}. {st["title"]}'))
        out = [f'<section class="sec" id="{sid}"><div class="card" data-phase><h3>{st["n"]}. {esc(st["title"])}<small data-count></small></h3>']
        if st["note"]: out.append(f'<p class="stage-note">When: {esc(st["note"][0].lower() + st["note"][1:])}</p>')
        out.append('<div class="progress"><i></i></div>')
        ul = None
        for kind, text in st["blocks"]:
            if kind == "sub":
                if ul is not None: out.append("</ul>"); ul = None
                out.append(f"<h4>{esc(text)}</h4>")
            else:
                if ul is None: out.append('<ul class="steps">'); ul = True
                cid = f"c-rc-{zlib.crc32((st['n'] + text).encode())}"
                out.append(f'<li><input type="checkbox" id="{cid}" aria-label="done"><span>{esc(text)}</span></li>')
        if ul: out.append("</ul>")
        out.append("</div></section>")
        parts.append("".join(out))
    tools = ('<div class="checkbar no-print"><span>Tick items off as you work a load. Your ticks are saved in this browser.</span>'
             '<button type="button" class="btn btn--ghost" id="reset-load">Start a new load</button></div>')
    script = """<script>
(function(){var key='ugl-checks:responsibilities',saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}')}catch(e){}
function save(){try{localStorage.setItem(key,JSON.stringify(saved))}catch(e){}}
var cards=[].slice.call(document.querySelectorAll('[data-phase]'));
function upd(card){var boxes=card.querySelectorAll('input[type=checkbox]'),n=0;boxes.forEach(function(b){if(b.checked)n++;b.parentNode.classList.toggle('done',b.checked)});
 card.querySelector('.progress i').style.width=(boxes.length?n/boxes.length*100:0)+'%';card.querySelector('[data-count]').textContent=n+' / '+boxes.length}
cards.forEach(function(card){card.querySelectorAll('input[type=checkbox]').forEach(function(b){b.checked=!!saved[b.id];b.addEventListener('change',function(){saved[b.id]=b.checked;save();upd(card)})});upd(card)});
var r=document.getElementById('reset-load');if(r)r.addEventListener('click',function(){saved={};save();cards.forEach(function(card){card.querySelectorAll('input[type=checkbox]').forEach(function(b){b.checked=false});upd(card)});window.scrollTo(0,0)});
var links=[].slice.call(document.querySelectorAll('.toc a')),secs=links.map(function(a){return document.getElementById(a.getAttribute('href').slice(1))});
links.forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();var t=document.getElementById(a.getAttribute('href').slice(1));if(t)t.scrollIntoView({behavior:'smooth'})})});
function spy(){var y=window.scrollY+200,on=0;secs.forEach(function(s,i){if(s&&s.offsetTop<=y)on=i});links.forEach(function(a,i){a.classList.toggle('is-on',i===on)})}
window.addEventListener('scroll',spy,{passive:true});spy();})();
</script>"""
    return shell(title, "LOAD UPDATER", "Every step a load updater owns, from the rate confirmation to the completed POD. Work through it for each load, then reset for the next one.",
                 tools + "".join(parts), chips=[f"{len(stages)} STAGES", f"{total} CHECKPOINTS"], script=script, toc=toc)

# ------------------------------------------------------- carrier dispatch email course
def render_email_course(path):
    """Restyle the print-oriented course HTML into a site page: one section per module,
    images kept, and the knowledge check merged with its answer key."""
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    body = soup.body
    title = body.select_one(".title-main").get_text(strip=True).title()
    sub = body.select_one(".title-sub").get_text(strip=True)
    desc = body.select_one(".title-desc").get_text(" ", strip=True)
    sections, cur = [], None
    for el in list(body.children):
        if getattr(el, "name", None) is None:
            continue
        cls = el.get("class") or []
        if "title-page" in cls or "toc-row" in cls:
            continue
        if el.name == "h1":
            text = el.get_text(" ", strip=True)
            if text == "Table of Contents":
                cur = None; continue
            m = re.match(r"Module (\d+):\s*(.*)", text)
            if m:
                cur = {"id": "m" + m.group(1), "label": f"{m.group(1)}. {m.group(2)}", "h": text, "els": []}
            elif text == "Answer Key":
                cur = {"id": "answers", "label": None, "h": text, "els": []}
            elif text == "How to Use This Course":
                cur = {"id": "start", "label": "How to use this course", "h": text, "els": []}
            else:
                cur = {"id": slug(text), "label": text, "h": text, "els": []}
            sections.append(cur); continue
        if cur is not None:
            cur["els"].append(el)

    def inner(el):
        return "".join(str(c) for c in el.contents)

    def convert(els):
        out, i = [], 0
        while i < len(els):
            el = els[i]; cls = el.get("class") or []
            if el.name == "h2":
                out.append(f'<h3 class="sub">{inner(el)}</h3>')
            elif "rule-one" in cls:
                box = els[i + 1] if i + 1 < len(els) and "rule-one-box" in (els[i + 1].get("class") or []) else None
                out.append(f'<div class="callout callout--red"><b>{el.get_text(strip=True)}</b><p>{inner(box) if box else ""}</p></div>')
                i += 2 if box else 1; continue
            elif "glossary-row" in cls:
                rows = []
                while i < len(els) and "glossary-row" in (els[i].get("class") or []):
                    r = els[i]; term = r.select_one(".glossary-term"); t = term.get_text(strip=True); term.extract()
                    rows.append(f'<dt>{esc(t)}</dt><dd>{inner(r).lstrip(" :").strip()}</dd>'); i += 1
                out.append(f'<dl class="gloss">{"".join(rows)}</dl>'); continue
            elif "glossary-note" in cls:
                out.append(f'<div class="callout callout--gray"><b>Note</b><p>{inner(el)}</p></div>')
            elif "cat-card" in cls:
                cards = []
                while i < len(els) and "cat-card" in (els[i].get("class") or []):
                    c = els[i]
                    lines = "".join(f'<p class="cat-line{" is-req" if "req" in (l.get("class") or []) else ""}">{inner(l)}</p>' for l in c.select(".cat-line"))
                    cards.append(f'<article class="cat-card"><h4>{c.select_one(".cat-title").get_text(strip=True)}</h4>{lines}</article>'); i += 1
                out.append(f'<div class="cat-grid">{"".join(cards)}</div>'); continue
            elif "callout" in cls:
                variant = " callout--red" if "red" in cls else " callout--gray" if "gray" in cls else ""
                t = el.select_one(".callout-title")
                head = t.get_text(strip=True) if t else ""
                if t: t.extract()
                body_html = "".join(str(c) for c in el.contents).strip()
                out.append(f'<div class="callout{variant}">' + (f"<b>{esc(head)}</b>" if head else "") + f'<div class="callout__body">{body_html}</div></div>')
            elif "numlist" in cls:
                items = []
                for d in el.find_all("div", recursive=False):
                    n = d.select_one(".n"); num = n.get_text(strip=True).rstrip(".") if n else ""
                    if n: n.extract()
                    items.append(f'<li><span class="nl-n">{esc(num)}</span><span>{inner(d).strip()}</span></li>')
                out.append(f'<ol class="numlist">{"".join(items)}</ol>')
            elif "img-wrap" in cls:
                img = el.find("img"); cap = el.select_one(".caption")
                out.append(f'<figure class="shot"><img src="{img["src"]}" alt="{esc(cap.get_text(" ", strip=True)) if cap else ""}" loading="lazy">'
                           + (f"<figcaption>{inner(cap)}</figcaption>" if cap else "") + "</figure>")
            elif el.name == "table":
                el["class"] = ["tbl", "tbl--doc"]
                out.append(f'<div class="tbl-wrap">{el}</div>')
            elif el.name in ("p", "ul", "ol"):
                out.append(str(el))
            else:
                out.append(str(el))
            i += 1
        return "".join(out)

    # Knowledge check: pair each question with its answer from the key.
    secs = {s_["id"]: s_ for s_ in sections}
    kc, key = secs.get("m10"), secs.get("answers")
    if kc and key:
        def items(sec):
            lst = [e for e in sec["els"] if "numlist" in (e.get("class") or []) or "answer" in (e.get("class") or [])]
            res = []
            for d in lst[0].find_all("div", recursive=False):
                n = d.select_one(".n")
                if n: n.extract()
                res.append(inner(d).strip())
            return res
        qs, ans = items(kc), items(key)
        cards = "".join(f'<article class="kc-q"><span class="kc-n">{k + 1}</span><div><p>{q}</p><details><summary>Show answer</summary><p>{a}</p></details></div></article>'
                        for k, (q, a) in enumerate(zip(qs, ans)))
        kc["html"] = ('<p>Answer each question in your head first, then open the answer to check yourself.</p>'
                      '<div class="kc-bar no-print"><button type="button" class="btn btn--ghost" id="kc-all">Show all answers</button></div>'
                      f'<div class="kc">{cards}</div>')
        sections.remove(key)
    parts, toc = [], []
    for s_ in sections:
        html_ = s_.get("html") or convert(s_["els"])
        parts.append(f'<section class="sec doc" id="{s_["id"]}"><h2>{esc(s_["h"])}</h2>{html_}</section>')
        if s_["label"]: toc.append((s_["id"], s_["label"]))
    words = len(re.sub(r"<[^>]+>", " ", re.sub(r'src="data:[^"]+"', "", "".join(parts))).split())
    script = TOC_SCRIPT + """<script>(function(){var b=document.getElementById('kc-all');if(!b)return;
b.addEventListener('click',function(){var all=[].slice.call(document.querySelectorAll('.kc details')),open=all.some(function(d){return !d.open});
all.forEach(function(d){d.open=open});b.textContent=open?'Hide all answers':'Show all answers'})})();</script>"""
    return shell(title, "EMAIL COURSE · " + sub.upper(), esc(desc), "".join(parts),
                 chips=[f"{sum(1 for s_ in sections if s_['id'].startswith('m'))} MODULES", f"~{max(1, round(words / 220))} MIN READ", "KNOWLEDGE CHECK"],
                 script=script, toc=toc)

# ------------------------------------------------------- email quick answers (tool)
LEVELS_QA = {"scam": "Red flag", "check": "Check first", "act": "Act now", "pass": "Pass it on", "how": "How to"}
SEARCH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'

def page_email_answers(path, course):
    """Search tool over the email course: type the situation (or tap a common one), get one
    clear answer. Data comes from sources/email-answers.json; each answer links to its module."""
    data = json.loads(path.read_text(encoding="utf-8"))
    modules = {int(n): t for n, t in re.findall(r"<h1[^>]*>\s*Module (\d+):\s*([^<]+?)\s*</h1>", course.read_text(encoding="utf-8"))}
    ids = {it["id"] for it in data["items"]}
    for it in data["items"]:
        assert it["cat"] in {c["id"] for c in data["categories"]} and it["lvl"] in LEVELS_QA and it["mod"] in modules and len(it["steps"]) <= 3, it["id"]
    assert all(c["id"] in ids for c in data["common"])
    senders = "".join(f'<li><b>{esc(t["service"])}</b><code>{esc(t["address"])}</code></li>' for t in data["senders"])
    body = f"""<div class="qa-wrap">
<div class="qa-mode" role="tablist"><button type="button" class="is-on" data-mode="find" role="tab">What do I do?</button><button type="button" data-mode="sender" role="tab">Is this sender real?</button></div>
<div id="mode-find"><div class="qa-search">{SEARCH_SVG}<input id="qa-q" type="search" autocomplete="off" spellcheck="false" placeholder="What's happening? e.g. broker wants an update" aria-label="Describe the email or situation"></div>
<div id="qa-out"></div></div>
<div id="mode-sender" hidden><p class="qa-intro">For setup, carrier packet and "verification" emails. Paste who it came from.</p>
<div class="snd-row"><input id="snd" type="text" autocomplete="off" spellcheck="false" placeholder="e.g. hello@highway.com" aria-label="Sender address"><button type="button" class="btn" id="snd-go">Check</button></div>
<div id="snd-out"></div>
<div class="snd-list"><p>The only trusted setup senders</p><ul>{senders}</ul>
<p class="snd-note">Normal broker emails, like RCs and updates, come from the broker's own address. This check is only for setups.</p></div></div>
</div>"""
    payload = json.dumps({"items": data["items"], "common": data["common"], "cats": data["categories"], "levels": LEVELS_QA,
                          "senders": data["senders"]}, ensure_ascii=False).replace("</", "<\\/")
    script = "<script>var QA=" + payload + ";</script>" + r"""<script>
(function(){
// ---- search: words in the situation and keywords count most, rare words more than common ones
var STOP='a an the i im is it its to of and or on in for my me we our us this that from with be do does what how can should just did was are am has have about there their they them you your so if at by as not yes any get got want wants'.split(' ');
var ALIAS={rc:'rate confirmation',ratecon:'rc rate confirmation',rcs:'rc rate confirmation',rrc:'revised rc',packet:'setup carrier packet',onboarding:'setup',insurance:'coi',fake:'scam lookalike',phishing:'scam lookalike',fraud:'scam',hacked:'hacked compromised',bounced:'bounce undeliverable',bounceback:'bounce undeliverable',eta:'update eta',tracking:'update eta',cc:'cc chain',gov:'compliance government',drug:'drug test compliance',hazmat:'hazmat compliance',invoice:'invoice payment',pay:'payment invoice',unsure:'not sure',confused:'not sure',docusign:'signature esign'};
function norm(s){return String(s).toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9@.]+/g,' ').replace(/\.(?=\s|$)/g,' ')}
function words(s){return norm(s).split(/\s+/).filter(Boolean)}
function toks(s){var out=[];words(s).forEach(function(t){if(STOP.indexOf(t)>=0)return;out.push(t);if(ALIAS[t])ALIAS[t].split(' ').forEach(function(a){if(out.indexOf(a)<0)out.push(a)})});return out}
function lev(a,b){if(Math.abs(a.length-b.length)>2)return 9;var p=[],i,j;for(j=0;j<=b.length;j++)p[j]=j;for(i=1;i<=a.length;i++){var c=[i];for(j=1;j<=b.length;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}return p[b.length]}
var IDX=QA.items.map(function(it){return{it:it,f:[[words(it.q),3],[words(it.k),2.5],[words(it.do+' '+(it.a||'')),1.5],[words(it.steps.join(' ')),1]],qn:norm(it.q)}});
function tokScore(t,f){var best=0;f.forEach(function(fw){var ws=fw[0],w=fw[1],m=0;for(var i=0;i<ws.length&&m<1;i++){var x=ws[i];
 if(x===t)m=1;else if(t.length>=3&&x.indexOf(t)===0)m=Math.max(m,.7);else if(t.length>=5&&x.length>=5&&lev(t,x)<=1)m=Math.max(m,.6);else if(t.length>=4&&x.indexOf(t)>0)m=Math.max(m,.4)}
 best+=m*w});return best}
function search(q){var ts=toks(q),qn=norm(q).trim();if(!ts.length)return [];
 var sc=IDX.map(function(d){return ts.map(function(t){return tokScore(t,d.f)})});
 var idf=ts.map(function(t,k){var df=sc.filter(function(r){return r[k]>0}).length;return df?Math.log(1+IDX.length/df):0});
 return IDX.map(function(d,i){var s=0,hit=0;sc[i].forEach(function(v,k){s+=v*idf[k];if(v>0)hit++});
  s*=0.5+hit/ts.length;if(qn.length>=4&&d.qn.indexOf(qn)>=0)s+=10;return{it:d.it,s:s}})
  .filter(function(r){return r.s>0}).sort(function(a,b){return b.s-a.s})}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function $(i){return document.getElementById(i)}
var BY={};QA.items.forEach(function(it){BY[it.id]=it});
var SENDER=['setup-any','setup-outside','setup-verified','setup-pressure','setup-with-rc','setup-again','lookalike','new-broker','known-broker-changed'];
var EMAIL=/[^\s<>"'(),;:]+@[^\s<>"'(),;:]+\.[a-z]{2,}/i;
var input=$('qa-q'),out=$('qa-out'),picked=null,shown=null;

// ---- one answer at a time
function card(it){return '<article class="qa-ans qa-ans--'+it.lvl+'" id="qa-ans" data-id="'+it.id+'"><div class="qa-tag">'+QA.levels[it.lvl]+'</div>'
 +'<p class="qa-sit">'+esc(it.q)+'</p><h2 class="qa-do">'+esc(it.do)+'</h2>'+(it.a?'<p class="qa-a">'+esc(it.a)+'</p>':'')
 +'<ol class="qa-steps">'+it.steps.map(function(s){return '<li>'+esc(s)+'</li>'}).join('')+'</ol><div class="qa-links">'
 +(SENDER.indexOf(it.id)>=0?'<button type="button" data-go="sender">Check a sender →</button>':'')
 +'<a href="module.html?m=email-course#m'+it.mod+'">Learn more in Module '+it.mod+' →</a></div></article>'}
function tiles(){return '<p class="qa-label">Common situations</p><div class="qa-tiles">'+QA.common.map(function(c){
 return '<button type="button" class="qa-tile" data-pick="'+c.id+'">'+esc(c.label)+'</button>'}).join('')+'</div>'}
var ALL='<details class="qa-all"><summary>See all '+QA.items.length+' situations</summary>'+QA.cats.map(function(c){
 return '<h3>'+esc(c.title)+'</h3><ul>'+QA.items.filter(function(it){return it.cat===c.id}).map(function(it){
  return '<li><button type="button" data-pick="'+it.id+'">'+esc(it.q)+'</button></li>'}).join('')+'</ul>'}).join('')+'</details>';
var FOOT='<p class="qa-foot">Can’t find it? Don’t guess. Ask someone with more experience before you act.</p>';
function render(){var q=input.value.trim(),h='',addr=q.match(EMAIL);
 if(addr)h+='<p class="qa-hint">That looks like an email address. <button type="button" data-go="sender" data-addr="'+esc(addr[0])+'">Check this sender →</button></p>';
 if(!q){h+=picked?card(BY[picked])+'<button type="button" class="qa-back" data-pick="">← Back to common situations</button>':tiles()+ALL;out.innerHTML=h;return}
 var res=search(q);
 if(!res.length){out.innerHTML=h+(addr?'':'<p class="qa-none">No match for that. Try other words, or pick one of these:</p>'+tiles()+FOOT);return}
 var list=res.filter(function(r){return r.s>=res[0].s*0.35}).slice(0,4).map(function(r){return r.it});
 var cur=list.filter(function(it){return it.id===shown})[0]||list[0],rest=list.filter(function(it){return it!==cur});
 h+=card(cur);
 if(rest.length)h+='<div class="qa-also"><span>Not it? Try:</span>'+rest.map(function(it){return '<button type="button" class="qa-alt" data-show="'+it.id+'">'+esc(it.q)+'</button>'}).join('')+'</div>';
 out.innerHTML=h+FOOT}
input.addEventListener('input',function(){picked=null;shown=null;render()});
document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('[data-pick],[data-show],[data-go],[data-mode]');if(!b)return;
 if(b.hasAttribute('data-mode'))return mode(b.getAttribute('data-mode'));
 if(b.hasAttribute('data-go')){mode('sender');var a=b.getAttribute('data-addr');if(a){snd.value=a;check()}return}
 if(b.hasAttribute('data-show')){shown=b.getAttribute('data-show');render();return}
 picked=b.getAttribute('data-pick')||null;shown=null;input.value='';render();
 if(out.getBoundingClientRect().top<0)$('mode-find').scrollIntoView()});
document.addEventListener('keydown',function(e){if(e.key==='/'&&!/INPUT|TEXTAREA/.test(document.activeElement.tagName)){e.preventDefault();mode('find');input.focus()}});
function mode(m){$('mode-find').hidden=m!=='find';$('mode-sender').hidden=m!=='sender';
 document.querySelectorAll('.qa-mode [data-mode]').forEach(function(b){var on=b.getAttribute('data-mode')===m;b.classList.toggle('is-on',on);b.setAttribute('aria-selected',on)})}
render();

// ---- is this sender real?
var snd=$('snd'),sout=$('snd-out');
function core(d){return d.replace(/\.(com|net|org|co|io|us|info|biz)$/,'').replace(/[^a-z0-9]/g,'')}
function marks(a,b){var n=a.length,m=b.length,L=[],i,j;for(i=0;i<=n;i++){L[i]=[];for(j=0;j<=m;j++)L[i][j]=0}
 for(i=n-1;i>=0;i--)for(j=m-1;j>=0;j--)L[i][j]=a[i]===b[j]?L[i+1][j+1]+1:Math.max(L[i+1][j],L[i][j+1]);
 var o='';i=0;j=0;while(i<n){if(j<m&&a[i]===b[j]){o+=esc(a[i]);i++;j++}else if(j<m&&L[i][j+1]>=L[i+1][j])j++;else{o+='<mark>'+esc(a[i])+'</mark>';i++}}return o}
function verdict(lvl,tag,big,line,extra){return '<article class="qa-ans qa-ans--'+lvl+'"><div class="qa-tag">'+tag+'</div><h2 class="qa-do" style="margin-top:8px">'+big+'</h2>'+(extra||'')+'<p class="qa-a">'+line+'</p></article>'}
function check(){var raw=snd.value.trim(),m=raw.match(/[^\s<>"'(),;:]+@[^\s<>"'(),;:]+/);
 if(!m){sout.innerHTML=raw?'<p class="qa-hint">Paste a full address, like hello@highway.com.</p>':'';return}
 var a=m[0].toLowerCase().replace(/\.+$/,''),dom=a.split('@')[1];
 var exact=QA.senders.filter(function(t){return t.address===a})[0];
 if(exact){sout.innerHTML=verdict('pass','Real sender','Yes, this is the real '+esc(exact.service)+' address.','Still make sure we asked for this setup, and check who else is on the chain.');return}
 var same=QA.senders.filter(function(t){return t.address.split('@')[1]===dom})[0];
 if(same){sout.innerHTML=verdict('scam','Red flag','Wrong address. Don’t complete it.','Only <code>'+esc(same.address)+'</code> is trusted for '+esc(same.service)+'. Have someone check it first.');return}
 var c=core(dom),best=null;QA.senders.forEach(function(t){var td=t.address.split('@')[1],d=lev(c,core(td)),hit=t.look.some(function(k){return c.indexOf(k)>=0});
  var sc=hit?0:d;if(sc<=3&&(!best||sc<best.sc))best={t:t,sc:sc,td:td}});
 if(best){sout.innerHTML=verdict('scam','Red flag','Fake look-alike. Don’t click anything.','The real '+esc(best.t.service)+' sender is <code>'+esc(best.t.address)+'</code>. Flag this email.',
  '<p class="snd-diff">'+esc(a.split('@')[0])+'@'+marks(dom,best.td)+'</p>');return}
 sout.innerHTML=verdict('check','Check first','Not a trusted setup sender.','If this is a setup or carrier packet, don’t complete it. Ask for it through RMIS, MyCarrierPackets or Highway.')}
$('snd-go').addEventListener('click',check);
snd.addEventListener('keydown',function(e){if(e.key==='Enter')check()});
})();
</script>"""
    return shell("Email Quick Answers", "EMAIL & INBOX", "Type what's happening, or tap a common situation. You get one clear answer.",
                 body, script=script)

def page_simulator():
    cases = json.loads((SRC / "simulator-cases.json").read_text(encoding="utf-8"))["cases"]
    sim = ROOT / "tools" / "sim"
    css = (sim / "engine.css").read_text(encoding="utf-8")
    js = (sim / "engine.js").read_text(encoding="utf-8")
    data = json.dumps(cases, ensure_ascii=False).replace("</", "<\\/")
    body = f'<style>{css}</style><div id="sim"></div>'
    script = f"<script>window.UGL_SIM_CASES={data};</script><script>{js}</script>"
    return shell("Work Simulator", "PRACTICE", "Handle a real shift: emails from brokers and Telegram messages from drivers arrive one by one. "
                 "Choose what to do, write the replies, and get scored against company policy.",
                 body, chips=[f"{len(cases)} CASES", "GMAIL + TELEGRAM", "SCORED"], script=script, wide=True)

# --------------------------------------------------------------------- main
def main():
    if OUT.exists():
        for sub in ("pages", "files"):
            shutil.rmtree(OUT / sub, ignore_errors=True)
    (OUT / "pages").mkdir(parents=True, exist_ok=True)
    (OUT / "files").mkdir(parents=True, exist_ok=True)
    def w(name, content):
        (OUT / "pages" / name).write_text(content, encoding="utf-8"); print("page ", name, f"{len(content)//1024} KB")
    for slug_, f in (("dry-van", "policy-dry-van.docx"), ("reefer", "policy-reefer.docx"),
                     ("flatbed", "policy-flatbed.docx"), ("power-only", "policy-power-only.docx")):
        w(f"policy-{slug_}.html", render_policy(SRC / f, "Source: UGL Dispatch Services dispatching policy. Non-compliance leads to progressive discipline: warning, then fine, then suspension."))
    axles = parse_axles(); states = parse_states()
    print("axle rows:", len(axles), "states:", len(states))
    assert len(axles) >= 48 and len(states) >= 45
    w("axle-weights.html", page_axles(axles)); w("state-limits.html", page_states(states))
    w("simulator.html", page_simulator())
    w("fmcsa-summary.html", render_fmcsa(SRC / "fmcsa-summary.docx"))
    w("responsibilities.html", render_checklist(SRC / "responsibility-checklist.docx"))
    w("email-course.html", render_email_course(SRC / "carrier-dispatch-email-course.html"))
    w("email-answers.html", page_email_answers(SRC / "email-answers.json", SRC / "carrier-dispatch-email-course.html"))
    w("dot-levels.html", page_levels()); w("accident-test.html", page_accident()); w("fix-the-weight.html", page_fix_weight())
    road = Road(SRC, (ROOT / "ugl-catalog.js").read_text(encoding="utf-8"), shell, TOC_SCRIPT)
    for name, page in road.pages().items():
        w(name, page)
    for name in ("sample-rate-confirmation", "cargo-claims-presentation", "cpdp-eligibility-guide", "chain-laws"):
        shutil.copy(SRC / f"{name}.pdf", OUT / "files" / f"{name}.pdf"); print("file ", name + ".pdf")

if __name__ == "__main__":
    main()
