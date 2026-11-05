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
      label.textContent = (mile ? 'STOP ' + mile.textContent + ' · ' : '') + (cur ? cur.toUpperCase() + ' · ' : '') + pct + '%';
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
  var cards = [].slice.call(page.querySelectorAll('.drill')), first = {}, solved = {}, posted = false;
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
      function checkCloze() {
        var wrong = 0;
        inputs.forEach(function (inp, k) {
          var ok = d.blanks[k].some(function (a) { return norm(a) === norm(inp.value); });
          inp.classList.toggle('is-ok', ok); inp.classList.toggle('is-bad', !ok); if (!ok) wrong++;
        });
        if (!wrong) { lock(card); fb(card, true, '<b>Right.</b> ' + (d.why || 'That is the message, with the right numbers.')); }
        else fb(card, false, '<b>' + wrong + ' blank' + (wrong > 1 ? 's are' : ' is') + ' not right.</b> Read the situation again and fix the red ones.' +
          (++tries >= 2 ? ' <i>Expected: ' + d.blanks.map(function (b) { return esc(b[0]); }).join(' · ') + '</i>' : ''));
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
          '<ul class="drill__rules">' + rows.join('') + '</ul><div class="drill__model"><small>THE TEAM\'S VERSION</small><pre>' + esc(d.model) + '</pre></div>');
        if (ok) lock(card);
        result(i, ok);
      });
    }
  }
  function reset() {
    first = {}; solved = {}; posted = false;
    cards.forEach(function (c, i) { c.innerHTML = orig[i]; bind(c, i); });
    score();
    page.scrollIntoView({ behavior: 'smooth' });
  }
  cards.forEach(bind);
  score();
};
