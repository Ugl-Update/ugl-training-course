// The course helper: a robot button in the top bar that opens a chat card on every page.
//
// Press the robot and a chat card grows out of it: on a desk a 400px card hanging under the button,
// floating over the page (the page stays usable); on a phone, or any short window, the same card fills
// the screen and its composer rides on the keyboard. Nothing slides in from an edge.
//
// Ask a question in your own words. The card first answers from the course itself (a small search
// over the Ask index: every rule, template and glossary entry as a passage with a link to its stop),
// and on the live site it also asks the AI helper (the `ask` edge function), which explains the answer
// from those passages only; its [n] marks become links to the passages. In the offline preview, or
// when the helper is switched off (the function's GET says so), the passages are the answer. The index
// comes from window.UGL_ASK_INDEX (the preview inlines it) or from the content gateway (part "index" of
// the Ask tool), once per tab.
//
// window.uglAssist.mount(doc) puts the button into a page's top bar (module.html calls it after it has
// written a lesson); in a deck it sits left of the deck's theme switch, or floats beside it without
// covering the deck's own controls; elsewhere it sits fixed at the top right. In a deck the card and the
// button take the deck's colours, light or dark.
(function () {
  if (window.uglAssist) return;
  var SUGGEST = ['What do I send the broker for a van pickup?', 'How many load locks for short pallets?', 'When do I send the POD?',
    'The box temperature is far from the set point', 'The broker does not answer about the lumper fee', 'Who do I tag for a reefer alarm?'];
  var STOP = {}; 'a an the of to for in on at and or is are be was it this that with from by as we you your our us they them i he she his her do does did not no yes if then than so what when where which who how why can could should would will please about into over under after before'.split(' ').forEach(function (w) { STOP[w] = 1; });
  var ALIAS = { del: 'receiver delivered delivery', pu: 'shipper pickup', g2g: 'good to go', good2go: 'good to go', appt: 'appointment', late: 'running late detention',
    lumper: 'fee', fee: 'lumper', pod: 'delivered proof delivery', bol: 'pickup bill lading', eta: 'transit arrival', seal: 'special', slc: 'sealed inside',
    temp: 'temperature reefer', reefer: 'temperature', trailer: 'power only', usps: 'trailer', drop: 'dropped trailer', efs: 'fee', ice: 'black ice weather', snow: 'weather', rain: 'weather' };
  function svg(d, w) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; }
  var ICON = svg('<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V5"/><circle cx="12" cy="4" r="1"/><circle cx="9" cy="14" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="14" r="1.2" fill="currentColor" stroke="none"/><path d="M9.5 17.5h5"/><path d="M2 12v4M22 12v4"/>', 1.75);
  var PLUS = svg('<path d="M12 5v14M5 12h14"/>'), CROSS = svg('<path d="M6 6l12 12M18 6L6 18"/>'), UP = svg('<path d="M12 19V5M5 12l7-7 7 7"/>', 2.25);
  var EASE = 'var(--ease-out,cubic-bezier(.23,1,.32,1))';
  var SMALL = '(max-width: 640px), (max-height: 520px)';
  var FOCUS = 'outline:2px solid var(--u-live,#00e5ff);outline-offset:2px';
  var CSS = [
    // the robot button: the helper's amethyst field (DESIGN.md) with a white robot; a 44px hit area around the 34px button
    '.ua-btn{position:relative;display:inline-grid;place-items:center;flex:none;width:34px;height:34px;padding:0;border:1px solid transparent;border-radius:var(--u-r-ctl,6px);background:var(--u-acc,#3b0a6b);color:#fff;cursor:pointer;transition:background-color .15s ease,transform .12s ' + EASE + '}',
    '.ua-btn::before{content:"";position:absolute;inset:-5px}.ua-btn svg{width:19px;height:19px}.ua-btn:active{transform:scale(.94)}.ua-btn.is-on{background:var(--u-acc-hi,#4b1288)}',
    '.ua-btn:focus-visible{' + FOCUS + '}',
    '.ua-btn--fixed{position:fixed;top:12px;right:12px;z-index:2147483000}',
    // in a deck, the site's colour names are taken from the deck's own (two families of names, light and dark)
    '.ua-deck{--u-bg:var(--bg);--u-surface:var(--surface,var(--card));--u-surface-2:var(--surface-2,var(--card2));--u-inset:var(--inset);--u-text:var(--ink,var(--white));--u-text-2:var(--ink-2,var(--light));--u-text-3:var(--ink-2,var(--light));--u-muted:var(--ink-3,var(--gray));--u-line:var(--line);--u-line-2:var(--line2,var(--line));--u-acc:var(--acc);--u-acc-hi:var(--acc-hi);--u-live:var(--live);--u-live-ink:var(--live-ink);--u-live-rgb:var(--live-rgb,0,229,255);--u-primary:var(--ink,var(--white));--u-primary-ink:var(--bg)}',
    // the card: fixed, placed by place() under (or above) the button; it scales out of the button
    '.ua{position:fixed;z-index:2147483101;display:flex;flex-direction:column;width:400px;max-width:calc(100vw - 24px);background:var(--u-bg,#050505);color:var(--u-text,#fff);font:16px/1.5 var(--u-font,Archivo,system-ui,sans-serif);border:1px solid var(--u-line-2,rgba(255,255,255,.16));border-radius:var(--u-r-card,8px);overflow:hidden;box-shadow:0 16px 48px -8px rgba(0,0,0,.55);opacity:0;transform:scale(.96);transition:opacity .15s ' + EASE + ',transform .15s ' + EASE + '}',
    '.ua.is-open{opacity:1;transform:none;transition-duration:.2s}.ua.is-instant{transition:none}',
    '.ua[hidden]{display:none!important}',
    '[data-theme="light"] .ua{box-shadow:0 16px 48px -8px rgba(0,0,0,.22)}',
    '.ua *{box-sizing:border-box}.ua:focus{outline:none}',
    // header: the card's amethyst field (your own questions are amethyst too)
    '.ua__h{display:flex;align-items:center;gap:12px;flex:none;min-height:60px;padding:8px 8px 8px 16px;background:var(--u-acc,#3b0a6b);color:#fff}',
    '.ua__ava{position:relative;display:inline-grid;place-items:center;flex:none;width:24px;height:24px}.ua__h .ua__ava svg{width:24px;height:24px}',
    '.ua__dot{position:absolute;right:-4px;bottom:-4px;width:12px;height:12px;border-radius:50%;border:2px solid var(--u-acc,#3b0a6b);background:var(--u-live,#00e5ff)}.ua__dot--off{background:#9a8fb0}',
    '.ua__hd{flex:1;min-width:0}.ua__hd b{display:block;font-size:16px;font-weight:700;line-height:1.25}.ua__st{display:block;margin-top:2px;font-size:13px;line-height:1.3;opacity:.82}',
    '.ua__acts{display:flex;gap:8px;flex:none}',
    '.ua__ib{display:inline-grid;place-items:center;flex:none;width:44px;height:44px;padding:0;border:1px solid rgba(255,255,255,.22);border-radius:var(--u-r-ctl,6px);background:transparent;color:#fff;cursor:pointer;transition:background-color .15s ease,transform .12s ' + EASE + '}',
    '.ua__ib svg{width:18px;height:18px}.ua__ib:active{transform:scale(.94)}.ua__ib:focus-visible{outline:2px solid #fff;outline-offset:2px}',
    // the thread
    '.ua__t{flex:1;overflow:auto;padding:16px 16px 8px;display:flex;flex-direction:column;gap:12px;overscroll-behavior:contain}',
    '.ua__row{display:flex;align-items:flex-start;gap:8px;animation:ua-in .16s ' + EASE + ' both}.ua__row--still{animation:none}.ua__row--me{justify-content:flex-end}',
    '.ua__row>.ua__ava{width:20px;height:20px;margin-top:12px;color:var(--u-muted,#95959b)}.ua__row>.ua__ava svg{width:20px;height:20px}',
    '.ua__m{min-width:0;max-width:calc(100% - 28px);padding:12px 16px;border-radius:12px 12px 12px 4px;background:var(--u-surface,#121014);color:var(--u-text-2,#dcdce0);font-size:16px;line-height:1.5;overflow-wrap:anywhere}',
    '.ua__row--me .ua__m{max-width:85%;border-radius:12px 12px 4px 12px;background:var(--u-acc,#3b0a6b);color:#fff;white-space:pre-wrap}',
    '.ua__m p{margin:0 0 8px}.ua__m p:last-child{margin:0}',
    '.ua__k{margin:0 0 8px;font-size:13px;color:var(--u-muted,#95959b)}',
    '.ua__wait{display:flex;align-items:center;gap:8px;color:var(--u-muted,#95959b);font-size:14px}',
    '.ua__dots{display:inline-flex;gap:4px}.ua__dots i{width:6px;height:6px;border-radius:50%;background:var(--u-muted,#95959b);animation:ua-dot 1s linear infinite}.ua__dots i:nth-child(2){animation-delay:.2s}.ua__dots i:nth-child(3){animation-delay:.4s}',
    // the answer: [n] marks become links to the passages; "Read it in" chips; the passages folded under a disclosure
    '.ua__cite{position:relative;display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 4px;margin:0 2px;border:1px solid rgba(var(--u-live-rgb,0,229,255),.45);border-radius:var(--u-r-chip,4px);color:var(--u-live-ink,#00e5ff);font-size:12px;font-weight:600;line-height:1;text-decoration:none;vertical-align:2px}',
    'a.ua__cite::before{content:"";position:absolute;inset:-6px -4px}a.ua__cite:focus-visible{' + FOCUS + '}',
    '.ua__src{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px;font-size:13px;color:var(--u-muted,#95959b)}',
    '.ua__src a{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:4px 12px;border:1px solid var(--u-line-2,rgba(255,255,255,.16));border-radius:var(--u-r-chip,4px);background:var(--u-surface-2,#1c191f);color:var(--u-text-2,#dcdce0);font-size:14px;font-weight:600;line-height:1.35;text-decoration:none;transition:border-color .15s ease,color .15s ease}',
    '.ua__src a i{font-style:normal;color:var(--u-live-ink,#00e5ff)}.ua__src a:focus-visible{' + FOCUS + '}',
    '.ua__more{margin-top:8px}.ua__more summary{list-style:none;display:flex;align-items:center;gap:8px;min-height:44px;cursor:pointer;font-size:14px;font-weight:600;color:var(--u-text-3,#b7b7bd)}',
    '.ua__more summary::-webkit-details-marker{display:none}.ua__more summary::before{content:"";width:6px;height:6px;margin:0 4px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform .15s ' + EASE + '}.ua__more[open] summary::before{transform:rotate(45deg)}',
    '.ua__more summary:focus-visible{' + FOCUS + ';border-radius:var(--u-r-chip,4px)}',
    '.ua__hit{display:block;margin-top:8px;padding:12px 16px;border-radius:var(--u-r-card,8px);background:var(--u-surface-2,#1c191f);color:inherit;text-decoration:none}.ua__hit:focus-visible{' + FOCUS + '}',
    '.ua__hit b{display:flex;align-items:flex-start;gap:8px;margin-bottom:4px;font-size:15px;font-weight:700;line-height:1.35;color:var(--u-text,#fff)}.ua__hit b .ua__cite{flex:none;margin:0;vertical-align:0}',
    '.ua__hit>span{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;font-size:14px;color:var(--u-text-3,#b7b7bd)}',
    '.ua__hit mark{background:rgba(var(--u-live-rgb,0,229,255),.22);color:inherit;border-radius:var(--u-r-chip,4px);padding:0 2px}',
    '.ua__hit small{display:block;margin-top:4px;font-size:13px;font-weight:600;color:var(--u-live-ink,#00e5ff)}',
    // the first screen: a greeting and the questions to try, as full-width rows a thumb hits first time
    '.ua__try{width:100%}.ua__sugg{display:flex;flex-direction:column;gap:8px;width:100%}',
    '.ua__sugg button{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:44px;padding:10px 12px;border:1px solid var(--u-line-2,rgba(255,255,255,.16));border-radius:var(--u-r-ctl,6px);background:var(--u-surface-2,#1c191f);color:var(--u-text-2,#dcdce0);font:500 15px/1.35 var(--u-font,Archivo,sans-serif);text-align:left;cursor:pointer;transition:border-color .15s ease,color .15s ease,transform .12s ' + EASE + '}',
    '.ua__sugg button::after{content:"\\2192";flex:none;color:var(--u-muted,#95959b)}.ua__sugg button:active{transform:scale(.985)}.ua__sugg button:focus-visible{' + FOCUS + '}',
    // the composer: one field box with the send arrow inside, the way chat apps do it; the ring is the site's input focus
    '.ua__f{flex:none;padding:8px 12px 0;border-top:1px solid var(--u-line,rgba(255,255,255,.09))}',
    '.ua__box{display:flex;align-items:flex-end;gap:8px;padding:4px 4px 4px 12px;border:1px solid var(--u-line-2,rgba(255,255,255,.16));border-radius:var(--u-r-ctl,6px);background:var(--u-inset,#0b0a0d)}',
    '.ua__box:focus-within{border-color:var(--u-live,#00e5ff);box-shadow:0 0 0 3px rgba(var(--u-live-rgb,0,229,255),.25)}',
    '.ua__in{flex:1;min-height:40px;max-height:132px;padding:9px 0;border:0;background:transparent;color:var(--u-text,#fff);font:16px/1.4 var(--u-font,Archivo,sans-serif);resize:none;outline:none;-webkit-user-select:text;user-select:text}',
    '.ua__in::placeholder{color:var(--u-muted,#95959b)}',
    '.ua__send{position:relative;display:inline-grid;place-items:center;flex:none;width:40px;height:40px;padding:0;border:0;border-radius:var(--u-r-ctl,6px);background:var(--u-primary,#fff);color:var(--u-primary-ink,#050505);cursor:pointer;transition:transform .12s ' + EASE + ',opacity .15s ease}',
    '.ua__send::before{content:"";position:absolute;inset:-4px}.ua__send svg{width:18px;height:18px}.ua__send:active{transform:scale(.94)}.ua__send:disabled{opacity:.4;cursor:default;transform:none}.ua__send:focus-visible{' + FOCUS + '}',
    '.ua__note{flex:none;padding:8px 12px calc(8px + env(safe-area-inset-bottom,0px));font-size:12px;line-height:1.4;color:var(--u-muted,#95959b)}.ua__hint{display:none}',
    // hover only where there is a pointer
    '@media(hover:hover) and (pointer:fine){.ua-btn:hover{background:var(--u-acc-hi,#4b1288)}.ua__ib:hover{background:rgba(255,255,255,.14)}.ua__sugg button:hover,.ua__src a:hover{border-color:var(--u-text-3,#b7b7bd);color:var(--u-text,#fff)}.ua__more summary:hover{color:var(--u-text,#fff)}.ua__hit:hover b{text-decoration:underline;text-underline-offset:2px}.ua__hint{display:inline}}',
    // a phone or a short window: the card is the screen; place() keeps it inside the visual viewport so the composer rides on the keyboard
    '@media(max-width:640px),(max-height:520px){.ua{top:0;left:0;right:0;width:auto;max-width:none;height:100vh;height:100dvh;border:0;border-radius:0;box-shadow:none}.ua__h{padding-top:calc(8px + env(safe-area-inset-top,0px))}.ua__row--me .ua__m{max-width:88%}.ua--kb .ua__note{display:none}html.ua-lock,html.ua-lock body{overflow:hidden}}',
    '@keyframes ua-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@keyframes ua-fade{from{opacity:0}to{opacity:1}}',
    '@keyframes ua-dot{0%,80%,100%{opacity:.25}40%{opacity:1}}',
    // reduced motion: the change stays (fades), the travel goes
    '@media(prefers-reduced-motion:reduce){.ua,.ua.is-open{transform:none!important;transition:opacity .15s ' + EASE + '}.ua.is-instant{transition:none}.ua__row{animation:ua-fade .12s ' + EASE + ' both}.ua__row--still{animation:none}.ua-btn,.ua__ib,.ua__send,.ua__sugg button,.ua__more summary::before{transition:none}.ua-btn:active,.ua__ib:active,.ua__send:active,.ua__sugg button:active{transform:none}.ua__dots i{animation:none;opacity:.7}}',
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
  // Whether the AI helper is switched on: the ask function's GET answers without a sign-in. Once per tab.
  var health = null;
  function aiHealth() {
    if (health) return health;
    try { var c = sessionStorage.getItem('ugl-ask-health'); if (c) return (health = Promise.resolve(JSON.parse(c))); } catch (e) {}
    if (!window.uglFn) return Promise.resolve({});
    health = fetch(window.uglFn('ask')).then(function (r) { return r.json(); }).then(function (j) {
      try { sessionStorage.setItem('ugl-ask-health', JSON.stringify({ helper: !!j.helper })); } catch (e) {}
      return j;
    }).catch(function () { health = null; return {}; });
    return health;
  }

  // ---- what goes into a bubble
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var thread = []; try { thread = JSON.parse(sessionStorage.getItem('ugl-assist-thread') || '[]'); } catch (e) {}
  function keep() { try { sessionStorage.setItem('ugl-assist-thread', JSON.stringify(thread.slice(-20))); } catch (e) {} }
  // The bit of a passage around the first matching word; whole words are marked (on the raw text, so an
  // entity such as &quot; can never be split), then the text is escaped.
  function snippet(p, q) {
    var qs = toks(q).filter(function (w) { return w.length > 2; });
    var text = p.x, lower = text.toLowerCase(), at = -1;
    qs.forEach(function (w) { var i = lower.indexOf(w); if (i >= 0 && (at < 0 || i < at)) at = i; });
    var start = Math.max(0, at - 60), cut = text.slice(start, start + 230);
    if (start > 0) cut = '…' + cut.replace(/^\S*\s/, '');
    if (start + 230 < text.length) cut = cut.replace(/\s\S*$/, '') + '…';
    if (!qs.length) return esc(cut);
    var re = new RegExp('\\b(?:' + qs.map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')[a-z0-9]*', 'ig');
    return esc(cut.replace(re, '\u0001$&\u0002')).replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>');
  }
  function href(u) { return /^module\.html/.test(u) ? u : 'module.html?m=' + u; }
  function cite(n, u, t) {
    return u ? '<a class="ua__cite" href="' + esc(href(u)) + '" aria-label="Source ' + n + ': ' + esc(t) + '" title="' + esc(t) + '">' + n + '</a>' : '<span class="ua__cite">' + n + '</span>';
  }
  // One passage as a card: its number (the one the helper cites), title, the matching bit of its text, the link.
  function hitHtml(h, q, n) {
    return '<a class="ua__hit" href="' + esc(href(h.p.u)) + '"><b>' + (n ? '<span class="ua__cite" aria-hidden="true">' + n + '</span>' : '') + esc(h.p.t) + '</b><span>' + snippet(h.p, q) + '</span><small>Open the page →</small></a>';
  }
  function courseHtml(hits, q, fold) {
    var cards = hits.map(function (h, i) { return hitHtml(h, q, i + 1); }).join('');
    return fold ? '<details class="ua__more"><summary>The course text · ' + hits.length + (hits.length === 1 ? ' passage' : ' passages') + '</summary>' + cards + '</details>' : cards;
  }
  // The helper's answer: every [n] becomes a link to passage n of the ones the function used (a number with
  // no passage stays as text), and the pages it cited follow as "Read it in" chips with the same numbers.
  function answerHtml(text, hits, sources) {
    var body = esc(text).split(/\n+/).map(function (l) {
      return '<p>' + l.replace(/\[(\d{1,2})\]/g, function (m, n) { var h = hits[+n - 1]; return h ? cite(n, h.p.u, h.p.t) : m; }) + '</p>';
    }).join('');
    var chips = (sources || []).map(function (s) {
      var n = 0; hits.forEach(function (h, i) { if (!n && h.p.u === s.u && h.p.t === s.t) n = i + 1; });
      return '<a href="' + esc(href(s.u)) + '">' + (n ? '<i>' + n + '</i>' : '') + esc(s.t) + '</a>';
    }).join('');
    return body + (chips ? '<div class="ua__src">Read it in:' + chips + '</div>' : '');
  }
  // A deck carries its own colour names (--bg, --card or --surface ...) and none of the site's.
  function inDeck(doc) {
    try { var cs = (doc.defaultView || window).getComputedStyle(doc.body); return !cs.getPropertyValue('--u-bg').trim() && !!(cs.getPropertyValue('--card').trim() || cs.getPropertyValue('--surface').trim()); }
    catch (e) { return false; }
  }

  // ---- the card
  var ENDED = { 'not-configured': 'The AI helper is not switched on yet.', limit: 'You used today\'s questions for the helper.', signin: 'Sign in again to use the helper.', busy: 'The helper is busy right now.', blocked: 'The helper is not open to you.' };
  var NAV_KEYS = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, ' ': 1, Home: 1, End: 1, PageUp: 1, PageDown: 1, Enter: 1 };
  function build(doc, btn) {
    var win = doc.defaultView || window;
    var mq = function (q) { return !!(win.matchMedia && win.matchMedia(q).matches); };
    var reduce = function () { return mq('(prefers-reduced-motion: reduce)'); };
    var small = function () { return mq(SMALL); };
    var fine = function () { return mq('(hover: hover) and (pointer: fine)'); };
    var live = !!(window.uglDb && window.UGL_CONFIG && !window.UGL_ENV), aiOn = live;
    var box = doc.createElement('section'); box.className = 'ua' + (inDeck(doc) ? ' ua-deck' : ''); box.id = 'ua-panel'; box.hidden = true; box.tabIndex = -1;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'false'); box.setAttribute('aria-label', 'Ask the course');
    box.innerHTML = '<div class="ua__h"><span class="ua__ava">' + ICON + '<i class="ua__dot' + (live ? '' : ' ua__dot--off') + '"></i></span>' +
      '<div class="ua__hd"><b>Ask the course</b><span class="ua__st">' + (live ? 'Online · answers from the course' : 'Course text only · AI on the live site') + '</span></div>' +
      '<div class="ua__acts"><button type="button" class="ua__ib ua__new" aria-label="New chat" title="New chat">' + PLUS + '</button><button type="button" class="ua__ib ua__x" aria-label="Close" title="Close">' + CROSS + '</button></div></div>' +
      '<div class="ua__t" role="log" aria-live="polite" aria-relevant="additions"></div>' +
      '<form class="ua__f"><div class="ua__box"><textarea class="ua__in" rows="1" placeholder="Ask in your own words…" aria-label="Your question" enterkeyhint="send" autocomplete="off" autocapitalize="sentences"></textarea>' +
      '<button type="submit" class="ua__send" aria-label="Send" title="Send">' + UP + '</button></div></form>' +
      '<div class="ua__note"><span class="ua__hint">Enter sends, Shift+Enter for a new line. </span>Nothing you type is saved outside the course. When in doubt, ask your manager.</div>';
    doc.body.appendChild(box);
    var t = box.querySelector('.ua__t'), inp = box.querySelector('.ua__in'), send = box.querySelector('.ua__send'), form = box.querySelector('.ua__f');
    // On the live site, the header says whether the AI is switched on, and questions skip it when it is not.
    if (live) aiHealth().then(function (j) {
      if (j && j.helper === false) {
        aiOn = false; box.querySelector('.ua__dot').classList.add('ua__dot--off');
        box.querySelector('.ua__st').textContent = 'Course search only for now';
      }
    });
    function add(me, html, still) {
      var r = doc.createElement('div'); r.className = 'ua__row' + (me ? ' ua__row--me' : '') + (still ? ' ua__row--still' : '');
      r.innerHTML = (me ? '' : '<span class="ua__ava">' + ICON + '</span>') + '<div class="ua__m' + (me ? ' ua__m--me' : '') + '">' + html + '</div>';
      t.appendChild(r); t.scrollTop = t.scrollHeight; return r;
    }
    function render() {
      t.innerHTML = '';
      if (!thread.length) {
        add(false, '<p>Hi. Ask anything about the work: a template, a rule, who to tag, what a word means.</p>', true);
        var tryBox = doc.createElement('div'); tryBox.className = 'ua__try';
        tryBox.innerHTML = '<div class="ua__k">Try one</div><div class="ua__sugg">' + SUGGEST.map(function (s) { return '<button type="button">' + esc(s) + '</button>'; }).join('') + '</div>';
        t.appendChild(tryBox);
      }
      thread.forEach(function (m) { add(m.me, m.html, true); });
    }
    function keepFocusInside() { if (doc.activeElement === send || !box.contains(doc.activeElement)) box.focus({ preventScroll: true }); }
    function answer(q) {
      q = String(q || '').trim();
      // One question at a time: Enter and the suggestions wait for the answer, like the Send button.
      if (!q || send.disabled) return;
      var mine = thread;
      inp.value = ''; inp.style.height = '';
      if (!thread.length) t.innerHTML = '';
      thread.push({ me: true, html: esc(q) }); add(true, esc(q)); keep();
      var wait = add(false, '<div class="ua__wait" role="status"><span class="ua__dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="ua__wait-t">Looking in the course…</span></div>');
      keepFocusInside();
      send.disabled = true;
      loadIndex().then(function () {
        var hits = search(q, 3);
        if (!hits.length) { wait.remove(); return done('<p>Nothing in the course matches that. Try other words, or ask your manager.</p>'); }
        if (!aiOn) { wait.remove(); return done('<div class="ua__k">From the course</div>' + courseHtml(hits, q, false)); }
        wait.querySelector('.ua__wait-t').textContent = 'Asking the helper…';
        askAi(q, hits).then(function (j) {
          wait.remove();
          if (j && j.answer) {
            // The function numbers only the passages it found; follow its list so [n] points at the right one.
            var used = Array.isArray(j.ids) ? hits.filter(function (h) { return j.ids.indexOf(h.p.id) >= 0; }) : hits;
            if (!used.length) used = hits;
            done('<div class="ua__k">The helper, from the course</div>' + answerHtml(j.answer, used, j.sources) + courseHtml(used, q, true));
          } else done('<div class="ua__k">' + esc(ENDED[j && j.error] || 'The helper did not answer.') + ' The course says:</div>' + courseHtml(hits, q, false));
        });
      }).catch(function (e) {
        wait.remove();
        var msg = e && e.message;
        done('<p>' + (msg === 'signin' ? 'Sign in to ask the course.' : msg === 'no-access' ? 'The Ask tool is not open to you. Ask your trainer.' : 'The course index could not be loaded. Try again in a moment.') + '</p>');
      });
      function done(html) {
        // New chat was pressed while this one was out: its answer belongs to the old thread.
        if (thread !== mine) return;
        thread.push({ me: false, html: html }); keep();
        var row = add(false, html); send.disabled = false;
        // Show the start of the answer, not the end of its passages; keep the keyboard down on a phone.
        t.scrollTop = Math.max(0, row.offsetTop - t.offsetTop - 8);
        if (fine()) inp.focus(); else keepFocusInside();
      }
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); answer(inp.value); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); answer(inp.value); } });
    inp.addEventListener('input', function () { inp.style.height = ''; inp.style.height = Math.min(132, inp.scrollHeight) + 'px'; });
    t.addEventListener('click', function (e) {
      // A link leaves the card: close it first, so a link to a part of the page being read lands in view.
      var a = e.target.closest('a[href]');
      if (a) { if (!e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && !e.button) close(true); return; }
      var b = e.target.closest('.ua__sugg button'); if (b) answer(b.textContent);
    });
    box.querySelector('.ua__new').addEventListener('click', function () { thread = []; keep(); send.disabled = false; render(); if (fine()) inp.focus(); });
    // A deck turns arrows, space and Enter into slide moves; inside the card they are typing.
    box.addEventListener('keydown', function (e) { if (NAV_KEYS[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) e.stopPropagation(); });

    // ---- placing the card: under the button on a desk (above it when there is no room), the screen on a phone
    var opener = null, inert = [], mode = null, closing = null;
    function width() { var de = doc.documentElement; return doc.compatMode === 'CSS1Compat' && de.clientWidth ? de.clientWidth : win.innerWidth; }
    function place() {
      var r = btn.getBoundingClientRect(), vw = width(), vv = win.visualViewport, vh = vv ? vv.height : win.innerHeight, sm = small();
      // The layout can change while open (a phone turned sideways): the page lock follows it.
      if (!box.hidden && sm !== mode) { mode = sm; lock(sm); }
      if (sm) {
        var top = vv ? vv.offsetTop : 0;
        // Keep the end of the thread in view only when the reader is already there (a keyboard opening, say).
        var atEnd = t.scrollHeight > t.clientHeight && t.scrollHeight - t.scrollTop - t.clientHeight < 40;
        box.style.top = top + 'px'; box.style.height = vh + 'px'; box.style.right = ''; box.style.width = '';
        box.style.transformOrigin = (r.left + r.width / 2) + 'px ' + (r.top + r.height / 2 - top) + 'px';
        box.classList.toggle('ua--kb', !!vv && vv.height < win.screen.height * 0.6);
        if (atEnd) t.scrollTop = t.scrollHeight;
      } else {
        var gap = 8, below = vh - r.bottom - gap - 16, above = r.top - gap - 16, up = below < 360 && above > below;
        var h = Math.min(640, Math.max(up ? above : below, 300), vh - 32), w = Math.min(400, vw - 24), right = Math.max(12, vw - r.right);
        var top2 = up ? Math.max(16, r.top - gap - h) : Math.min(r.bottom + gap, vh - h - 16), left = vw - right - w;
        box.style.top = top2 + 'px'; box.style.height = h + 'px'; box.style.right = right + 'px'; box.style.width = w + 'px';
        box.style.transformOrigin = (r.left + r.width / 2 - left) + 'px ' + (r.top + r.height / 2 - top2) + 'px';
        box.classList.remove('ua--kb');
      }
    }
    function focusables() {
      return [].slice.call(box.querySelectorAll('button:not([disabled]),a[href],textarea,summary,[tabindex="0"]')).filter(function (el) { return el.offsetParent !== null; });
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
      // When the card is the screen, Tab stays inside it.
      if (e.key === 'Tab' && mode) {
        var f = focusables(); if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (doc.activeElement === first || doc.activeElement === box)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    function lock(on) {
      doc.documentElement.classList.toggle('ua-lock', on);
      box.setAttribute('aria-modal', on ? 'true' : 'false');
      if (on && !inert.length) { [].slice.call(doc.body.children).forEach(function (el) { if (el !== box && !el.hasAttribute('inert')) { el.setAttribute('inert', ''); inert.push(el); } }); }
      if (!on) { inert.forEach(function (el) { el.removeAttribute('inert'); }); inert = []; }
    }
    function open(from) {
      // A press during the close animation reopens; a press while open does nothing (the button toggles).
      if (closing) { clearTimeout(closing); closing = null; } else if (!box.hidden) return;
      opener = from || btn; render();
      box.hidden = false; box.classList.remove('is-instant'); mode = null; place();
      t.scrollTop = thread.length ? t.scrollHeight : 0;
      btn.classList.add('is-on'); btn.setAttribute('aria-expanded', 'true');
      void box.offsetWidth; box.classList.add('is-open');
      doc.addEventListener('keydown', onKey, true);
      win.addEventListener('resize', place);
      if (win.visualViewport) { win.visualViewport.addEventListener('resize', place); win.visualViewport.addEventListener('scroll', place); }
      // The field only on a pointer device: on a phone the suggestions show before the keyboard.
      var focus = function () { if (box.hidden) return; if (fine()) inp.focus(); else box.focus({ preventScroll: true }); };
      if (reduce()) focus(); else setTimeout(focus, 210);
    }
    function after() {
      closing = null;
      var inside = !doc.activeElement || doc.activeElement === doc.body || box.contains(doc.activeElement);
      box.hidden = true; box.classList.remove('is-instant');
      if (inside && opener && opener.focus) { try { opener.focus({ preventScroll: true }); } catch (e) { opener.focus(); } }
    }
    function close(instant) {
      if (box.hidden) return;
      if (closing) { if (instant) { clearTimeout(closing); after(); } return; }
      // Esc is a keyboard action: everything changes at once, the button too.
      if (instant) { box.classList.add('is-instant'); btn.style.transition = 'none'; }
      box.classList.remove('is-open'); btn.classList.remove('is-on'); btn.setAttribute('aria-expanded', 'false');
      if (instant) { void btn.offsetWidth; btn.style.transition = ''; }
      doc.removeEventListener('keydown', onKey, true);
      win.removeEventListener('resize', place);
      if (win.visualViewport) { win.visualViewport.removeEventListener('resize', place); win.visualViewport.removeEventListener('scroll', place); }
      lock(false); mode = null;
      if (instant) after(); else closing = setTimeout(after, 160);
    }
    box.querySelector('.ua__x').addEventListener('click', function () { close(false); });
    return { open: open, close: close, isOpen: function () { return !box.hidden && !closing; } };
  }
  var panels = [];
  function mount(doc) {
    doc = doc || document;
    if (!doc.body || doc.querySelector('.ua-btn')) return;
    if (!doc.getElementById('ua-css')) { var st = doc.createElement('style'); st.id = 'ua-css'; st.textContent = CSS; doc.head.appendChild(st); }
    var btn = doc.createElement('button'); btn.type = 'button'; btn.className = 'ua-btn' + (inDeck(doc) ? ' ua-deck' : ''); btn.innerHTML = ICON; btn.title = 'Ask the course';
    btn.setAttribute('aria-label', 'Ask the course'); btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-controls', 'ua-panel'); btn.setAttribute('aria-expanded', 'false');
    var win = doc.defaultView || window, host = doc.querySelector('.topbar__right'), theme = doc.querySelector('#themeBtn,#themebtn');
    if (host) host.insertBefore(btn, host.firstChild);
    else if (theme && theme.parentNode && /^(static|relative)$/.test(win.getComputedStyle(theme).position)) {
      // A deck's own control row: sit left of its theme switch.
      btn.className += ' ua-btn--deck'; theme.parentNode.insertBefore(btn, theme);
    } else {
      btn.className += ' ua-btn--fixed'; doc.body.appendChild(btn);
      if (theme) {
        // A deck whose theme switch floats: sit just left of it, and step further left past any of the deck's
        // own links or buttons there (its "Course menu" on a phone), never on top of them.
        var put = function () {
          var r = theme.getBoundingClientRect(); if (!r.width) return;
          var de = doc.documentElement, cw = doc.compatMode === 'CSS1Compat' && de.clientWidth ? de.clientWidth : win.innerWidth;
          var s = r.height, left = r.left - 10 - s;
          for (var i = 0; i < 4 && left > 8; i++) {
            var hit = null;
            [left + 2, left + s / 2, left + s - 2].some(function (x) {
              return (doc.elementsFromPoint ? doc.elementsFromPoint(x, r.top + s / 2) : []).some(function (el) {
                if (el === btn || btn.contains(el)) return false;
                var a = el.closest && el.closest('a[href],button,input,select,textarea,[role="button"]');
                if (a && a !== btn) { hit = a; return true; }
                return false;
              });
            });
            if (!hit) break;
            left = Math.min(left, hit.getBoundingClientRect().left) - 10 - s;
          }
          btn.style.top = r.top + 'px'; btn.style.right = Math.max(0, cw - left - s) + 'px'; btn.style.width = btn.style.height = s + 'px';
        };
        put(); win.addEventListener('resize', put); win.addEventListener('load', put); setTimeout(put, 600);
      }
    }
    var panel = null;
    btn.addEventListener('click', function () { if (!panel) panel = build(doc, btn); if (panel.isOpen()) panel.close(false); else panel.open(btn); });
    panels.push(btn);
  }
  window.uglAssist = { mount: mount, search: function (q, k) { return loadIndex().then(function () { return search(q, k); }); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { mount(document); }); else mount(document);
})();
