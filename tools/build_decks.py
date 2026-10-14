#!/usr/bin/env python3
"""Build the narrated decks for the private bucket, small enough to open quickly.

  python3 tools/build_decks.py [deck.html ...]

Reads decks/UGL-*-Final.html from the private content repo (../ugl-training-sources by
default; override with UGL_SOURCES) and writes to its upload-to-supabase/ folder:
  UGL-*-Final.html          the deck: old password gate removed, images and fonts recompressed
  audio/UGL-*-Final.pack    its narration, loaded by module.html after the slides are showing

The Industry Reference Guide's card photos (decks/roadbook-assets/<name>.jpg) are put inside
the deck, so nothing it shows is served from the public site.

Narration is re-encoded from 128 kbps to 48 kbps mono (plenty for a voice), images become
WebP when that is clearly smaller, and embedded TTF fonts become WOFF2. The output is
deterministic, so rebuilding unchanged decks gives byte-identical files.

Audio pack format: 4-byte little-endian header length, a UTF-8 JSON header
{"<narration id>": [offset, length], ...}, then the MP3 clips back to back (offsets count
from the end of the header).
Needs: ffmpeg (libmp3lame), Pillow, fontTools + brotli.
"""
import base64, io, json, os, pathlib, re, struct, subprocess, sys, tempfile
from PIL import Image
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = pathlib.Path(os.environ.get("UGL_SOURCES", ROOT.parent / "ugl-training-sources"))
OUT = DATA / "upload-to-supabase"

GATE_RE = re.compile(r'<div id="ugl-pass-gate".*?var UGL_PASS.*?</script>\s*', re.DOTALL)
B64 = r"[A-Za-z0-9+/=]+"
AUDIO_RE = re.compile(r"const AUDIO = \{(.*?)\};", re.DOTALL)
CLIP_RE = re.compile(r"""["']?([\w-]+)["']?\s*:\s*["']data:audio/mpeg;base64,(""" + B64 + """)["']""")
IMG_RE = re.compile(r"data:image/(jpeg|png|webp);base64,(" + B64 + ")")
FONT_RE = re.compile(r"url\(data:font/ttf;base64,(" + B64 + r")\)\s*format\('truetype'\)")
PHOTOS = DATA / "decks" / "roadbook-assets"
# How the reference guide loaded its card photos: from the site's folder, falling back to the few in RBIMG.
PHOTO_JS = """    img.src='roadbook-assets/'+k+'.jpg';
    img.onerror=function(){
      if(typeof RBIMG!=='undefined'&&RBIMG[k]) this.src=RBIMG[k];
    };"""


def embed_photos(src, html):
    """Put every card photo into the deck's RBIMG map and show them from there."""
    if PHOTO_JS not in html:
        if "roadbook-assets/" in html:
            sys.exit(f"{src.name}: refers to roadbook-assets/ in a way this script does not know")
        return html
    m = re.search(r"RBIMG = \{", html)
    if not m:
        sys.exit(f"{src.name}: no RBIMG map found")
    have = set(re.findall(r'"([A-Za-z0-9_]+)":\s*"data:image/', html[m.end():html.index('"};', m.end())]))
    add = []
    for k in sorted(set(re.findall(r'data-rb="([^"]+)"', html)) - have):
        p = PHOTOS / (k + ".jpg")
        if not p.is_file():
            sys.exit(f"{src.name}: photo {p} is missing")
        add.append(f'"{k}": "data:image/jpeg;base64,{base64.b64encode(p.read_bytes()).decode()}", ')
    html = html[:m.end()] + "".join(add) + html[m.end():]
    return html.replace(PHOTO_JS, "    if(RBIMG[k]) img.src=RBIMG[k];")


def mp3_small(data):
    with tempfile.TemporaryDirectory() as d:
        src, dst = pathlib.Path(d, "in.mp3"), pathlib.Path(d, "out.mp3")
        src.write_bytes(data)
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(src), "-map_metadata", "-1", "-ac", "1", "-ar", "24000",
                        "-codec:a", "libmp3lame", "-b:a", "48k", "-fflags", "+bitexact", "-flags:a", "+bitexact", str(dst)], check=True)
        return dst.read_bytes()


