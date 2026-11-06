#!/usr/bin/env python3
"""The staging copy of the site shell (run by .github/workflows/staging-site.yml).

  build   copies the files a browser needs into dist/ and marks ugl-config.js with stage: 'staging'
  upload  puts every file in dist/ into the public "staging-site" bucket through the course-admin
          function, authenticated with the workflow's GitHub OIDC token (repository + branch)
"""
import json, mimetypes, os, pathlib, shutil, sys, time, urllib.error, urllib.parse, urllib.request

DIST = pathlib.Path("dist")
# What the site needs at run time: the three pages, the icon and every ugl-*.js / ugl-*.css next to them
# (build tools, functions and docs stay out). A new script or stylesheet is picked up without editing this list.
PAGES = ["index.html", "module.html", "admin.html"]
FILES = PAGES + ["favicon.png"] + sorted(str(p) for p in pathlib.Path(".").glob("ugl-*.js")) + sorted(str(p) for p in pathlib.Path(".").glob("ugl-*.css"))
DIRS = ["assets", "vendor"]
TYPES = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
         ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2", ".mjs": "text/javascript"}


def build():
    shutil.rmtree(DIST, ignore_errors=True); DIST.mkdir()
    for f in FILES:
        if pathlib.Path(f).exists(): shutil.copy(f, DIST / f)
    for d in DIRS:
        if pathlib.Path(d).is_dir(): shutil.copytree(d, DIST / d)
    cfg = DIST / "ugl-config.js"; s = cfg.read_text(encoding="utf-8")
    marker = "window.UGL_CONFIG = {"
    assert marker in s, "ugl-config.js changed shape"
    s = s.replace(marker, marker + "\n  stage: 'staging',  // set by the staging publish: this copy talks to content-staging and ask-staging", 1)
    cfg.write_text(s, encoding="utf-8")
    (DIST / "staging-build.txt").write_text(f"{os.environ.get('GITHUB_REF_NAME', '?')} {os.environ.get('GITHUB_SHA', '?')}\n")
    # Every local script, stylesheet and image a page names must be in dist/, or the staging site opens broken.
    import re
    missing = sorted({ref for page in PAGES for ref in re.findall(r'(?:src|href)="([^"#?:\']+\.(?:js|mjs|css|png|svg|webp))"', pathlib.Path(page).read_text(encoding="utf-8"))
                      if not (DIST / ref).is_file()})
    assert not missing, f"pages reference files that are not in dist/: {missing}"
    n = sum(1 for p in DIST.rglob('*') if p.is_file()); print(f"dist/: {n} files")


def oidc_token():
    req = urllib.request.Request(os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"] + "&audience=ugl-course-sync",
                                 headers={"Authorization": "bearer " + os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]})
    with urllib.request.urlopen(req) as r:
        return json.load(r)["value"]


def put(rel, body, ctype):
    url = os.environ["SYNC_URL"] + "?path=" + urllib.parse.quote(rel)
    for attempt in range(4):
        req = urllib.request.Request(url, data=body, method="PUT", headers={"Authorization": "Bearer " + oidc_token(), "Content-Type": ctype})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read().decode()
        except urllib.error.HTTPError as e:
            if e.code < 500: sys.exit(f"PUT {rel}: {e.code} {e.read().decode()[:200]}")
            err = e
        except urllib.error.URLError as e:
            err = e
        time.sleep(2 ** (attempt + 1))
    sys.exit(f"PUT {rel}: failed after retries ({err})")


def upload():
    files = sorted(p for p in DIST.rglob("*") if p.is_file())
    for p in files:
        rel = str(p.relative_to(DIST)).replace(os.sep, "/")
        ctype = TYPES.get(p.suffix) or mimetypes.guess_type(p.name)[0] or "application/octet-stream"
        print(put(rel, p.read_bytes(), ctype), rel, f"({p.stat().st_size // 1024} KB)")
    print(f"{len(files)} files uploaded")


if __name__ == "__main__":
    {"build": build, "upload": upload}[sys.argv[1]]()
