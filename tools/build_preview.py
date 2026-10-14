#!/usr/bin/env python3
"""Build a self-contained, offline preview of the training site.

  python3 tools/build_content.py           # build the pages first
  python3 tools/build_preview.py OUT_DIR

OUT_DIR/index.html is the whole portal plus every native page, running on browser
storage instead of Supabase (no login). PDFs are rendered to page images in OUT_DIR/pdf/
so they can be viewed inside the preview. The large narrated decks are not bundled.
Needs poppler's pdftoppm.
"""
import base64, json, os, pathlib, re, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = pathlib.Path(os.environ.get("UGL_SOURCES", ROOT.parent / "ugl-training-sources"))  # private content repo
PAGES = DATA / "upload-to-supabase" / "pages"
SRC = DATA / "sources"

# Catalog ids of PDFs that are rendered into the preview, and their source file.
PDFS = {"cargo-claims": "cargo-claims-presentation.pdf", "cpdp-guide": "cpdp-eligibility-guide.pdf", "chain-laws": "chain-laws.pdf"}
# Items deliberately left out of the preview, with the reason shown in their place.
WITHHELD = {
    "sample-rc": "Left out of the preview because it contains real company names, phone numbers and emails. Redact it before launch.",
}


def page_parts(path):
    doc = path.read_text(encoding="utf-8")
    m = re.search(r'<main class="(page[^"]*)">(.*)</main>', doc, re.S)
    scripts = re.findall(r"<script>(.*?)</script>", doc[m.end():], re.S)
    return {"cls": m.group(1), "html": m.group(2), "js": "\n".join(scripts)}


def render_pdfs(out):
    info = {}
    for item_id, name in PDFS.items():
        d = out / "pdf" / item_id
        d.mkdir(parents=True, exist_ok=True)
        subprocess.run(["pdftoppm", "-r", "110", "-jpeg", "-jpegopt", "quality=70", str(SRC / name), str(d / "p")], check=True)
        files = sorted(d.glob("p-*.jpg"), key=lambda p: int(p.stem.split("-")[1]))
        for i, f in enumerate(files, 1):
            f.rename(d / f"{i}.jpg")
        info[item_id] = len(files)
    return info


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
    pages = {}
    for f in sorted(PAGES.glob("*.html")):
        pages[f.stem] = page_parts(f)
    pdf_pages = render_pdfs(out)

    css = "\n".join((ROOT / n).read_text(encoding="utf-8") for n in ("ugl-site.css", "ugl-page.css"))
    catalog = (ROOT / "ugl-catalog.js").read_text(encoding="utf-8")
    portal = (ROOT / "ugl-portal.js").read_text(encoding="utf-8")
    theme = (ROOT / "ugl-theme.js").read_text(encoding="utf-8")

    # Page id in pages/ -> catalog id: pages/<x>.html is catalog item whose path ends with it.
    mounts = []
    for pid, p in pages.items():
        mounts.append(f"{json.dumps(pid)}:{{cls:{json.dumps(p['cls'])},html:{json.dumps(p['html'], ensure_ascii=False).replace('</', '<' + chr(92) + '/')},"
                      f"run:function(){{\n{p['js']}\n}}}}")
    mounts_js = "window.UGL_PREVIEW_PAGES={" + ",\n".join(mounts) + "};"

    doc = PREVIEW.replace("/*CSS*/", css).replace("/*CATALOG*/", catalog).replace("/*THEME*/", theme).replace("/*PORTAL*/", portal) \
        .replace("/*LOGO*/", "data:image/png;base64," + base64.b64encode((ROOT / "assets" / "unified-logo-icon.png").read_bytes()).decode()) \
        .replace("/*MOUNTS*/", mounts_js).replace("/*PDFS*/", json.dumps(pdf_pages)).replace("/*WITHHELD*/", json.dumps(WITHHELD))
    (out / "index.html").write_text(doc, encoding="utf-8")
    print("preview:", out / "index.html", f"{len(doc)//1024} KB;", "pdf pages:", pdf_pages)