def image_small(kind, data):
    """WebP if it saves at least 10%; otherwise the original bytes."""
    im = Image.open(io.BytesIO(data))
    im.load()
    if max(im.size) > 2400:
        im.thumbnail((2400, 2400), Image.LANCZOS)
    alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
    im = im.convert("RGBA" if alpha else "RGB")
    buf = io.BytesIO()
    # Screenshots (PNG) keep more detail than photos.
    im.save(buf, "WEBP", quality=88 if kind == "png" else 80, method=6)
    out = buf.getvalue()
    return ("webp", out) if len(out) < len(data) * 0.9 else (kind, data)


def font_woff2(data):
    f = TTFont(io.BytesIO(data), recalcTimestamp=False)
    f.flavor = "woff2"
    buf = io.BytesIO()
    f.save(buf)
    return buf.getvalue()


def build(src):
    html = src.read_text(encoding="utf-8")
    html, n = GATE_RE.subn("", html, count=1)
    if n != 1 or "UGL_PASS" in html:
        sys.exit(f"{src.name}: password gate not found or not fully removed")
    before = len(html)
    html = embed_photos(src, html)

    # Narration -> separate pack; the deck keeps an empty AUDIO map that module.html fills.
    m = AUDIO_RE.search(html)
    if not m:
        sys.exit(f"{src.name}: no AUDIO map found")
    found = CLIP_RE.findall(m.group(1))
    if not found or len(found) != m.group(1).count("data:audio/"):
        sys.exit(f"{src.name}: could not read every narration clip")
    clips = [(k, mp3_small(base64.b64decode(b))) for k, b in found]
    keys = [k for k, _ in clips]
    stub = "const AUDIO = window.UGL_AUDIO || (window.UGL_AUDIO = {}); const UGL_AUDIO_KEYS = " + json.dumps(keys) + ";"
    html = html[:m.start()] + stub + html[m.end():]
    # The reference guide disables its player when a module has no clip; clips now arrive a moment later.
    html = html.replace("var has=!!AUDIO[id];", "var has=UGL_AUDIO_KEYS.indexOf(id)>=0;")
    if re.search(r"data:audio/[\w.+-]+;base64,[A-Za-z0-9+/]{200}", html):
        sys.exit(f"{src.name}: audio left in the deck")
    if "roadbook-assets/" in html:
        sys.exit(f"{src.name}: still loads photos from the public site")
    header, off = {}, 0
    for k, clip in clips:
        header[k] = [off, len(clip)]
        off += len(clip)
    head = json.dumps(header, separators=(",", ":")).encode()
    pack = struct.pack("<I", len(head)) + head + b"".join(clip for _, clip in clips)

    def small_image(mm):
        kind, data = image_small(mm.group(1), base64.b64decode(mm.group(2)))
        return f"data:image/{kind};base64,{base64.b64encode(data).decode()}"

    def small_font(mm):
        return f"url(data:font/woff2;base64,{base64.b64encode(font_woff2(base64.b64decode(mm.group(1)))).decode()}) format('woff2')"

    html = IMG_RE.sub(small_image, html)
    html = FONT_RE.sub(small_font, html)

    (OUT / "audio").mkdir(parents=True, exist_ok=True)
    (OUT / src.name).write_text(html, encoding="utf-8")
    (OUT / "audio" / src.name.replace(".html", ".pack")).write_bytes(pack)
    print(f"{src.name}: {before / 1e6:.1f} MB -> deck {len(html) / 1e6:.1f} MB + narration {len(pack) / 1e6:.1f} MB ({len(clips)} clips)")


def main():
    files = [pathlib.Path(a) for a in sys.argv[1:]] or sorted((DATA / "decks").glob("UGL-*-Final.html"))
    if not files:
        sys.exit(__doc__)
    for src in files:
        build(src)


if __name__ == "__main__":
    main()
