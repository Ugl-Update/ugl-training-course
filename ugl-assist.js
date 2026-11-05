// The course helper: a robot button in the top bar that opens a chat panel on every page.
//
// Ask a question in your own words. The panel first answers from the course itself (a small search
// over the Ask index: every rule, template and glossary entry as a passage with a link to its stop),
// and on the live site it also asks the AI helper (the `ask` edge function), which explains the answer
// from those passages only. In the offline preview, or when the helper is off, the passages are the
// answer. The index comes from window.UGL_ASK_INDEX (the preview inlines it) or from the content
// gateway (part "index" of the Ask tool), once per tab.
//
// window.uglAssist.mount(doc) puts the button into a page's top bar (module.html calls it after it has
// written a lesson); on pages with no top bar the button sits fixed at the top right.
(function () {
  if (window.uglAssist) return;
  var SUGGEST = ['What do I send the broker for a van pickup?', 'How many load locks for short pallets?', 'When do I send the POD?',
    'The box temperature is far from the set point', 'The broker does not answer about the lumper fee', 'Who do I tag for a reefer alarm?'];
  var STOP = {}; 'a an the of to for in on at and or is are be was it this that with from by as we you your our us they them i he she his her do does did not no yes if then than so what when where which who how why can could should would will please about into over under after before'.split(' ').forEach(function (w) { STOP[w] = 1; });
  var ALIAS = { del: 'receiver delivered delivery', pu: 'shipper pickup', g2g: 'good to go', good2go: 'good to go', appt: 'appointment', late: 'running late detention',
    lumper: 'fee', fee: 'lumper', pod: 'delivered proof delivery', bol: 'pickup bill lading', eta: 'transit arrival', seal: 'special', slc: 'sealed inside',
    temp: 'temperature reefer', reefer: 'temperature', trailer: 'power only', usps: 'trailer', drop: 'dropped trailer', efs: 'fee', ice: 'black ice weather', snow: 'weather', rain: 'weather' };
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V5"/><circle cx="12" cy="4" r="1"/><circle cx="9" cy="14" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="14" r="1.2" fill="currentColor" stroke="none"/><path d="M9.5 17.5h5"/><path d="M2 12v4M22 12v4"/></svg>';
  var CSS = [
    '.ua-btn{display:inline-grid;place-items:center;width:34px;height:34px;border:1px solid var(--u-line-2,rgba(255,255,255,.16));border-radius:var(--u-r-ctl,6px);background:transparent;color:var(--u-text-2,#dcdce0);cursor:pointer;transition:border-color .15s,color .15s,transform .12s cubic-bezier(.23,1,.32,1)}',
    '.ua-btn svg{width:19px;height:19px}.ua-btn:hover{border-color:var(--u-text-3,#b7b7bd);color:var(--u-text,#fff)}.ua-btn:active{transform:scale(.94)}',
    '.ua-btn--fixed{position:fixed;top:12px;right:12px;z-index:2147483000;background:var(--u-surface,#121014)}',
    '.ua-back{position:fixed;inset:0;z-index:2147483100;background:rgba(0,0,0,.5);opacity:0;transition:opacity .2s cubic-bezier(.23,1,.32,1)}',
    '.ua{position:fixed;top:0;right:0;bottom:0;z-index:2147483101;width:min(400px,100vw);display:flex;flex-direction:column;background:var(--u-bg,#050505);color:var(--u-text,#fff);font:15px/1.5 var(--u-font,Archivo,system-ui,sans-serif);border-left:1px solid var(--u-line,rgba(255,255,255,.09));transform:translateX(100%);transition:transform .26s cubic-bezier(.32,.72,0,1)}',
    '.ua.is-open{transform:none}.ua-back.is-open{opacity:1}',
    '.ua *{box-sizing:border-box}',
    '.ua__h{display:flex;align-items:center;gap:10px;padding:14px 16px;background:var(--u-acc,#3b0a6b);color:#fff}',
    '.ua__h svg{width:22px;height:22px;flex:none}.ua__h b{font-size:15px;font-weight:700}.ua__h small{display:block;font-size:12.5px;opacity:.85;font-weight:400}',
    '.ua__x{margin-left:auto;width:32px;height:32px;border:0;border-radius:6px;background:rgba(255,255,255,.14);color:#fff;font-size:20px;line-height:1;cursor:pointer}',
    '.ua__t{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:12px;overscroll-behavior:contain}',
    '.ua__m{max-width:92%;padding:10px 13px;border-radius:12px 12px 12px 4px;background:var(--u-surface,#121014);color:var(--u-text-2,#dcdce0);font-size:14.5px;line-height:1.5;animation:ua-in .16s cubic-bezier(.23,1,.32,1) both}',
    '.ua__m--me{margin-left:auto;border-radius:12px 12px 4px 12px;background:var(--u-acc,#3b0a6b);color:#fff}',
    '.ua__m p{margin:0 0 6px}.ua__m p:last-child{margin:0}',
    '.ua__k{font-size:12px;color:var(--u-muted,#95959b);margin-bottom:6px}',
    '.ua__hit{display:block;margin-top:8px;padding:10px 12px;border-radius:8px;background:var(--u-surface-2,#1c191f);color:inherit;text-decoration:none}',
    '.ua__hit b{display:block;font-size:14px;color:var(--u-text,#fff);margin-bottom:3px}.ua__hit span{font-size:13.5px;color:var(--u-text-3,#b7b7bd)}',
    '.ua__hit mark{background:rgba(var(--u-live-rgb,0,229,255),.25);color:inherit;border-radius:3px;padding:0 2px}',
    '.ua__hit small{display:block;margin-top:5px;font-size:12.5px;color:var(--u-live-ink,#00e5ff)}',
    '.ua__src a{color:var(--u-acc-ink,#cdb0ff);text-decoration:none;font-weight:600}.ua__src{font-size:13px;margin-top:6px}',
    '.ua__sugg{display:flex;flex-wrap:wrap;gap:6px}',
    '.ua__sugg button{padding:7px 11px;border:1px solid var(--u-line-2,rgba(255,255,255,.16));border-radius:6px;background:transparent;color:var(--u-text-2,#dcdce0);font:500 13.5px var(--u-font,Archivo,sans-serif);text-align:left;cursor:pointer}',
    '.ua__sugg button:hover{border-color:var(--u-text-3,#b7b7bd);color:var(--u-text,#fff)}',
    '.ua__dots{display:inline-flex;gap:4px;padding:4px 0}.ua__dots i{width:6px;height:6px;border-radius:50%;background:var(--u-muted,#95959b);animation:ua-dot 1s linear infinite}.ua__dots i:nth-child(2){animation-delay:.2s}.ua__dots i:nth-child(3){animation-delay:.4s}',
    '.ua__f{display:flex;gap:8px;align-items:flex-end;padding:12px 16px 14px;border-top:1px solid var(--u-line,rgba(255,255,255,.09))}',
    '.ua__in{flex:1;min-height:42px;max-height:120px;padding:10px 12px;border:1px solid var(--u-line-2,rgba(255,255,255,.16));border-radius:6px;background:var(--u-inset,#0b0a0d);color:var(--u-text,#fff);font:15px/1.4 var(--u-font,Archivo,sans-serif);resize:none;outline:none}',
    '.ua__in:focus{border-color:var(--u-live,#00e5ff);box-shadow:0 0 0 3px rgba(var(--u-live-rgb,0,229,255),.25)}',
    '.ua__send{height:42px;padding:0 14px;border:0;border-radius:6px;background:var(--u-primary,#fff);color:var(--u-primary-ink,#050505);font:600 14px var(--u-font,Archivo,sans-serif);cursor:pointer;transition:transform .12s cubic-bezier(.23,1,.32,1)}',
    '.ua__send:active{transform:scale(.96)}.ua__send:disabled{opacity:.5;cursor:default}',
    '.ua__note{padding:0 16px 10px;font-size:12.5px;color:var(--u-muted,#95959b)}',
    '@keyframes ua-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
    '@keyframes ua-dot{0%,80%,100%{opacity:.25}40%{opacity:1}}',
    '@media(prefers-reduced-motion:reduce){.ua,.ua-back,.ua-btn,.ua__send{transition:none}.ua__m{animation:none}.ua__dots i{animation:none;opacity:.7}}',
  ].join('\n');

  // ---- the index and the search
  var index = null, loading = null;
  function words(s) { return String(s).toLowerCase().replace(/[^a-z0-9#$ ]+/g, ' ').split(/\s+/).filter(Boolean); }
  function stem(w) { return w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w; }
  function toks(s) { return words(s).filter(function (w) { return !STOP[w] && w.length > 1; }).map(stem); }
  function prepare(data) {
    var ps = (data && data.passages) || [];
    var df = {};
    ps.forEach(function (p) {
      p._t = toks(p.t); p._x = toks(p.x); var seen = {};
      p._t.concat(p._x).forEach(function (w) { if (!seen[w]) { seen[w] = 1; df[w] = (df[w] || 0) + 1; } });
    });
    return { ps: ps, df: df, n: ps.length };
  }
  function search(q, k) {
    if (!index) return [];
    var qs = []; words(q).forEach(function (w) { qs.push(w); if (ALIAS[w]) qs = qs.concat(ALIAS[w].split(' ')); });
    qs = qs.filter(function (w) { return !STOP[w] && w.length > 1; }).map(stem);
    if (!qs.length) return [];
    var out = [];
    index.ps.forEach(function (p) {
      var s = 0;
      qs.forEach(function (w) {
        var idf = Math.log(1 + index.n / (1 + (index.df[w] || 0)));
        var tx = p._x.filter(function (x) { return x === w; }).length, tt = p._t.filter(function (x) { return x === w; }).length;
        if (tx) s += idf * (tx * 2.2 / (tx + 1.2 * (0.25 + 0.75 * p._x.length / 60)));
        if (tt) s += idf * 2.5;
      });
      if (s > 0) out.push({ p: p, s: s });
    });
    return out.sort(function (a, b) { return b.s - a.s; }).slice(0, k || 3);
  }
  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (loading) return loading;
    if (window.UGL_ASK_INDEX) { index = prepare(window.UGL_ASK_INDEX); return Promise.resolve(index); }
    try { var c = sessionStorage.getItem('ugl-ask-index'); if (c) { index = prepare(JSON.parse(c)); return Promise.resolve(index); } } catch (e) {}
    var db = window.uglDb, cfg = window.UGL_CONFIG;
    if (!db || !cfg || !window.uglFn) return Promise.reject(new Error('offline'));
    loading = db.auth.getSession().then(function (r) {
      var tok = r.data && r.data.session && r.data.session.access_token;
      if (!tok) throw new Error('signin');
      var sig = window.uglSignals ? window.uglSignals() : { ua: navigator.userAgent, wd: !!navigator.webdriver, headless: false, langs: (navigator.languages || []).length, plat: navigator.platform, tz: (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone || '', scr: screen.width + 'x' + screen.height, touch: navigator.maxTouchPoints || 0, hc: navigator.hardwareConcurrency || 0, brands: (navigator.userAgentData && navigator.userAgentData.brands || []).map(function (b) { return b.brand; }).join(', ') };
      return fetch(window.uglFn('content'), { method: 'POST', headers: { Authorization: 'Bearer ' + tok, apikey: cfg.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open', module: 'ask', path: 'ask/index.json', part: 'index', signals: sig }) })
        .then(function (res) { return res.json().then(function (j) { if (!res.ok) throw new Error(j.reason || j.error || 'blocked'); return fetch(j.url); }); })
        .then(function (res) { return res.json(); })
        .then(function (data) { try { sessionStorage.setItem('ugl-ask-index', JSON.stringify(data)); } catch (e) {} index = prepare(data); return index; });
    });
    loading.catch(function () { loading = null; });
    return loading;
  }
  function askAi(q, hits) {
    var db = window.uglDb, cfg = window.UGL_CONFIG;
    if (!db || !cfg || !window.uglFn) return Promise.resolve({ error: 'offline' });
    return db.auth.getSession().then(function (r) {
      var tok = r.data && r.data.session && r.data.session.access_token;
      if (!tok) return { error: 'signin' };
      return fetch(window.uglFn('ask'), { method: 'POST', headers: { Authorization: 'Bearer ' + tok, apikey: cfg.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, passages: hits.map(function (h) { return h.p.id; }) }) })
        .then(function (res) { return res.json().then(function (j) { j._status = res.status; return j; }); });
    }).catch(function () { return { error: 'busy' }; });
  }

  // ---- the panel
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var thread = []; try { thread = JSON.parse(sessionStorage.getItem('ugl-assist-thread') || '[]'); } catch (e) {}
  function keep() { try { sessionStorage.setItem('ugl-assist-thread', JSON.stringify(thread.slice(-20))); } catch (e) {} }
  function snippet(p, q) {
    var qs = toks(q).filter(function (w) { return w.length > 2; });
    var text = p.x, lower = text.toLowerCase(), at = -1;
    qs.forEach(function (w) { var i = lower.indexOf(w); if (i >= 0 && (at < 0 || i < at)) at = i; });
    var start = Math.max(0, at - 60), cut = text.slice(start, start + 230);
    if (start > 0) cut = '…' + cut.replace(/^\S*\s/, '');
    if (start + 230 < text.length) cut = cut.replace(/\s\S*$/, '') + '…';
    var html = esc(cut);
    if (qs.length) html = html.replace(new RegExp('(' + qs.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'ig'), '<mark>$1</mark>');
    return html;
  }
  function href(u) { return /^module\.html/.test(u) ? u : 'module.html?m=' + u; }
  function hitHtml(h, q) {
    return '<a class="ua__hit" href="' + esc(href(h.p.u)) + '"><b>' + esc(h.p.t) + '</b><span>' + snippet(h.p, q) + '</span><small>Open the page →</small></a>';
  }
  function build(doc) {
    var back = doc.createElement('div'); back.className = 'ua-back'; back.hidden = true;
    var box = doc.createElement('aside'); box.className = 'ua'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Ask the course');
    var live = !!(window.uglDb && window.UGL_CONFIG && !window.UGL_ENV);
    box.innerHTML = '<div class="ua__h">' + ICON + '<div><b>Ask the course</b><small>' + (live ? 'Answers from the course, with the AI helper when it is on.' : 'Answers from the course text. The AI helper works on the live site.') + '</small></div><button type="button" class="ua__x" aria-label="Close">×</button></div>' +
      '<div class="ua__t"></div>' +
      '<form class="ua__f"><textarea class="ua__in" rows="1" placeholder="Ask in your own words…" aria-label="Your question"></textarea><button type="submit" class="ua__send">Ask</button></form>' +
      '<div class="ua__note">Nothing you type is saved outside the course. Answers come from the course text only; when in doubt, ask your manager.</div>';
    doc.body.appendChild(back); doc.body.appendChild(box);
    var t = box.querySelector('.ua__t'), inp = box.querySelector('.ua__in'), send = box.querySelector('.ua__send'), form = box.querySelector('.ua__f');
    function add(cls, html) { var m = doc.createElement('div'); m.className = 'ua__m' + (cls ? ' ' + cls : ''); m.innerHTML = html; t.appendChild(m); t.scrollTop = t.scrollHeight; return m; }
    function render() {
      t.innerHTML = '';
      if (!thread.length) {
        add('', '<p>Ask anything about the work: a template, a rule, who to tag, what a word means.</p><div class="ua__sugg">' + SUGGEST.map(function (s) { return '<button type="button">' + esc(s) + '</button>'; }).join('') + '</div>');
      }
      thread.forEach(function (m) { add(m.me ? 'ua__m--me' : '', m.html); });
    }
    function answer(q) {
      q = String(q || '').trim(); if (!q) return;
      inp.value = ''; inp.style.height = '';
      if (!thread.length) t.innerHTML = '';
      thread.push({ me: true, html: esc(q) }); add('ua__m--me', esc(q)); keep();
      var wait = add('', '<span class="ua__dots"><i></i><i></i><i></i></span>');
      send.disabled = true;
      loadIndex().then(function () {
        var hits = search(q, 3);
        if (!hits.length) { wait.remove(); return done('<p>Nothing in the course matches that. Try other words, or ask your manager.</p>'); }
        var fromCourse = '<div class="ua__k">From the course</div>' + hits.map(function (h) { return hitHtml(h, q); }).join('');
        if (!live) { wait.remove(); return done(fromCourse); }
        askAi(q, hits).then(function (j) {
          wait.remove();
          if (j && j.answer) {
            var src = (j.sources || []).map(function (s) { return '<a href="' + esc(href(s.u)) + '">' + esc(s.t) + '</a>'; }).join(' · ');
            done('<div class="ua__k">The helper, from the course</div>' + esc(j.answer).split(/\n+/).map(function (l) { return '<p>' + l + '</p>'; }).join('') + (src ? '<div class="ua__src">Read it in: ' + src + '</div>' : '') + fromCourse);
          } else {
            var why = { 'not-configured': 'The AI helper is not switched on yet.', limit: 'You used today\'s questions for the helper.', signin: 'Sign in again to use the helper.', busy: 'The helper is busy right now.', blocked: 'The helper is not open to you.' }[j && j.error] || 'The helper did not answer.';
            done('<div class="ua__k">' + esc(why) + ' The course says:</div>' + fromCourse.replace('<div class="ua__k">From the course</div>', ''));
          }
        });
      }).catch(function (e) {
        wait.remove();
        var msg = e && e.message;
        done('<p>' + (msg === 'signin' ? 'Sign in to ask the course.' : msg === 'no-access' ? 'The Ask tool is not open to you. Ask your trainer.' : 'The course index could not be loaded. Try again in a moment.') + '</p>');
      });
      function done(html) { thread.push({ me: false, html: html }); add('', html); keep(); send.disabled = false; inp.focus(); }
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); answer(inp.value); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); answer(inp.value); } });
    inp.addEventListener('input', function () { inp.style.height = ''; inp.style.height = Math.min(120, inp.scrollHeight) + 'px'; });
    t.addEventListener('click', function (e) { var b = e.target.closest('.ua__sugg button'); if (b) answer(b.textContent); });
    var opener = null;
    function open(from) {
      opener = from || null; render();
      back.hidden = false; box.hidden = false;
      requestAnimationFrame(function () { requestAnimationFrame(function () { back.classList.add('is-open'); box.classList.add('is-open'); }); });
      setTimeout(function () { inp.focus(); }, 280);
      doc.addEventListener('keydown', onKey);
    }
    function close() {
      back.classList.remove('is-open'); box.classList.remove('is-open');
      doc.removeEventListener('keydown', onKey);
      var after = function () { back.hidden = true; box.hidden = true; if (opener && opener.focus) opener.focus(); };
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) after(); else setTimeout(after, 270);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    back.addEventListener('click', close); box.querySelector('.ua__x').addEventListener('click', close);
    return { open: open, close: close };
  }
  var panels = [];
  function mount(doc) {
    doc = doc || document;
    if (!doc.body || doc.querySelector('.ua-btn')) return;
    if (!doc.getElementById('ua-css')) { var st = doc.createElement('style'); st.id = 'ua-css'; st.textContent = CSS; doc.head.appendChild(st); }
    var btn = doc.createElement('button'); btn.type = 'button'; btn.className = 'ua-btn'; btn.innerHTML = ICON; btn.title = 'Ask the course'; btn.setAttribute('aria-label', 'Ask the course');
    var host = doc.querySelector('.topbar__right');
    if (host) host.insertBefore(btn, host.firstChild); else { btn.className += ' ua-btn--fixed'; doc.body.appendChild(btn); }
    var panel = null;
    btn.addEventListener('click', function () { if (!panel) panel = build(doc); panel.open(btn); });
    panels.push(btn);
  }
  window.uglAssist = { mount: mount, search: function (q, k) { return loadIndex().then(function () { return search(q, k); }); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { mount(document); }); else mount(document);
})();
