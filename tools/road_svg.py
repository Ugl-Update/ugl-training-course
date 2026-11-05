"""Inline SVG diagrams for the road stops: `{"diagram": "<name>"}` blocks in sources/road/stops/*.json.

Drawn by hand, so each one shows only what the lesson needs to teach. Colours come from the site's
CSS tokens through class names (ugl-page.css: .dg-*), so every diagram works in both themes.
"""
import html

esc = html.escape
W = 760  # every diagram is drawn on a 760-wide canvas and scales to its column


def svg(h, body, label):
    return (f'<svg class="dg__svg" viewBox="0 0 {W} {h}" role="img" aria-label="{esc(label)}" xmlns="http://www.w3.org/2000/svg">'
            f'<defs><marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            f'<path d="M0 0L10 5 0 10z" class="dg-arrowhead"/></marker>'
            f'<pattern id="dg-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" class="dg-fill"/><line x1="0" y1="0" x2="0" y2="6" class="dg-hatchline"/></pattern>'
            f'</defs>{body}</svg>')


def text(x, y, s, cls="dg-t", anchor="middle", size=14, weight="", extra=""):
    w = f' font-weight="{weight}"' if weight else ""
    return f'<text x="{x}" y="{y}" class="{cls}" text-anchor="{anchor}" font-size="{size}"{w}{extra}>{esc(s)}</text>'


def lines(x, y, items, cls="dg-t", anchor="middle", size=13, lh=16, weight=""):
    return "".join(text(x, y + i * lh, s, cls, anchor, size, weight) for i, s in enumerate(items))


def box(x, y, w, h, cls="dg-box", r=8):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" class="{cls}"/>'


