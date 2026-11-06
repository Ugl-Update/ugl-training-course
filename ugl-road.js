// Built by tools/build_content.py from tools/road/*.js. Do not edit here.
// Shared by every road page (stops and tools): escaping, toasts and the Copy buttons.
// A [data-copy] button puts its text on the clipboard; that is how the message templates leave the
// site (the copy guard allows it, and selecting text inside [data-copy-ok] is allowed too).
window.UGLRoadCommon = window.UGLRoadCommon || (function () {
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var own, ownTimer;
  function toast(msg, ms) {
    // On the live site the lesson loader's guard owns the toast; the offline preview has none.
    if (window.uglGuard && window.uglGuard.toast) return window.uglGuard.toast(msg, ms);
    if (!own) { own = document.createElement('div'); own.className = 'rt-toast'; own.setAttribute('role', 'status'); document.body.appendChild(own); }
    own.textContent = msg; own.classList.add('is-on');
    clearTimeout(ownTimer); ownTimer = setTimeout(function () { own.classList.remove('is-on'); }, ms || 2600);
  }
  function copy(text, done) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta);
      toast(ok ? (done || 'Copied.') : 'Could not copy. Select the text and press Ctrl+C.');
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(done || 'Copied.'); }, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-copy]');
    if (!b) return;
    copy(b.getAttribute('data-copy'), 'Copied. Paste it in Gmail or Telegram and fill in the dots.');
    b.classList.add('is-copied');
    setTimeout(function () { b.classList.remove('is-copied'); }, 1400);
    document.dispatchEvent(new CustomEvent('ugl-copied', { detail: { button: b } }));
  });
  return { $: $, esc: esc, toast: toast, copy: copy };
})();
// Road stop pages: the stop strip, photo zoom and the "Do it" drills. Each drill card carries its
// answers in a <script type="application/json">. First-try results are scored; the best score stays
// in this browser, and on the live site the result of a finished set is reported to the admin
// (window.uglReport, set by module.html) so the trainer sees what was understood.
window.UGLRoadDrills = function () {
  var page = document.getElementById('drills');
  if (!page) return;
  var C = window.UGLRoadCommon, esc = C.esc;
  var ID = window.UGL_DRILL_KEY || '', KEY = 'ugl-drills:' + ID;

  // ---- keep the current stop in view in the stop strip (it scrolls sideways on phones)
  var on = document.querySelector('.roadstrip .is-on');
  if (on) on.parentNode.scrollLeft = on.offsetLeft - on.parentNode.offsetLeft - 16;
  // Stops whose drills were finished here get a tick in the strip.
  document.querySelectorAll('.roadstrip a[data-stop]').forEach(function (a) {
    try { var b = JSON.parse(localStorage.getItem('ugl-drills:' + a.getAttribute('data-stop')) || 'null'); if (b && b.n) a.classList.add('is-done'); } catch (e) {}
  });

  // ---- trip meter: a thin bar under the top bar that fills as the trainee moves down the stop, with where they are
  (function () {
    var bar = document.querySelector('.topbar'), old = document.querySelector('.trip');
    if (old) old.parentNode.removeChild(old);
    if (window.__uglTripOff) window.__uglTripOff();
    if (!bar || !bar.parentNode) return;
    var t = document.createElement('div'); t.className = 'trip'; t.innerHTML = '<i></i><span class="trip__k"></span>';
    bar.parentNode.insertBefore(t, bar.nextSibling);
    // This stop's own parts and mile marker (the offline preview keeps every lesson in one document).
    var root = page; while (root.parentNode && root.parentNode !== document && !root.querySelector('.mile')) root = root.parentNode;
    var fill = t.firstChild, label = t.lastChild, parts = [].slice.call(root.querySelectorAll('.sec>h2')), mile = root.querySelector('.mile');
    function tick() {
      var max = document.documentElement.scrollHeight - window.innerHeight, pct = max > 0 ? Math.min(100, Math.round(window.scrollY / max * 100)) : 0, cur = '';
      t.style.top = bar.offsetHeight + 'px';
      parts.forEach(function (h) { var r = h.getBoundingClientRect(); if (r.height && r.top <= 200) cur = h.textContent.replace(/^\d+\s*/, ''); });
      fill.style.width = pct + '%';
      label.textContent = (mile ? 'Stop ' + mile.textContent + ' · ' : '') + (cur ? cur + ' · ' : '') + pct + '%';
    }
    window.addEventListener('scroll', tick, { passive: true }); window.addEventListener('resize', tick);
    window.__uglTripOff = function () { window.removeEventListener('scroll', tick); window.removeEventListener('resize', tick); };
    tick();
  })();

  // ---- photo zoom: one delegated handler, because drill cards are re-created by "Try them again"
  var box = document.createElement('div');
  box.className = 'zoom'; box.hidden = true; box.innerHTML = '<img alt=""><p></p>';
  page.parentNode.appendChild(box);
  box.addEventListener('click', function () { box.hidden = true; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') box.hidden = true; });
  document.addEventListener('click', function (e) {
    var img = e.target.closest && e.target.closest('img[data-zoom]');
    if (!img || !img.src || /#k=/.test(img.getAttribute('src') || '') || !document.body.contains(box)) return;
    box.querySelector('img').src = img.src;
    var cap = img.closest('figure') && img.closest('figure').querySelector('figcaption');
    box.querySelector('p').textContent = cap ? cap.textContent : '';
    box.hidden = false;
  });

  // ---- drills
  var cards = [].slice.call(page.querySelectorAll('.drill')), first = {}, solved = {}, posted = false, told = false;
  var orig = cards.map(function (c) { return c.innerHTML; });
  var scoreEl = document.getElementById('drill-score');
  window.UGL_DRILLS = { n: cards.length, done: function () { return Object.keys(solved).length; } };
  function best() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function score() {
    var n = cards.length, right = 0, done = Object.keys(solved).length;
    Object.keys(first).forEach(function (i) { if (first[i]) right++; });
    var b = best();
    if (done === n) {
      if (!b || right > b.right) { b = { right: right, n: n, at: Date.now() }; try { localStorage.setItem(KEY, JSON.stringify(b)); } catch (e) {} }
      if (!posted && window.uglReport) {
        posted = true;
        var missed = cards.map(function (c, i) { return first[i] ? null : i + 1; }).filter(Boolean);
        window.uglReport('drill', { stop: ID, right: right, n: n, missed: missed });
      }
      // The page that hosts the stop (module.html) marks it as read once the set is finished: told once per set.
      if (!told && typeof window.uglDrillsDone === 'function') {
        told = true;
        try { window.uglDrillsDone({ stop: ID, right: right, n: n }); } catch (e) {}
      }
      scoreEl.innerHTML = '<b>All done: ' + right + ' of ' + n + ' right on the first try.</b>' + (right === n ? ' Perfect.' : ' Read the ones you missed once more.') +
        ' <button type="button" class="btn btn--ghost" id="drill-again">Try them again</button>';
      document.getElementById('drill-again').onclick = reset;
      var cur = document.querySelector('.roadstrip a.is-on'); if (cur) cur.classList.add('is-done');
    } else {
      scoreEl.innerHTML = done ? done + ' of ' + n + ' done · ' + right + ' right on the first try' + (b ? ' · best so far ' + b.right + ' of ' + b.n : '') :
        (b ? 'Best so far: ' + b.right + ' of ' + b.n + ' right on the first try.' : '');
    }
  }
  function result(i, ok) { if (!(i in first)) first[i] = ok; if (ok) solved[i] = true; score(); }
  function fb(card, ok, html) { var f = card.querySelector('.drill__fb'); f.className = 'drill__fb ' + (ok ? 'is-ok' : 'is-bad'); f.innerHTML = html; }
  function lock(card) { [].forEach.call(card.querySelectorAll('button, input, textarea'), function (x) { x.disabled = true; }); }
  function norm(s) { return String(s).toLowerCase().replace(/[$°,]/g, '').replace(/\bf\b/g, '').replace(/\s+/g, ' ').trim(); }

  function bind(card, i) {
    var d = JSON.parse(card.querySelector('script').textContent), tries = 0;
    if (d.type === 'choice') {
      [].forEach.call(card.querySelectorAll('.opt'), function (b) {
        b.addEventListener('click', function () {
          var o = d.opts[+b.getAttribute('data-o')];
          if (o[0]) { b.classList.add('is-ok'); lock(card); fb(card, true, '<b>Right.</b> ' + o[1]); }
          else { b.classList.add('is-bad'); b.disabled = true; fb(card, false, '<b>Not quite.</b> ' + o[1] + ' Try again.'); }
          result(i, o[0]);
        });
      });
    } else if (d.type === 'order') {
      var list = card.querySelector('.drill__order');
      function number() { [].forEach.call(list.children, function (li, k) { li.querySelector('.ord__n').textContent = k + 1; }); }
      number();
      list.addEventListener('click', function (e) {
        var b = e.target.closest('[data-mv]'); if (!b || b.disabled) return;
        var li = b.closest('li'), mv = +b.getAttribute('data-mv');
        if (mv < 0 && li.previousElementSibling) list.insertBefore(li, li.previousElementSibling);
        if (mv > 0 && li.nextElementSibling) list.insertBefore(li.nextElementSibling, li);
        [].forEach.call(list.children, function (x) { x.classList.remove('is-ok', 'is-bad'); });
        number(); b.focus();
      });
      card.querySelector('.drill__check').addEventListener('click', function () {
        var wrong = 0;
        [].forEach.call(list.children, function (li, k) { var ok = +li.getAttribute('data-k') === k; li.classList.toggle('is-ok', ok); li.classList.toggle('is-bad', !ok); if (!ok) wrong++; });
        if (!wrong) { lock(card); fb(card, true, '<b>Right order.</b>' + (d.why ? ' ' + d.why : '')); }
        else fb(card, false, '<b>' + wrong + ' in the wrong place.</b> Move the red ones and check again.');
        result(i, !wrong);
      });
    } else if (d.type === 'number') {
      var inp = card.querySelector('input');
      function check() {
        var v = parseFloat(String(inp.value).replace(/[$,\s]/g, ''));
        if (isNaN(v)) { fb(card, false, 'Type a number first.'); return; }
        var ok = Math.abs(v - d.answer) <= (d.tol || 0);
        if (ok) lock(card);
        fb(card, ok, ok ? '<b>Right.</b> ' + d.why : '<b>Not quite.</b> Check your math and try again.' + (++tries >= 2 && d.hint ? ' <i>' + d.hint + '</i>' : ''));
        result(i, ok);
      }
      card.querySelector('.drill__check').addEventListener('click', check);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') check(); });
    } else if (d.type === 'cloze') {
      // The team's message with a few blanks: each one must match one of the accepted answers.
      var inputs = [].slice.call(card.querySelectorAll('input.cloze'));
      // Each blank says what shape of answer goes in it, read off the accepted answers.
      function shape(acc) {
        var a = acc[0] || '';
        if (/:|\b[ap]\.?m\b/i.test(a)) return 'time';
        if (/\d/.test(a)) return 'number';
        if (/^[A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+)*, [A-Z]{2}$/.test(a)) return 'city';
        return 'word';
      }
      inputs.forEach(function (inp, k) {
        if (!d.blanks[k] || inp.placeholder) return;
        var hint = shape(d.blanks[k]);
        inp.placeholder = hint;
        if (inp.size < hint.length) inp.size = hint.length;  // the hint must show whole in a short blank
      });
      // The model sentence: the template with the first accepted answer in every blank.
      function model() {
        var out = '', box = card.querySelector('.cloze__text');
        [].forEach.call(box ? box.childNodes : [], function (n) {
          if (n.nodeType === 3) out += n.textContent;
          else if (n.nodeName === 'BR') out += '\n';
          else if (n.nodeName === 'INPUT') out += (d.blanks[+n.getAttribute('data-k')] || [''])[0];
          else out += n.textContent;
        });
        return out;
      }
      function checkCloze() {
        var wrong = 0;
        inputs.forEach(function (inp, k) {
          var ok = d.blanks[k].some(function (a) { return norm(a) === norm(inp.value); });
          inp.classList.toggle('is-ok', ok); inp.classList.toggle('is-bad', !ok); if (!ok) wrong++;
        });
        if (!wrong) { lock(card); fb(card, true, '<b>Right.</b> ' + (d.why || 'That is the message, with the right numbers.')); }
        else {
          tries++;
          fb(card, false, '<b>' + wrong + ' blank' + (wrong > 1 ? 's are' : ' is') + ' not right.</b> Read the situation again and fix the red ones.' +
            '<div class="drill__model"><small>The team\'s version</small><pre>' + esc(model()) + '</pre></div>');
        }
        result(i, !wrong);
      }
      card.querySelector('.drill__check').addEventListener('click', checkCloze);
      inputs.forEach(function (inp) { inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') checkCloze(); }); });
    } else if (d.type === 'spot') {
      // Tap the line that is wrong in this message.
      [].forEach.call(card.querySelectorAll('.spot__line'), function (b) {
        b.addEventListener('click', function () {
          var ok = +b.getAttribute('data-k') === d.bad;
          if (ok) { b.classList.add('is-ok'); lock(card); fb(card, true, '<b>That is the one.</b> ' + d.why); }
          else { b.classList.add('is-bad'); b.disabled = true; fb(card, false, '<b>Not that line.</b> That one is fine. Look again.'); }
          result(i, ok);
        });
      });
    } else if (d.type === 'sort') {
      // Put each item in one of two buckets, then check.
      card.querySelector('.sort').addEventListener('click', function (e) {
        var b = e.target.closest('[data-b]'); if (!b || b.disabled) return;
        var row = b.closest('.sort__row');
        row.setAttribute('data-pick', b.getAttribute('data-b'));
        [].forEach.call(row.querySelectorAll('[data-b]'), function (x) { x.classList.toggle('is-on', x === b); });
        row.classList.remove('is-ok', 'is-bad');
      });
      card.querySelector('.drill__check').addEventListener('click', function () {
        var rows = [].slice.call(card.querySelectorAll('.sort__row')), wrong = 0, empty = 0;
        rows.forEach(function (row, k) {
          var p = row.getAttribute('data-pick');
          if (p == null) { empty++; return; }
          var ok = +p === d.items[k][1]; row.classList.toggle('is-ok', ok); row.classList.toggle('is-bad', !ok); if (!ok) wrong++;
        });
        if (empty) { fb(card, false, 'Place every item first: ' + empty + ' still unsorted.'); return; }
        if (!wrong) { lock(card); fb(card, true, '<b>All sorted right.</b> ' + (d.why || '')); }
        else fb(card, false, '<b>' + wrong + ' in the wrong place.</b> Change the red ones and check again.');
        result(i, !wrong);
      });
    } else {
      var ta = card.querySelector('textarea');
      card.querySelector('.drill__check').addEventListener('click', function () {
        var t = ta.value;
        if (t.trim().length < 8) { fb(card, false, 'Write the message first.'); return; }
        function hit(r) { return new RegExp(r[0], 'i').test(t); }
        var miss = d.need.filter(function (r) { return !hit(r); }), bad = d.never.filter(hit), ok = !miss.length && !bad.length;
        var rows = d.need.map(function (r) { var got = miss.indexOf(r) < 0; return '<li class="' + (got ? 'ok' : 'bad') + '">' + (got ? '✓ ' : '✗ ') + esc(r[1]) + '</li>'; })
          .concat(bad.map(function (r) { return '<li class="bad">✗ ' + esc(r[1]) + '</li>'; }));
        fb(card, ok, (ok ? '<b>Good message.</b> Everything the team checks for is there.' : '<b>Almost.</b> Fix the red lines and check again. Use the team\'s wording.') +
          '<ul class="drill__rules">' + rows.join('') + '</ul><div class="drill__model"><small>The team\'s version</small><pre>' + esc(d.model) + '</pre></div>');
        if (ok) lock(card);
        result(i, ok);
      });
    }
  }
  function reset() {
    first = {}; solved = {}; posted = false; told = false;
    cards.forEach(function (c, i) { c.innerHTML = orig[i]; bind(c, i); });
    score();
    page.scrollIntoView({ behavior: 'smooth' });
  }
  cards.forEach(bind);
  score();
};
// The "On a load" and reference tools: Message Builder, EFS request, lumper and late fees, customer
// rules, glossary, who to tag, and Ask the Course. Each page sets window.UGL_TOOL and calls one
// function here with it. Nothing here asks the updater to type into the template: every message
// copies as the team's template with dots for the blanks, to be filled in Gmail or Telegram.
window.UGLRoad = (function () {
  var C = window.UGLRoadCommon, $ = C.$, esc = C.esc, toast = C.toast;
  var DOTS = '.....';

  // ---- one live search box over a list of elements; `hay(el)` is the text to match, every word must match
  var ALIAS = { ice: 'black ice weather', snow: 'weather', rain: 'weather', del: 'receiver delivered', pu: 'shipper pickup', g2g: 'good to go', 'good2go': 'good to go',
    appt: 'appointment', late: 'running late detention', lumper: 'fee', fee: 'lumper late', pod: 'delivered', bol: 'pickup', eta: 'transit', seal: 'special', slc: 'sealed inside',
    temp: 'temperature reefer', reefer: 'temperature', trailer: 'power only', usps: 'trailer', amin: 'trailer', drop: 'dropped trailer', efs: 'fee' };
  function words(s) { return String(s).toLowerCase().replace(/[^a-z0-9#$ ]+/g, ' ').split(/\s+/).filter(Boolean); }
  function searchable(input, els, hay, noneEl, after) {
    var H = els.map(function (el) { return ' ' + words(hay(el)).join(' ') + ' '; });
    function run() {
      var ts = words(input.value).map(function (t) { return [t].concat(ALIAS[t] ? ALIAS[t].split(' ') : []); }), shown = 0;
      els.forEach(function (el, i) {
        var ok = ts.every(function (alts) { return alts.some(function (a) { return H[i].indexOf(' ' + a) >= 0; }); });
        el.hidden = !ok; if (ok) shown++;
      });
      if (noneEl) noneEl.style.display = shown ? 'none' : 'block';
      if (after) after(shown, input.value.trim());
    }
    input.addEventListener('input', run);
    run();
    return run;
  }
  function anchor() { return decodeURIComponent((location.hash || '').replace(/^#/, '').replace(/^lesson-[a-z0-9-]+?(--|$)/, '')); }
  function flash(el) { el.classList.add('is-flash'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(function () { el.classList.remove('is-flash'); }, 1600); }
  function tabs(items, cur, attr) {
    return '<div class="qa-mode" role="tablist">' + items.map(function (x, i) { return '<button type="button" role="tab" ' + attr + '="' + i + '"' + (i === cur ? ' class="is-on" aria-selected="true"' : '') + '>' + esc(x) + '</button>'; }).join('') + '</div>';
  }
  function proof(title, items) {
    return '<div class="proof"><h4>' + esc(title) + '</h4>' + items.map(function (p) { return '<label><input type="checkbox"> <span>' + esc(p) + '</span></label>'; }).join('') + '</div>';
  }

  // ------------------------------------------------------------ message builder: a searchable cheat sheet
  // The six templates sent most: one tap copies them, before any searching. Ids from messages.json.
  var MOST = [['to-pu-far', 'Rolling to the shipper'], ['at-pu', 'On site at the shipper'], ['pu-van', 'Pickup email'], ['tr-update', 'Transit update'], ['delivered', 'Delivered'], ['g-pod', 'POD']];
  function builder(D) {
    var root = $('tool'), RECENT = 'ugl-mb-recent';
    function recent() { try { return JSON.parse(sessionStorage.getItem(RECENT) || '[]'); } catch (e) { return []; } }
    var by = {};
    D.messages.forEach(function (m) { by[m.id] = m; });
    function tap(id, label) { return '<button type="button" class="mb__rbtn" data-copy="' + esc(by[id].text) + '" data-mid="' + id + '" title="' + esc(by[id].title) + '">' + esc(label || by[id].title) + '</button>'; }
    var most = MOST.filter(function (x) { return by[x[0]]; });
    root.innerHTML = '<div class="mb__bar"><input class="search" id="mb-q" type="search" placeholder="Search: traffic, lumper, seal, 150 miles…" autocomplete="off" aria-label="Search messages">' +
      '<div class="mb__chips" id="mb-chips">' + D.groups.map(function (g) { return '<a href="#' + g.id + '" data-g="' + g.id + '">' + esc(g.title) + '</a>'; }).join('') + '</div></div>' +
      (most.length ? '<div class="mb__recent mb__most" id="mb-most"><small>Most used</small><span>' + most.map(function (x) { return tap(x[0], x[1]); }).join('') + '</span></div>' : '') +
      '<div class="mb__recent" id="mb-recent" hidden><small>Recently copied</small><span></span></div>' +
      D.groups.map(function (g) {
        var ms = D.messages.filter(function (m) { return m.group === g.id; });
        return '<section class="mbg" id="' + g.id + '" data-group><h3 class="mbg__h">' + esc(g.title) + '<small>' + ms.length + '</small></h3>' +
          (g.note ? '<div class="gate"><b>Rule</b><span>' + g.note + '</span></div>' : '') + '<div class="msgs msgs--list">' + ms.map(function (m) { return m.html; }).join('') + '</div></section>';
      }).join('') + '<p class="empty" id="mb-none" style="display:none">No message matches that. Try another word, or ask your manager.</p>';
    var cards = [].slice.call(root.querySelectorAll('.msg'));
    function drawRecent() {
      var r = recent().filter(function (id) { return by[id]; }), box = $('mb-recent');
      box.hidden = !r.length;
      box.querySelector('span').innerHTML = r.map(function (id) { return tap(id); }).join('');
    }
    document.addEventListener('ugl-copied', function (e) {
      var card = e.detail.button.closest('.msg'), id = card ? card.getAttribute('data-msg') : e.detail.button.getAttribute('data-mid');
      if (!id || !by[id]) return;
      var r = [id].concat(recent().filter(function (x) { return x !== id; })).slice(0, 5);
      try { sessionStorage.setItem(RECENT, JSON.stringify(r)); } catch (x) {}
      drawRecent();
    });
    drawRecent();
    searchable($('mb-q'), cards, function (c) { var m = by[c.getAttribute('data-msg')]; return m.title + ' ' + m.when + ' ' + m.text + ' ' + m.find; }, $('mb-none'), function (shown, q) {
      root.querySelectorAll('[data-group]').forEach(function (sec) { sec.hidden = ![].some.call(sec.querySelectorAll('.msg'), function (c) { return !c.hidden; }); });
      $('mb-recent').hidden = !!q || !recent().length;
      if ($('mb-most')) $('mb-most').hidden = !!q;
    });
    // A jump chip lands the group heading just under the sticky search bar. The heading's scroll-margin-top
    // is set from where the bar sits when stuck (its top offset plus its height), so it holds on every
    // breakpoint. The hash is replaced, not set, so the page that hosts the tool does not re-route on hashchange.
    function jump(id, smooth) {
      var sec = $(id), h = sec && sec.querySelector('.mbg__h'); if (!h) return;
      var bar = root.querySelector('.mb__bar'), top = bar ? (parseFloat(getComputedStyle(bar).top) || 0) + bar.offsetHeight : 0;
      if (top) h.style.scrollMarginTop = Math.round(top + 8) + 'px';
      h.scrollIntoView(smooth ? { behavior: 'smooth', block: 'start' } : { block: 'start' });
    }
    $('mb-chips').addEventListener('click', function (e) {
      var a = e.target.closest('a[data-g]'); if (!a) return;
      e.preventDefault();
      jump(a.getAttribute('data-g'), true);
      try { history.replaceState(null, '', location.href.replace(/#.*$/, '') + '#' + (location.hash.indexOf('#lesson-') === 0 ? location.hash.slice(1).replace(/--.*$/, '') + '--' : '') + a.getAttribute('data-g')); } catch (x) {}
    });
    var a = anchor();
    if (by[a]) flash(root.querySelector('[data-msg="' + a + '"]'));
    else if (a && $(a)) jump(a, false);
  }

  // ------------------------------------------------------------ EFS request: the format, ready to fill
  var EFS = {
    company: { lead: 'Parking, straps, coolant, a padlock: anything bought for the company.', lines: ['EFS Request - ' + DOTS, 'Truck: ' + DOTS, 'Driver: ' + DOTS, 'Amount $: ' + DOTS, 'Reason: ' + DOTS, 'Payee: ' + DOTS],
      reasons: ['parking', 'buying straps', 'buying a padlock', 'buying coolant', 'buying a pulp', 'buying load locks'],
      proof: ['A picture or video of what the driver is paying for or buying', 'After accounting issues the EFS: ask the driver for the receipt'] },
    load: { lead: 'Lumper, late, escort or rescheduling fee on a load.', lines: ['EFS Request - ' + DOTS, 'Truck: ' + DOTS, 'Driver: ' + DOTS, 'Amount $: ' + DOTS, 'Reason: ' + DOTS, 'Payee: ' + DOTS, 'Load ID # ' + DOTS, 'Link: ' + DOTS, '@dispatcher please note'],
      reasons: ['lumper fee at the receiver, tried calling and emailing the broker for 20 minutes, no answer', 'lumper fee at the receiver, the broker asked us to pay it and will reimburse', 'late fee at the receiver, the broker cannot pay it and asked us to pay', 'rescheduling fee'],
      proof: ['Screenshots of the emails, calls, transcripts or call notes showing you tried the broker, or the broker\'s answer about the payment', 'Tag the dispatcher', 'After accounting issues the EFS: ask the driver for the receipt'] }
  };
  function efs() {
    var root = $('tool'), mode = 'company';
    function draw() {
      var e = EFS[mode];
      root.innerHTML = tabs(['Company expense', 'Load fee'], mode === 'company' ? 0 : 1, 'data-mode') + '<p class="mb__when">' + esc(e.lead) + '</p>' +
        '<div class="efs"><div><textarea class="rt-out" id="efs-out" rows="' + (e.lines.length + 1) + '" spellcheck="false" aria-label="EFS request">' + esc(e.lines.join('\n')) + '</textarea>' +
        '<p class="mb__when">Type over the dots here, or copy the format and fill it in the EFS group. Tap a reason to put it in:</p>' +
        '<div class="chipsel">' + e.reasons.map(function (r) { return '<button type="button" data-r="' + esc(r) + '">' + esc(r.length > 54 ? r.slice(0, 52) + '…' : r) + '</button>'; }).join('') + '</div></div>' +
        '<div>' + proof('Before you post it', e.proof) + '<div class="rt-bar"><button type="button" class="btn" id="efs-copy">Copy the request</button><button type="button" class="btn btn--ghost" id="efs-reset">Clear</button></div></div></div>';
      var ta = $('efs-out');
      $('efs-copy').addEventListener('click', function () {
        var ticked = [].every.call(root.querySelectorAll('.proof input'), function (c) { return c.checked; });
        C.copy(ta.value, ticked ? 'Copied. Post it in the EFS group with the proof attached.' : 'Copied. Do not forget the proof: tick the list before you post.');
      });
      $('efs-reset').addEventListener('click', draw);
      root.querySelectorAll('[data-r]').forEach(function (b) {
        b.addEventListener('click', function () { ta.value = ta.value.replace(/^Reason: .*$/m, 'Reason: ' + b.getAttribute('data-r')); });
      });
    }
    root.addEventListener('click', function (e) { var m = e.target.closest('[data-mode]'); if (m) { mode = +m.getAttribute('data-mode') ? 'load' : 'company'; draw(); } });
    draw();
  }

  // ------------------------------------------------------------ lumper and late fees: step by step, with the clocks
  function fees(D) {
    var root = $('tool'), KEY = 'ugl-fee-flow', s = load() || { log: [] }, timer = null;
    function load() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
    function save() { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
    function now() { return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
    function note(t) { s.log.push(now() + ' · ' + t); }
    var RAIL = [['fee', 'The fee'], ['email', 'Email the broker'], ['wait', 'Wait 5 min, then call'], ['answer', 'Their answer'], ['pay', 'Pay'], ['receipt', 'Receipt']];
    var AT = { start: 0, how: 0, details: 0, email: 1, wait: 2, noans: 3, code: 4, paid: 4, reimb: 3, efs: 4, receipt: 5 };
    function rail(step) {
      var k = AT[step] || 0;
      return '<ol class="fee-rail">' + RAIL.map(function (r, i) { return '<li class="' + (i < k ? 'is-done' : i === k ? 'is-on' : '') + '">' + esc(r[1]) + '</li>'; }).join('') + '</ol>';
    }
    // A clock keeps its end time, so leaving the page and coming back does not restart it.
    function clock(name, secs, label, done) {
      clearInterval(timer);
      var el = root.querySelector('[data-clock]'); if (!el) return;
      if (!s.clocks) s.clocks = {};
      if (!s.clocks[name]) { s.clocks[name] = Date.now() + secs * 1000; save(); }
      var end = s.clocks[name];
      function tick() {
        if (!document.body.contains(el)) { clearInterval(timer); return; }
        var left = Math.max(0, Math.round((end - Date.now()) / 1000));
        el.textContent = Math.floor(left / 60) + ':' + ('0' + left % 60).slice(-2);
        el.nextElementSibling.textContent = left ? label : done;
        el.classList.toggle('is-up', !left);
        if (!left) clearInterval(timer);
      }
      tick(); timer = setInterval(tick, 1000);
    }
    function pick(items) {
      return '<div class="fee-pick' + (items.length > 3 ? ' fee-pick--4' : '') + '">' + items.map(function (x) {
        return '<button type="button" data-go="' + x[0] + '"' + (x[3] ? ' data-set="' + x[3] + '"' : '') + (x[4] ? ' data-log="' + esc(x[4]) + '"' : '') + '><b>' + esc(x[1]) + '</b><span>' + esc(x[2]) + '</span></button>';
      }).join('') + '</div>';
    }
    function mail(text) { return '<textarea class="rt-out" rows="' + (text.split('\n').length + 1) + '" spellcheck="false" aria-label="Email">' + esc(text.replace(/\{[a-z_]+\}/g, DOTS)) + '</textarea>'; }
    var STEPS = {
      start: function () {
        return '<h2>What does the facility want paid?</h2>' + pick([['how', 'Lumper fee', 'Unloading the pallets. Mostly at receivers.', 'fee=lumper fee'], ['how', 'Late fee', 'The appointment was missed.', 'fee=late fee']]) +
          '<p class="fee-skip">Already past that? Jump to: <button type="button" data-go="wait" data-set="fee=lumper fee">waiting for the broker</button> · <button type="button" data-go="code" data-set="fee=lumper fee">I have a money code</button> · <button type="button" data-go="noans" data-set="fee=lumper fee">no answer</button></p>';
      },
      how: function () {
        return '<h2>How did they ask?</h2>' + pick([['details', 'A link', 'Texted to the driver.', 'via=link'], ['details', 'No link', 'They only told the driver an amount.', 'via=none']]);
      },
      details: function () {
        var link = s.via === 'link';
        return '<h2>' + (link ? 'Open the link' : 'Confirm with the employee') + '</h2><ol class="numlist">' + (link ?
          '<li><span class="nl-n">1</span><span>Ask the driver to share the link in the group.</span></li><li><span class="nl-n">2</span><span>Open it: the exact amount, the payment method, and is it really a ' + esc(s.fee) + '?</span></li>' :
          '<li><span class="nl-n">1</span><span>The driver confirms the <b>exact amount, 100%</b>, with the employee, so nothing extra is added later.</span></li><li><span class="nl-n">2</span><span>And the <b>payment method</b> (Relay, EFS, Comcheck, card, cash).</span></li>') +
          '</ol><button type="button" class="btn" data-go="email">Next: email the broker</button>';
      },
      email: function () {
        return '<h2>Email the broker</h2><p class="mb__when">Always, once you know the amount and the method. Attach a screenshot of the amount. Fill the dots in Gmail.</p>' + mail(D.ask) +
          '<div class="rt-bar"><button type="button" class="btn" data-copy="' + esc(D.ask.replace(/\{[a-z_]+\}/g, DOTS)) + '">Copy the email</button><button type="button" class="btn btn--ghost" data-go="wait" data-log="Emailed the broker">I sent it: start the 5-minute clock</button></div>';
      },
      wait: function () {
        return '<h2>Wait for the answer</h2><div class="fee-clock"><b data-clock>5:00</b><span></span></div>' +
          proof('When you call, the broker may ask', ['Check-in time', 'Door #', 'Which stop (DEL 1, DEL 2…)', 'MC # or DOT #', 'The driver\'s phone #']) +
          '<h3 class="sub">What did the broker say?</h3>' + pick([['code', 'Here is a money code', 'By email, phone or text to the driver.', '', 'Broker gave a money code'],
            ['paid', 'We will pay the link', 'Send them the link.', '', 'Broker will pay the link'], ['reimb', 'You pay, we reimburse', 'Get it by email.', '', 'Broker asked us to pay and will reimburse'],
            ['efs', 'We can\'t pay it', 'Screenshot their answer.', 'why=cant', 'Broker cannot pay it'], ['noans', 'No answer', 'Called and emailed, nothing.', '', 'Called the broker, no answer']]);
      },
      noans: function () {
        return '<h2>Keep trying for 15–20 minutes</h2><div class="fee-clock"><b data-clock>20:00</b><span></span></div><p class="mb__when">Keep calling and checking the email. Screenshot every call and email: they are the proof that we really tried.</p>' +
          pick([['answered', 'The broker answered', 'Go to their answer.'], ['efs', 'Still nothing', 'Request an EFS.', 'why=none', 'No answer after 15–20 minutes']]);
      },
      answered: function () {
        return '<h2>The broker answered. What did they say?</h2>' + pick([['code', 'Here is a money code', 'By email, phone or text to the driver.', '', 'Broker gave a money code'],
          ['paid', 'We will pay the link', 'Send them the link.', '', 'Broker will pay the link'], ['reimb', 'You pay, we reimburse', 'Get it by email.', '', 'Broker asked us to pay and will reimburse'],
          ['efs', 'We can\'t pay it', 'Screenshot their answer.', 'why=cant', 'Broker cannot pay it']]);
      },
      code: function () {
        return '<h2>Pay with the money code</h2><label class="field"><label for="fc">Paste the code</label><input id="fc" data-code autocomplete="off"></label>' +
          '<p class="mb__when">Enter it on the link exactly, <b>with no spaces</b>:</p><div class="fee-code" data-clean>—</div>' +
          '<p class="note">Relay: Pay with a check → I Have A Money Code → enter the code → Submit. Fill in the other fields the form asks for.</p>' +
          '<button type="button" class="btn" data-go="receipt" data-log="Paid with the money code">Paid: next, the receipt</button>';
      },
      paid: function () {
        return '<h2>The broker pays the link</h2><p class="mb__when">Send them the link if they don\'t have it, and wait for their confirmation that it is paid.</p><button type="button" class="btn" data-go="receipt" data-log="Broker paid the link">Paid: next, the receipt</button>';
      },
      reimb: function () {
        return '<h2>Get it in writing</h2><p class="mb__when">They said it on the phone; now ask for it by email. Then we pay through an EFS request, with their email as the proof.</p>' + mail(D.reimburse) +
          '<div class="rt-bar"><button type="button" class="btn" data-copy="' + esc(D.reimburse.replace(/\{[a-z_]+\}/g, DOTS)) + '">Copy the email</button><button type="button" class="btn btn--ghost" data-go="efs" data-set="why=reimb">Next: the EFS request</button></div>';
      },
      efs: function () {
        var why = s.why === 'none' ? 'tried calling and emailing the broker for 15–20 minutes, no answer' : s.why === 'reimb' ? 'the broker asked us to pay it and will reimburse' : 'the broker cannot pay it';
        return '<h2>Request an EFS</h2><ol class="numlist"><li><span class="nl-n">1</span><span>Screenshots: ' + (s.why === 'none' ? 'every call and every email' : 'the broker\'s answer (their email, or your call log)') + '.</span></li>' +
          '<li><span class="nl-n">2</span><span>Post the request in the company\'s EFS group for the exact amount, with the screenshots.</span></li>' +
          '<li><span class="nl-n">3</span><span>Once accounting issues it, pay, and ask the driver for the receipt.</span></li></ol>' +
          '<div class="pre"><figcaption>Reason line for the request</figcaption><pre>' + esc((s.fee || 'lumper fee') + ' at the receiver, ' + why) + '</pre></div>' +
          '<div class="rt-bar"><a class="btn btn--ghost" href="module.html?m=efs-request">Open the EFS request builder →</a><button type="button" class="btn" data-go="receipt" data-log="Paid with an EFS">Paid: next, the receipt</button></div>';
      },
      receipt: function () {
        return '<h2>Get the receipt</h2><p class="mb__when">Share it in the driver\'s group and email it to the broker.</p>' + mail(D.receipt) +
          '<div class="rt-bar"><button type="button" class="btn" data-copy="' + esc(D.receipt.replace(/\{[a-z_]+\}/g, DOTS)) + '">Copy the email</button></div>' +
          '<div class="pre"><figcaption>What happened</figcaption><pre>' + esc(s.log.join('\n') || 'Nothing noted on this fee.') + '</pre></div><button type="button" class="btn btn--ghost" data-go="start" data-reset>Start a new fee</button>';
      }
    };
    function go(step) {
      s.step = step; save();
      root.innerHTML = rail(step) + '<div class="card fee-card">' + STEPS[step]() + '</div>';
      var code = root.querySelector('[data-code]');
      if (code) code.addEventListener('input', function () { root.querySelector('[data-clean]').textContent = code.value.replace(/\s+/g, '') || '—'; });
      if (step === 'wait') clock('wait', 300, 'Waiting for an email answer.', 'No answer in 5 minutes: call the broker now.');
      else if (step === 'noans') clock('noans', 1200, 'Keep calling. You can request the EFS after 15 minutes.', '20 minutes: request the EFS with the screenshots.');
      else clearInterval(timer);
    }
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-go]'); if (!b) return;
      if (b.hasAttribute('data-reset')) s = { log: [] };
      var set = b.getAttribute('data-set'); if (set) s[set.split('=')[0]] = set.split('=')[1];
      if (b.getAttribute('data-log')) note(b.getAttribute('data-log') + (/Emailed/.test(b.getAttribute('data-log')) ? ' (' + (s.fee || 'fee') + ')' : ''));
      go(b.getAttribute('data-go'));
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    go(s.step || 'start');
  }

  // ------------------------------------------------------------ customer rules: one customer, every case as a card
  function customers(D) {
    var root = $('tool'), ci = 0;
    function draw() {
      var c = D.customers[ci];
      root.innerHTML = tabs(D.customers.map(function (x) { return x.name; }), ci, 'data-c') +
        '<div class="card"><h3>' + esc(c.name) + ' <small>' + esc(c.what) + '</small></h3><ul class="plain plain--doc">' + c.rules.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ul></div>' +
        '<div class="msgs msgs--list">' + c.cases.map(function (k) {
          return '<article class="msg msg--broker"><div class="msg__top"><span>To the broker · email</span><span class="msg__src">' + esc(k.src) + '</span></div>' +
            '<div class="msg__head"><h4>' + esc(k.t) + '</h4><button type="button" class="btn msg__copy" data-copy="' + esc(k.copy) + '">Copy</button></div>' +
            '<div class="msg__text" data-copy-ok>' + k.html + '</div><div class="msg__att"><small>Collect</small>' + k.need.map(function (n) { return '<span>' + esc(n) + '</span>'; }).join('') + '</div></article>';
        }).join('') + '</div>';
    }
    root.addEventListener('click', function (e) { var c = e.target.closest('[data-c]'); if (c) { ci = +c.getAttribute('data-c'); draw(); } });
    draw();
  }

  // ------------------------------------------------------------ glossary
  function glossary(D) {
    var root = $('tool'), cat = '';
    root.innerHTML = '<div class="mb__bar"><input class="search" id="gl-q" type="search" placeholder="Search a word: SLC, TONU, detention…" autocomplete="off" aria-label="Search the glossary">' +
      '<div class="gl-cats" id="gl-cats"><button type="button" data-g="" class="is-on">All</button>' + Object.keys(D.groups).map(function (g) { return '<button type="button" data-g="' + g + '">' + esc(D.groups[g]) + '</button>'; }).join('') + '</div></div>' +
      '<div class="gl-out">' + Object.keys(D.groups).map(function (g) {
        return '<section class="gl-sec" data-g="' + g + '"><h3 class="sub">' + esc(D.groups[g]) + '</h3><dl class="gloss">' + D.terms.filter(function (x) { return x[2] === g; }).map(function (x) {
          return '<div class="gl-row" data-t="' + esc(x[0] + ' ' + x[1]) + '"><dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd></div>';
        }).join('') + '</dl></section>';
      }).join('') + '</div><p class="empty" id="gl-none" style="display:none">No word matches that. Try another spelling.</p>';
    var rows = [].slice.call(root.querySelectorAll('.gl-row')), secs = [].slice.call(root.querySelectorAll('.gl-sec'));
    var run = searchable($('gl-q'), rows, function (r) { return r.getAttribute('data-t'); }, null, function () {
      var n = 0;
      secs.forEach(function (s) { var any = 0; s.querySelectorAll('.gl-row').forEach(function (r) { var on = !r.hidden && (!cat || s.getAttribute('data-g') === cat); r.style.display = on ? '' : 'none'; if (on) any++; }); s.hidden = !any; n += any; });
      $('gl-none').style.display = n ? 'none' : 'block';
    });
    $('gl-cats').addEventListener('click', function (e) {
      var b = e.target.closest('[data-g]'); if (!b) return; cat = b.getAttribute('data-g');
      [].forEach.call($('gl-cats').children, function (x) { x.classList.toggle('is-on', x === b); }); run();
    });
  }

  // ------------------------------------------------------------ who to tag (cards come rendered from the page)
  function who() {
    searchable($('q'), [].slice.call(document.querySelectorAll('#who [data-s]')), function (c) { return c.getAttribute('data-s'); }, $('none'));
  }

  // ------------------------------------------------------------ Ask the Course: find the passage, then (live site) ask the AI
  function ask(D) {
    var root = $('tool'), P = D.passages, live = !!(window.uglDb && window.UGL_CONFIG && window.UGL_CONFIG.url);
    // Index: tf per passage over cheap tokens, scored with a small BM25.
    var STOP = {}; 'a an the i is it to of and or on in for my me we our us this that from with be do does what how can should just did was are am has have about there their they them you your so if at by as not yes any get got want when which who where will would please'.split(' ').forEach(function (w) { STOP[w] = 1; });
    function stem(w) { return w.length > 4 ? w.replace(/(ings?|ies|ed|es|s)$/, '') : w; }
    function toks(s) { return words(s).filter(function (w) { return !STOP[w] && w.length > 1; }).map(stem); }
    var N = P.length, df = {}, TF = P.map(function (p) { var t = toks(p.t + ' ' + p.t + ' ' + p.x), f = {}; t.forEach(function (w) { f[w] = (f[w] || 0) + 1; }); Object.keys(f).forEach(function (w) { df[w] = (df[w] || 0) + 1; }); return { f: f, len: t.length }; });
    var avg = TF.reduce(function (a, x) { return a + x.len; }, 0) / N;
    function search(q) {
      var qs = toks(q).map(function (w) { return [w].concat(ALIAS[w] ? ALIAS[w].split(' ').map(stem) : []); });
      if (!qs.length) return [];
      return P.map(function (p, i) {
        var s = 0;
        qs.forEach(function (alts) {
          var best = 0;
          alts.forEach(function (w) { var f = TF[i].f[w]; if (!f) return; var idf = Math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5)); best = Math.max(best, idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * TF[i].len / avg))); });
          s += best;
        });
        return { p: p, s: s };
      }).filter(function (r) { return r.s > 0; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 6);
    }
    root.innerHTML = '<div class="ask"><div class="qa-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
      '<input id="ask-q" type="search" autocomplete="off" spellcheck="false" placeholder="Ask anything about the work, e.g. what do I send for a van pickup?" aria-label="Your question"></div>' +
      '<div class="ask__row"><button type="button" class="btn" id="ask-ai"' + (live ? '' : ' disabled title="Works on the live site"') + '>' + (live ? 'Ask the AI helper' : 'AI answers work on the live site') + '</button>' +
      '<span class="ask__hint">' + (live ? 'The helper answers only from the course and names the stop it comes from.' : 'Here in the preview the search below finds the right passage.') + '</span></div>' +
      '<div id="ask-ans"></div><div id="ask-out"><p class="qa-label">Try one of these</p><div class="qa-tiles">' + D.examples.map(function (q) { return '<button type="button" class="qa-tile" data-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') + '</div></div></div>';
    var input = $('ask-q'), out = $('ask-out'), ans = $('ask-ans');
    function hit(r, q) {
      var re = new RegExp('(' + toks(q).filter(function (w) { return w.length > 2; }).map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')', 'ig');
      var x = esc(r.p.x.length > 320 ? r.p.x.slice(0, 318) + '…' : r.p.x);
      return '<article class="ask__hit"><a class="ask__t" href="' + esc(r.p.u) + '">' + esc(r.p.t) + ' →</a><p>' + (re.source === '()' ? x : x.replace(re, '<mark>$1</mark>')) + '</p></article>';
    }
    var last = [];
    function render() {
      var q = input.value.trim();
      if (!q) { out.innerHTML = '<p class="qa-label">Try one of these</p><div class="qa-tiles">' + D.examples.map(function (x) { return '<button type="button" class="qa-tile" data-q="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') + '</div>'; last = []; return; }
      last = search(q);
      out.innerHTML = last.length ? '<p class="qa-label">From the course</p>' + last.map(function (r) { return hit(r, q); }).join('') : '<p class="qa-none">Nothing in the course matches that. Try other words, or ask your manager.</p>';
    }
    input.addEventListener('input', function () { ans.innerHTML = ''; render(); });
    root.addEventListener('click', function (e) { var b = e.target.closest('[data-q]'); if (b) { input.value = b.getAttribute('data-q'); render(); input.focus(); } });
    $('ask-ai').addEventListener('click', function () {
      var q = input.value.trim();
      if (!q) { input.focus(); return; }
      if (!last.length) { ans.innerHTML = '<div class="ask__ans ask__ans--no"><p>Nothing in the course matches that question, so the helper has nothing to answer from. Ask your manager.</p></div>'; return; }
      var btn = $('ask-ai'); btn.disabled = true; ans.innerHTML = '<div class="ask__ans"><p class="ask__wait">Thinking…</p></div>';
      window.uglDb.auth.getSession().then(function (r) {
        var tok = r.data && r.data.session && r.data.session.access_token;
        return fetch(window.uglFn ? window.uglFn('ask') : window.UGL_CONFIG.url + '/functions/v1/ask', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, apikey: window.UGL_CONFIG.key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: q, passages: last.map(function (x) { return x.p.id; }) }) }).then(function (res) { return res.json().then(function (j) { j._status = res.status; return j; }); });
      }).then(function (j) {
        btn.disabled = false;
        if (j.answer) {
          ans.innerHTML = '<div class="ask__ans"><div class="ask__who">AI helper · from the course only</div><p>' + esc(j.answer).replace(/\n/g, '<br>') + '</p>' +
            (j.sources && j.sources.length ? '<p class="ask__src">Read it in: ' + j.sources.map(function (s) { return '<a href="' + esc(s.u) + '">' + esc(s.t) + '</a>'; }).join(' · ') + '</p>' : '') +
            '<p class="ask__foot">Check the stop before you act. The helper can be wrong; the course text is the rule.' + (j.remaining != null ? ' ' + j.remaining + ' questions left today.' : '') + '</p></div>';
        } else {
          var m = { 'not-configured': 'The AI helper is not switched on yet. The passages below are the course\'s answer.', busy: 'The helper is busy right now. Try again in a minute; the passages below are the course\'s answer.',
            limit: 'You have used today\'s questions. The passages below are the course\'s answer.', signin: 'Please sign in again.' }[j.error] || 'The helper could not answer. The passages below are the course\'s answer.';
          ans.innerHTML = '<div class="ask__ans ask__ans--no"><p>' + esc(m) + '</p></div>';
        }
      }).catch(function () { btn.disabled = false; ans.innerHTML = '<div class="ask__ans ask__ans--no"><p>The helper could not be reached. The passages below are the course\'s answer.</p></div>'; });
    });
    var a = anchor(); if (a && a.indexOf('q=') === 0) { input.value = decodeURIComponent(a.slice(2)); }
    render();
  }

  return { builder: builder, efs: efs, fees: fees, customers: customers, glossary: glossary, who: who, ask: ask, searchable: searchable };
})();