PREVIEW = r"""<title>UGL Training Course</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
/*CSS*/
/* ---- preview only ---- */
.pv-bar{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:8px 16px;background:var(--u-red-deep);border-bottom:1px solid rgba(var(--u-red-rgb),.5);
  font:500 10.5px var(--u-mono);letter-spacing:.12em;color:var(--u-text-2);text-align:center}
.pv-bar button{all:unset;cursor:pointer;color:#fff;text-decoration:underline;text-underline-offset:3px}
.pv-bar button:focus-visible{outline:2px solid var(--u-red-ink)}
.lesson-bar{max-width:1240px;margin:0 auto;padding:22px 34px 0;display:flex;align-items:center;gap:14px}
.lesson-bar #lesson-mark{position:static;margin-left:auto;flex-shrink:0}
.lesson-bar>span{font:500 10.5px var(--u-mono);letter-spacing:.14em;color:var(--u-faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#lesson-body .page{padding-top:28px}
.pdfv{display:flex;flex-direction:column;gap:14px;align-items:center}
.pdfv img{width:100%;max-width:880px;border-radius:8px;background:#fff;box-shadow:0 18px 40px -24px rgba(0,0,0,.9)}
.pdfv small{font:500 10.5px var(--u-mono);letter-spacing:.12em;color:var(--u-faint)}
@media(max-width:640px){.lesson-bar{padding:16px 18px 0}}
</style>

<div class="pv-bar"><span>PREVIEW · NOT LIVE · NO LOGIN · PROGRESS IS SAVED IN THIS BROWSER ONLY</span><button type="button" id="pv-reset">Reset progress</button></div>
<div class="app-shell">
  <div class="course" style="display:block">
    <header class="topbar">
      <div class="topbar__brand">
        <img class="topbar__mark" alt="Unified Service and Consulting" src="/*LOGO*/">
        <div><span class="topbar__title">DISPATCH</span><span class="topbar__sub">/ TRAINING COURSE</span></div>
      </div>
      <nav class="tabs" id="tabs" aria-label="Sections"></nav>
      <div class="topbar__right"><span class="topbar__tag" id="ugl-user-email">PREVIEW</span><button type="button" class="theme-btn"></button></div>
    </header>
    <main class="main" id="portal"></main>
    <div id="lesson" hidden>
      <div class="lesson-bar"><a class="back" id="lesson-back" href="#home">← BACK</a><span id="lesson-crumb"></span><button type="button" class="lcard__mark" id="lesson-mark" hidden><span class="m-off">Mark as read</span><span class="m-on">✓ Read</span><span class="m-undo">Mark as unread</span></button></div>
      <div id="lesson-body"></div>
    </div>
  </div>
</div>

<script>
window.UGL_CONFIG = { userDomain: 'ugldispatch.com' };
/*CATALOG*/
(function () {
  // Lessons count as read only when marked by hand, as on the live site.
  var KEY = 'ugl-preview-read';
  function get() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function put(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} }
  window.uglPreviewIsRead = function (id) { return get().indexOf(id) >= 0; };
  window.uglPreviewReset = function () { try { Object.keys(localStorage).forEach(function (k) { if (/^ugl-/.test(k)) localStorage.removeItem(k); }); } catch (e) {} };
  window.UGL_ENV = {
    loadDone: function () { return Promise.resolve(get()); },
    setDone: function (id, on) { var a = get().filter(function (x) { return x !== id; }); if (on) a.push(id); put(a); return Promise.resolve(); },
    loadSimDone: function () { try { return Promise.resolve(Object.keys(JSON.parse(localStorage.getItem('ugl-sim-best') || '{}'))); } catch (e) { return Promise.resolve([]); } },
    href: function (it) { return '#lesson-' + it.id; }
  };
})();
</script>
<script>
/*THEME*/
</script>
<script>
/*PORTAL*/
</script>
<script>
/*MOUNTS*/
(function () {
  var cat = window.UGL_CATALOG, PAGES = window.UGL_PREVIEW_PAGES, PDFS = /*PDFS*/, WITHHELD = /*WITHHELD*/;
  var portal = document.getElementById('portal'), lesson = document.getElementById('lesson'), body = document.getElementById('lesson-body');
  var lastTab = 'home';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function crumb(it) {
    if (it.section === 'course') return 'COURSE / ' + cat.tracks.filter(function (t) { return t.id === it.track; })[0].title.toUpperCase();
    if (it.section === 'tools') return 'TOOLS / ' + cat.toolGroups.filter(function (g) { return g.id === it.group; })[0].title.toUpperCase();
    return 'SIMULATOR';
  }
  function hero(eyebrow, it, lead) {
    return '<section class="page-hero"><div class="eyebrow"><i></i>' + esc(eyebrow) + '</div><h1>' + esc(it.title) + '</h1><p class="lead">' + lead + '</p></section>';
  }
  function show(id, anchor) {
    var it = cat.items.filter(function (i) { return i.id === id; })[0];
    if (!it || it.soon || it.hidden) return false;
    var key = it.path.replace(/^pages\//, '').replace(/\.html$/, '');
    window.scrollTo(0, 0);
    document.getElementById('lesson-crumb').textContent = crumb(it) + ' / ' + it.title.toUpperCase();
    lastTab = it.section;
    document.getElementById('lesson-back').href = '#' + lastTab;
    if (PAGES[key]) {
      body.innerHTML = '<main class="' + PAGES[key].cls + '">' + PAGES[key].html + '</main>';
      PAGES[key].run();
    } else if (PDFS[id]) {
      var imgs = '';
      for (var i = 1; i <= PDFS[id]; i++) imgs += '<img loading="lazy" src="pdf/' + id + '/' + i + '.jpg" alt="Page ' + i + ' of ' + esc(it.title) + '">';
      body.innerHTML = '<main class="page">' + hero('DOCUMENT · PDF · ' + PDFS[id] + (PDFS[id] > 1 ? ' PAGES' : ' PAGE'), it, esc(it.desc) + ' On the live site this opens as the original PDF.') +
        '<div class="pdfv">' + imgs + '</div></main>';
    } else if (it.kind === 'deck') {
      body.innerHTML = '<main class="page">' + hero('TRAINING DECK', it, esc(it.desc)) +
        '<div class="card"><h3>Opens on the live site</h3><p style="margin:6px 0 0;color:var(--u-text-3);line-height:1.6">This narrated deck is unchanged from the current course. ' +
        'It is not bundled into the preview because the decks are 8 to 17 MB each. After launch it opens from this card, with its narration and slides.</p></div></main>';
    } else {
      body.innerHTML = '<main class="page">' + hero('NOT IN PREVIEW', it, esc(it.desc)) +
        '<div class="card"><h3>Why it is missing here</h3><p style="margin:6px 0 0;color:var(--u-text-3);line-height:1.6">' + esc(WITHHELD[id] || 'This file opens on the live site.') + '</p></div></main>';
    }
    portal.hidden = true; lesson.hidden = false;
    // Highlight the lesson's own section; runs after the portal's hashchange handler.
    setTimeout(function () { document.querySelectorAll('#tabs .tab').forEach(function (t) { t.classList.toggle('is-on', t.getAttribute('data-tab') === it.section); }); }, 0);
    var mark = document.getElementById('lesson-mark');
    mark.hidden = it.section !== 'course';
    mark.classList.toggle('is-on', window.uglPreviewIsRead(id));
    mark.onclick = function () { var on = !window.uglPreviewIsRead(id); window.UGL_ENV.setDone(id, on); mark.classList.toggle('is-on', on); };
    var t = anchor && document.getElementById(anchor);
    if (t) t.scrollIntoView();
    return true;
  }
  function route() {
    var h = location.hash.slice(1);
    var m = /^lesson-([a-z0-9-]+?)(?:--([\w-]+))?$/.exec(h);
    if (m && show(m[1], m[2])) return;
    if (/^(home|course|tools|simulator)$/.test(h)) lastTab = h;
    lesson.hidden = true; portal.hidden = false; body.innerHTML = '';
    document.querySelectorAll('#tabs .tab').forEach(function (t) { t.classList.toggle('is-on', t.getAttribute('data-tab') === lastTab); });
    window.uglPortal.refresh();
  }
  window.addEventListener('hashchange', route);
  // Links between pages (module.html?m=<id>#<anchor> on the live site) open inside the preview.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="module.html?m="]');
    if (!a) return;
    var u = /^module\.html\?m=([a-z0-9-]+)(?:#([\w-]+))?$/.exec(a.getAttribute('href'));
    if (!u) return;
    e.preventDefault();
    location.hash = '#lesson-' + u[1] + (u[2] ? '--' + u[2] : '');
  });
  document.getElementById('pv-reset').addEventListener('click', function () { window.uglPreviewReset(); location.hash = '#home'; window.uglPortal.refresh(); });
  window.uglOnSignedIn({ email: null });
  route();
})();
</script>
"""

if __name__ == "__main__":
    main()