def arrow(x1, y1, x2, y2, cls="dg-l"):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" class="{cls}" marker-end="url(#dg-arrow)"/>'


def wheel(cx, cy, r=16):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" class="dg-wheel"/><circle cx="{cx}" cy="{cy}" r="{r * 0.45:.1f}" class="dg-hub"/>'


# ------------------------------------------------------------------ 1. axles and the two slides
def axles():
    g = 212  # ground line
    b = [box(560, 70, 150, 110, "dg-cab", 10), box(585, 85, 60, 40, "dg-glass", 4),    # cab, window
         box(70, 60, 500, 120, "dg-trailer", 6),                                       # trailer
         f'<line x1="40" y1="{g}" x2="{W - 30}" y2="{g}" class="dg-l"/>']
    # Wheels: steer (right), drive tandem (under the cab's back), trailer tandem (left part of the trailer).
    b += [wheel(690, g - 16), wheel(548, g - 16), wheel(510, g - 16), wheel(190, g - 16), wheel(152, g - 16)]
    # Fifth wheel plate and tandem slider rails.
    b += [box(500, 176, 70, 8, "dg-slider", 2), box(120, 176, 110, 8, "dg-slider", 2)]
    # Weight labels under each axle group.
    b += [lines(690, g + 30, ["Steer", "12,000 lb", "up to 12,400 when the", "other axles are legal"], "dg-t", size=12, lh=15),
          lines(529, g + 30, ["Drive", "34,000 lb"], "dg-t", size=12, lh=15),
          lines(171, g + 30, ["Trailer", "34,000 lb"], "dg-t", size=12, lh=15),
          text(320, g + 45, "Gross (all axles together): 80,000 lb", "dg-m", size=12)]
    # Slide arrows and what each one does.
    b += [arrow(535, 40, 605, 40, "dg-a-l"), arrow(535, 40, 465, 40, "dg-a-l"),
          text(535, 26, "5th wheel · 1 hole = 500 lb", "dg-a", size=12, weight="700"),
          lines(535, 56, ["forward: steer heavier, drive lighter"], "dg-m", size=11),
          arrow(175, 40, 245, 40, "dg-a-l"), arrow(175, 40, 105, 40, "dg-a-l"),
          text(175, 26, "Tandem · 1 hole = 250 lb", "dg-a", size=12, weight="700"),
          lines(175, 56, ["forward: trailer heavier, drive lighter", "backward: trailer lighter, drive heavier"], "dg-m", size=11, lh=13)]
    b += [text(350, 120, "A slide moves weight from one axle to the next. The gross never changes.", "dg-t", size=13, weight="600"),
          text(350, 140, "Only burning fuel (7 lb a gallon, by the drive axle) makes the truck lighter.", "dg-m", size=12)]
    return svg(300, "".join(b), "Side view of a truck: the fifth wheel slides weight between the steer and drive axles, the tandem between the drive and trailer axles")


# ------------------------------------------------------------------ 2. pallets: top view of the trailer floor
def pallets():
    panels = [
        ("Gaps at the wall", "Ask the shipper for airbags", "gap"),
        ("No airbags: turn them 90°", "The row is full, nothing can move", "turn"),
        ("One pallet alone at the end", "Ask them to split it in two", "alone"),
        ("Last row: load locks", "Short pallets 2+, long 3–4", "locks"),
    ]
    out = []
    pw, ph = 150, 170  # trailer floor drawing
    for i, (h1, h2, kind) in enumerate(panels):
        x0 = 20 + i * 185
        out.append(box(x0, 50, pw, ph, "dg-trailer-top", 4))
        out.append(text(x0 + pw / 2, 30, h1, "dg-t", size=13, weight="700"))
        out.append(text(x0 + pw / 2, 245, h2, "dg-a", size=12, weight="600"))
        # pallets as squares in two columns (48 x 40 in a 100-wide trailer ~ 56 x 46 here)
        def pal(px, py, w=56, h=46, cls="dg-pallet"):
            return box(px, py, w, h, cls, 3)
        if kind == "gap":
            for r in range(3):
                out.append(pal(x0 + 8, 58 + r * 54)); out.append(pal(x0 + 70, 58 + r * 54))
            out.append(box(x0 + 128, 58, 16, 154, "dg-gap", 2))
            out.append(text(x0 + 136, 140, "air", "dg-a", size=9, weight="700", extra=' transform="rotate(-90 ' + str(x0 + 136) + ' 140)"'))
        elif kind == "turn":
            for r in range(3):
                out.append(pal(x0 + 8, 58 + r * 54, 65, 46)); out.append(pal(x0 + 77, 58 + r * 54, 65, 46))
            out.append(text(x0 + pw / 2, 215, "pallets turned: 2 × 48 in fills the 100 in width", "dg-m", size=9))
        elif kind == "alone":
            for r in range(2):
                out.append(pal(x0 + 8, 58 + r * 54)); out.append(pal(x0 + 70, 58 + r * 54))
            out.append(pal(x0 + 8, 166, 56, 46, "dg-pallet-bad"))
            out.append(text(x0 + 100, 194, "empty", "dg-m", size=11))
        else:
            for r in range(3):
                out.append(pal(x0 + 8, 58 + r * 54)); out.append(pal(x0 + 70, 58 + r * 54))
            for k, y in enumerate((178, 192, 206)):
                out.append(f'<line x1="{x0 + 4}" y1="{y}" x2="{x0 + pw - 4}" y2="{y}" class="dg-lock"/>')
            out.append(text(x0 + pw / 2, 226, "load locks across the trailer, against the last row", "dg-m", size=8.5))
    out.append(text(W / 2, 272, "Top view. The doors are at the bottom of each drawing; the load must not be able to slide towards them.", "dg-m", size=12))
    return svg(285, "".join(out), "Top view of a trailer floor: gaps need airbags, pallets turned to fill the row, a lone pallet split in two, load locks across the last row")


# ------------------------------------------------------------------ 3. the reefer control panel
def reefer_panel():
    out = []
    # Carrier-style panel on the left.
    out += [box(20, 20, 440, 230, "dg-panel", 14), box(60, 50, 300, 150, "dg-screen", 8)]
    out += [text(80, 78, "CONTINUOUS", "dg-screen-t", "start", 15, "700"), text(300, 78, "DIESEL · COOL", "dg-screen-m", "start", 12)]
    out += [text(95, 160, "37", "dg-screen-t", "start", 64, "800"), text(176, 160, ".9", "dg-screen-t", "start", 30, "700"),
            text(250, 160, "38", "dg-screen-t", "start", 40, "700"),
            text(135, 182, "BOX TEMPERATURE °F", "dg-screen-m", "middle", 9), text(272, 182, "SETPOINT °F", "dg-screen-m", "middle", 9),
            text(210, 196, "STATUS OK", "dg-screen-t", "middle", 12, "700")]
    out += [f'<circle cx="400" cy="60" r="9" class="dg-lamp-off"/>', text(400, 90, "ALARM", "dg-m", size=10),
            box(380, 110, 60, 26, "dg-btn", 5), text(410, 128, "START/STOP", "dg-m", size=8), box(380, 146, 60, 26, "dg-btn", 5), text(410, 164, "CONTINUOUS", "dg-m", size=8)]
    # Callouts (numbered) pointing at the five things to read. The screen's own words above stay as the unit prints them;
    # the course's labels are sentence case.
    call = [(1, 100, 84, 95, 38), (2, 150, 172, 120, 230), (3, 268, 172, 300, 230), (4, 400, 60, 560, 60), (5, 210, 196, 560, 200)]
    for n, px, py, lx, ly in call:
        out.append(f'<line x1="{px}" y1="{py}" x2="{lx}" y2="{ly}" class="dg-a-thin"/>')
        out.append(f'<circle cx="{lx}" cy="{ly}" r="11" class="dg-badge"/>' + text(lx, ly + 4, str(n), "dg-badge-t", size=11, weight="700"))
    out += [text(580, 64, "Alarm lamp: must be off", "dg-t", "start", 12), text(580, 204, "Status note: read it,", "dg-t", "start", 12),
            text(580, 219, "ask maintenance if unsure", "dg-m", "start", 11),
            text(95, 42, "Mode: must match the BOL / RC", "dg-t", "start", 11), text(120, 244, "Box temp: inside now", "dg-t", size=11),
            text(300, 244, "Set point: the setting", "dg-t", size=11)]
    # Thermo King variant: mode is a lit button.
    out += [box(500, 100, 240, 90, "dg-panel", 10), box(520, 112, 140, 66, "dg-screen", 6),
            text(560, 150, "-9.8", "dg-screen-t", "middle", 24, "800"), text(625, 150, "-10", "dg-screen-t", "middle", 15, "700"),
            text(590, 170, "box · set point", "dg-screen-m", "middle", 9),
            box(672, 118, 56, 24, "dg-btn-lit", 5), text(700, 134, "CONT", "dg-badge-t", size=9, weight="700"),
            box(672, 150, 56, 24, "dg-btn", 5), text(700, 166, "START/STOP", "dg-m", size=7.5),
            text(620, 92, "Thermo King: the lit button is the mode", "dg-m", size=11)]
    return svg(262, "".join(out), "A reefer control panel: mode top left, big box temperature, small set point, the alarm lamp and the status line")


# ------------------------------------------------------------------ 4. which update? decision tree
def update_tree(part="both"):
    out = []
    y0 = 20
    def node(x, y, w, h, title, sub="", cls="dg-box"):
        s = [box(x, y, w, h, cls, 8), text(x + w / 2, y + 20 if sub else y + h / 2 + 5, title, "dg-t", size=12.5, weight="700")]
        if sub: s.append(text(x + w / 2, y + 38, sub, "dg-m", size=11))
        return "".join(s)
    def leaf(x, y, w, title, msg):
        return box(x, y, w, 52, "dg-leaf", 8) + text(x + w / 2, y + 20, title, "dg-t", size=12, weight="700") + text(x + w / 2, y + 38, msg, "dg-a", size=11)
    if part == "shipper":
        out.append(node(280, y0, 200, 44, "On the way to the shipper", "never the current location"))
        out.append(arrow(380, y0 + 44, 200, 100)); out.append(arrow(380, y0 + 44, 560, 100))
        out.append(node(120, 100, 160, 36, "Rolling")); out.append(node(480, 100, 160, 36, "Stopped"))
        out.append(arrow(200, 136, 110, 180)); out.append(arrow(200, 136, 290, 180))
        out.append(text(130, 165, "> 50 mi", "dg-m", size=11)); out.append(text(275, 165, "< 50 mi", "dg-m", size=11))
        out.append(leaf(20, 180, 180, "On the way to the shipper", "no miles, no location"))
        out.append(leaf(210, 180, 180, "…now ___ miles away", "the miles, no location"))
        out.append(arrow(560, 136, 560, 180)); out.append(text(600, 165, "> 5 mi, appointment near", "dg-m", "start", 11))
        out.append(leaf(470, 180, 230, "___ miles from the shipper", "waiting till the appointment time"))
        out.append(text(W / 2, 262, "On time and the broker asks? \"We will pick up on time.\"", "dg-m", size=12))
        return svg(275, "".join(out), "Which update on the way to the shipper: rolling more or less than 50 miles, or stopped near the shipper")
    out.append(node(280, y0, 200, 44, "On the way to the receiver", "with the current location"))
    out.append(arrow(380, y0 + 44, 140, 100)); out.append(arrow(380, y0 + 44, 380, 100)); out.append(arrow(380, y0 + 44, 620, 100))
    out.append(text(230, 80, "> 200 mi", "dg-m", size=11)); out.append(text(405, 80, "< 200 mi, rolling", "dg-m", "start", 11)); out.append(text(520, 80, "< 200 mi, stopped", "dg-m", size=11))
    out.append(leaf(40, 100, 200, "The usual update", "Current location · Status"))
    out.append(leaf(280, 100, 200, "…now ___ miles away", "Current location"))
    out.append(node(520, 100, 200, 36, "ETA still good?"))
    out.append(arrow(620, 136, 620, 180)); out.append(text(660, 165, "yes", "dg-m", "start", 11))
    out.append(leaf(520, 180, 200, "___ miles from the receiver", "waiting till the appointment"))
    out.append(arrow(140, 152, 140, 180)); out.append(text(150, 170, "same place as last time, ETA good", "dg-m", "start", 10.5))
    out.append(leaf(40, 180, 200, "All is good", "nothing else to say"))
    out.append(box(280, 180, 200, 52, "dg-warn", 8)); out.append(text(380, 200, "ETA bad: running late", "dg-t", size=12, weight="700")); out.append(text(380, 218, "broker hears within 1 hour", "dg-a", size=11))
    out.append(text(W / 2, 262, "Traffic or weather? Say so in the same update: rolling slowly, or pulled over.", "dg-m", size=12))
    return svg(275, "".join(out), "Which update on the way to the receiver: over 200 miles the usual update, under 200 rolling or stopped, late means the broker hears within the hour")


# ------------------------------------------------------------------ 5. lumper and late fees
def fee_flow():
    out = []
    def step(x, y, w, h, t1, t2="", cls="dg-box"):
        s = [box(x, y, w, h, cls, 8), text(x + w / 2, y + 19 if t2 else y + h / 2 + 5, t1, "dg-t", size=12, weight="700")]
        if t2: s.append(text(x + w / 2, y + 36, t2, "dg-m", size=10.5))
        return "".join(s)
    out.append(step(20, 20, 190, 50, "Link texted to the driver", "share it in the group, open it"))
    out.append(step(230, 20, 190, 50, "No link, just an amount", "driver confirms amount + method"))
    out.append(arrow(115, 70, 200, 110)); out.append(arrow(325, 70, 240, 110))
    out.append(step(120, 110, 200, 50, "Email the broker", "amount, link, screenshot"))
    out.append(arrow(220, 160, 220, 200)); out.append(text(232, 185, "no answer in 5 min", "dg-a", "start", 11, "700"))
    out.append(step(120, 200, 200, 44, "Call the broker"))
    out.append(arrow(220, 244, 220, 290))
    # outcomes row
    outcomes = [(20, "Money code", "enter it with no spaces", "dg-leaf"), (170, "They pay the link", "send them the link", "dg-leaf"),
                (320, "“Pay, we reimburse”", "get it by email → EFS", "dg-box"), (470, "They can’t pay", "screenshot → EFS", "dg-box"),
                (620, "No answer 15–20 min", "screenshots → EFS", "dg-warn")]
    for x, t1, t2, cls in outcomes:
        out.append(f'<line x1="220" y1="290" x2="{x + 65}" y2="300" class="dg-l"/>')
        out.append(step(x, 300, 130, 50, t1, t2, cls))
    out.append(arrow(385, 350, 385, 392)); out.append(arrow(535, 350, 400, 392)); out.append(arrow(685, 350, 415, 392))
    out.append(step(290, 392, 190, 44, "EFS request in the group", "exact amount + proof"))
    out.append(arrow(85, 350, 85, 470)); out.append(arrow(235, 350, 235, 470)); out.append(arrow(385, 436, 385, 470))
    out.append(step(20, 470, 400, 44, "Paid → receipt to the driver's group and to the broker"))
    return svg(530, "".join(out), "The lumper and late fee flow: link or amount, email the broker, call after 5 minutes, the five outcomes, EFS when needed, receipt at the end")


# ------------------------------------------------------------------ 6. hook-and-drop routes (from the stop's `routes` data)
def routes(cases):
    out, y = [], 10
    for title, steps in cases:
        out.append(text(20, y + 16, title, "dg-a", "start", 11, "700"))
        n = len(steps)
        gap = (W - 60) / max(1, n - 1) if n > 1 else 0
        for i, (place, what) in enumerate(steps):
            cx = 50 + i * gap if n > 1 else W / 2
            cy = y + 60
            if i < n - 1 and not place.lower().startswith("1 week"):
                out.append(arrow(cx + 26, cy, cx + gap - 26, cy))
            low = what.lower()
            loaded = ("preloaded" in low or "loaded" in low or "get loaded" in low or "gets loaded" in low) and "empty" not in low and "unload" not in low
            keep = "load out" in low or "keep" in low
            cls = "dg-trl-loaded" if loaded else "dg-trl-keep" if keep else "dg-trl-empty"
            out.append(box(cx - 22, cy - 14, 44, 28, cls, 3) + f'<circle cx="{cx - 10}" cy="{cy + 16}" r="4" class="dg-hub"/><circle cx="{cx + 10}" cy="{cy + 16}" r="4" class="dg-hub"/>')
            tag = "Drop" if low.startswith("drop") else "Hook" if low.startswith("hook") or "hook" in low else "Unload" if "unload" in low else "Load" if "loaded" in low or "load" in low else ""
            if tag: out.append(text(cx, cy - 20, tag, "dg-a", size=9, weight="700"))
            out.append(text(cx, cy + 40, place, "dg-t", size=12, weight="700"))
            out.append(lines(cx, cy + 56, _wrap(what, 20), "dg-m", size=10.5, lh=12))
        if any(p.lower().startswith("1 week") for p, _ in steps):
            out.append(f'<path d="M{W - 50} {y + 95} C {W - 50} {y + 125}, 50 {y + 125}, 50 {y + 95}" class="dg-a-l" marker-end="url(#dg-arrow)" fill="none"/>')
            out.append(text(W / 2, y + 118, "back to PU1 after the week", "dg-a", size=10.5))
        y += 140
    out.append(text(W / 2, y + 6, "outline = empty trailer · filled = loaded · dashed = stays with us as a load out trailer", "dg-m", size=11))
    return svg(y + 16, "".join(out), "The hook and drop patterns, one line each: where the truck hooks, loads, unloads and drops the trailer")


def _wrap(s, n):
    words, out, cur = s.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > n and cur:
            out.append(cur); cur = w
        else:
            cur = (cur + " " + w).strip()
    if cur: out.append(cur)
    return out[:3]


# ------------------------------------------------------------------ 7. the four time zones
def zones():
    Z = [("Pacific", "PT", "9:00 AM", ["Los Angeles", "Seattle", "Las Vegas"]), ("Mountain", "MT", "10:00 AM", ["Denver", "Phoenix*", "Salt Lake City"]),
         ("Central", "CT", "11:00 AM", ["Chicago", "Dallas", "Kansas City"]), ("Eastern", "ET", "12:00 PM", ["New York", "Atlanta", "Miami"])]
    out = []
    bw = (W - 40) / 4
    for i, (name, ab, t, cities) in enumerate(Z):
        x = 20 + i * bw
        out.append(box(x + 3, 20, bw - 6, 150, f"dg-zone dg-zone-{i}", 6))
        out.append(text(x + bw / 2, 46, name, "dg-t", size=12, weight="700")); out.append(text(x + bw / 2, 80, t, "dg-t", size=24, weight="800"))
        out.append(lines(x + bw / 2, 106, cities, "dg-m", size=11.5, lh=15))
        out.append(text(x + bw / 2, 160, ab, "dg-a", size=11, weight="700"))
        if i < 3: out.append(text(x + bw, 15, "+1 h →", "dg-a", size=11, weight="700"))
    out.append(text(W / 2, 195, "Same moment, four clocks. Every step east is one hour later; west, one hour earlier.", "dg-t", size=12.5))
    out.append(text(W / 2, 214, "*Arizona does not change its clock in summer. Some states are split: check the city, not the state.", "dg-m", size=11))
    return svg(226, "".join(out), "The four US time zones from Pacific to Eastern, each one hour later than the one to its west")


# ------------------------------------------------------------------ 8. even and odd interstates
def interstates():
    out = [box(60, 30, 640, 230, "dg-map", 10)]
    for k, (name, y) in enumerate((("I-90", 60), ("I-80", 100), ("I-70", 140), ("I-40", 190), ("I-10", 235))):
        out.append(f'<line x1="70" y1="{y}" x2="690" y2="{y}" class="dg-road-even"/>')
        out.append(box(100, y - 10, 42, 20, "dg-shield", 4) + text(121, y + 4, name, "dg-shield-t", size=10.5, weight="700"))
    for name, x in (("I-5", 110), ("I-15", 190), ("I-35", 370), ("I-75", 540), ("I-95", 650)):
        out.append(f'<line x1="{x}" y1="40" x2="{x}" y2="250" class="dg-road-odd"/>')
        out.append(box(x - 21, 40, 42, 20, "dg-shield-odd", 4) + text(x, 54, name, "dg-shield-t", size=10.5, weight="700"))
    out.append(text(W / 2, 20, "N", "dg-m", size=11, weight="700"))
    out.append(text(40, 150, "W", "dg-m", size=11, weight="700")); out.append(text(720, 150, "E", "dg-m", size=11, weight="700"))
    out.append(text(W / 2, 284, "Even numbers run east–west and grow from south (I-10) to north (I-90).", "dg-t", size=12.5, weight="600"))
    out.append(text(W / 2, 302, "Odd numbers run north–south and grow from west (I-5) to east (I-95).", "dg-t", size=12.5, weight="600"))
    return svg(314, "".join(out), "A simple grid of interstates: even numbers run east to west, odd numbers north to south")


# ------------------------------------------------------------------ 9. the shipper clock
def shipper_clock():
    out = []
    x0, x1, y = 60, 700, 70
    out.append(f'<line x1="{x0}" y1="{y}" x2="{x1}" y2="{y}" class="dg-bar"/>')
    for h in range(0, 5):
        x = x0 + (x1 - x0) * h / 4.5
        out.append(f'<line x1="{x}" y1="{y - 8}" x2="{x}" y2="{y + 8}" class="dg-l"/>'); out.append(text(x, y + 26, f"{h} h", "dg-m", size=11))
    marks = [(0, "Check in", ["help with the PU#", "tell the broker: on site"], "dg-badge"), (2, "Ask the driver", ["a door? being loaded?", "keep the broker posted"], "dg-badge"),
             (3.5, "Email, then call", ["the broker: help", "speed up the loading"], "dg-badge"), (4, "Detention", ["times on the BOL,", "tell the broker"], "dg-badge-red")]
    for h, t, sub, cls in marks:
        x = x0 + (x1 - x0) * h / 4.5
        out.append(f'<circle cx="{x}" cy="{y}" r="9" class="{cls}"/>')
        ty = 40 if h != 3.5 else 118
        out.append(text(x, ty - 14 if h != 3.5 else ty, t, "dg-t", size=12.5, weight="700"))
        out.append(lines(x, (ty + 2) if h != 3.5 else ty + 16, sub, "dg-m", size=10.5, lh=12))
    out.append(text(W / 2, 170, "Count from the check-in time. Detention only when the appointment is not FCFS; on FCFS loads keep emailing and calling, no detention.", "dg-t", size=12))
    return svg(184, "".join(out), "The shipper clock: check in at 0, ask the driver at 2 hours, email then call the broker at 3 to 4 hours, detention from 4 hours on loads that are not FCFS")


# ------------------------------------------------------------------ 10. where the pulp goes
def pulp():
    out = []
    def pallet(x, y):
        s = [box(x, y + 120, 170, 16, "dg-pallet", 2)]
        for r in range(3):
            for c in range(3):
                s.append(box(x + c * 57, y + r * 40, 54, 38, "dg-crate", 3))
        return "".join(s)
    out.append(text(110, 24, "Probe between the boxes, touching the product", "dg-t", "start", 12.5, "700"))
    out.append(pallet(40, 40))
    out.append(f'<line x1="154" y1="20" x2="154" y2="96" class="dg-probe"/><circle cx="154" cy="18" r="6" class="dg-badge"/>')
    out.append(text(240, 100, "not in the air", "dg-a", "start", 11, "700")); out.append(text(240, 116, "wait 5 minutes, then the picture", "dg-m", "start", 11))
    out.append(text(240, 132, "2–3 pallets, different places", "dg-m", "start", 11))
    out.append(text(440, 24, "Heavily wrapped? Take one box out", "dg-t", "start", 12.5, "700"))
    out.append(pallet(430, 40))
    out.append(box(630, 70, 100, 70, "dg-crate-open", 4)); out.append(f'<line x1="680" y1="40" x2="680" y2="105" class="dg-probe"/><circle cx="680" cy="38" r="6" class="dg-badge"/>')
    out.append(text(680, 158, "probe inside the box", "dg-a", size=11, weight="700"))
    out.append(text(W / 2, 185, "Never pulp chicken, meat, fish or dairy. Berries, fruit and vegetables: always.", "dg-t", size=12.5, weight="600"))
    return svg(198, "".join(out), "Where the pulp thermometer goes: between the boxes touching the product, or inside a box taken out of a heavily wrapped pallet")


# ------------------------------------------------------------------ 11. one load, start to finish
def load_timeline():
    stops = [("To the shipper", "update, no location"), ("At the shipper", "on site · 2 h · 4 h"), ("Loaded", "checks, stand by"),
             ("Pickup email", "Good to Go in writing"), ("In transit", "every 3 hours"), ("At the receiver", "on site · fees"),
             ("Delivered", "POD within 1 hour"), ("Closed", "LOAD# Completed")]
    out = [f'<line x1="40" y1="70" x2="{W - 40}" y2="70" class="dg-bar"/>']
    n = len(stops)
    for i, (t, s) in enumerate(stops):
        x = 50 + i * (W - 100) / (n - 1)
        out.append(f'<circle cx="{x}" cy="70" r="10" class="{"dg-badge-red" if i in (3, 6) else "dg-badge"}"/>')
        out.append(text(x, 70 + 4, str(i + 1), "dg-badge-t", size=10, weight="700"))
        ty = 40 if i % 2 == 0 else 100
        out.append(text(x, ty, t, "dg-t", size=12, weight="700")); out.append(text(x, ty + 15 if i % 2 else ty - 15, s, "dg-m", size=10.5))
    out.append(text(W / 2, 140, "Every dot is something the broker receives. The red ones need an answer in writing: Good to Go, and the POD.", "dg-m", size=11.5))
    return svg(152, "".join(out), "One load from the road to the shipper to the completed POD, as the sequence of messages the broker receives")


DIAGRAMS = {"axles": axles, "pallets": pallets, "reefer-panel": reefer_panel, "update-tree": lambda: update_tree("both"),
            "update-tree-shipper": lambda: update_tree("shipper"), "fee-flow": fee_flow, "zones": zones, "interstates": interstates,
            "shipper-clock": shipper_clock, "pulp": pulp, "load-timeline": load_timeline}
