// Road stop pages: photo zoom and the "Do it" drills. Each drill card carries its answers in a
// <script type="application/json">; first-try results are scored, and the best score stays in this browser.
(function () {
  var page = document.getElementById('drills');
  if (!page) return;
  var KEY = 'ugl-drills:' + (window.UGL_DRILL_KEY || '');
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function md(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }

  // ---- keep the current stop in view in the stop strip (it scrolls sideways on phones)
  var on = document.querySelector('.roadstrip .is-on');
  if (on) on.parentNode.scrollLeft = on.offsetLeft - on.parentNode.offsetLeft - 16;

  // ---- photo zoom
  var box = document.createElement('div');
  box.className = 'zoom'; box.hidden = true; box.innerHTML = '<img alt=""><p></p>';
  page.parentNode.appendChild(box);
  box.addEventListener('click', function () { box.hidden = true; });
  if (!window.uglZoomKeys) {
    window.uglZoomKeys = true;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') [].forEach.call(document.querySelectorAll('.zoom'), function (z) { z.hidden = true; }); });
  }
  [].forEach.call(document.querySelectorAll('img[data-zoom]'), function (img) {
    img.addEventListener('click', function () {
      box.querySelector('img').src = img.src;
      var cap = img.closest('figure') && img.closest('figure').querySelector('figcaption');
      box.querySelector('p').textContent = cap ? cap.textContent : '';
      box.hidden = false;
    });
  });

  // ---- drills
  var cards = [].slice.call(page.querySelectorAll('.drill')), first = {}, solved = {};
  var orig = cards.map(function (c) { return c.innerHTML; });
  var scoreEl = document.getElementById('drill-score');
  function best() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function score() {
    var n = cards.length, right = 0, done = 0;
    Object.keys(first).forEach(function (i) { if (first[i]) right++; });
    Object.keys(solved).forEach(function () { done++; });
    var b = best();
    if (done === n) {
      if (!b || right > b.right) { b = { right: right, n: n, at: Date.now() }; try { localStorage.setItem(KEY, JSON.stringify(b)); } catch (e) {} }
      scoreEl.innerHTML = '<b>All done: ' + right + ' of ' + n + ' right on the first try.</b>' + (right === n ? ' Perfect.' : ' Read the ones you missed once more.') +
        ' <button type="button" class="btn btn--ghost" id="drill-again">Try them again</button>';
      document.getElementById('drill-again').onclick = reset;
    } else {
      scoreEl.innerHTML = done ? done + ' of ' + n + ' done · ' + right + ' right on the first try' + (b ? ' · best so far ' + b.right + ' of ' + b.n : '') :
        (b ? 'Best so far: ' + b.right + ' of ' + b.n + ' right on the first try.' : '');
    }
  }
  function result(i, ok) { if (!(i in first)) first[i] = ok; if (ok) solved[i] = true; score(); }
  function fb(card, ok, html) { var f = card.querySelector('.drill__fb'); f.className = 'drill__fb ' + (ok ? 'is-ok' : 'is-bad'); f.innerHTML = html; }

  function bind(card, i) {
    var d = JSON.parse(card.querySelector('script').textContent);
    if (d.type === 'choice') {
      [].forEach.call(card.querySelectorAll('.opt'), function (b) {
        b.addEventListener('click', function () {
          var o = d.opts[+b.getAttribute('data-o')];
          if (o[0]) {
            b.classList.add('is-ok');
            [].forEach.call(card.querySelectorAll('.opt'), function (x) { x.disabled = true; });
            fb(card, true, '<b>Right.</b> ' + md(o[1]));
          } else {
            b.classList.add('is-bad'); b.disabled = true;
            fb(card, false, '<b>Not quite.</b> ' + md(o[1]) + ' Try again.');
          }
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
        if (!wrong) {
          [].forEach.call(card.querySelectorAll('button'), function (x) { x.disabled = true; });
          fb(card, true, '<b>Right order.</b>');
        } else fb(card, false, '<b>' + wrong + ' in the wrong place.</b> Move the red ones and check again.');
        result(i, !wrong);
      });
    } else if (d.type === 'number') {
      var inp = card.querySelector('input');
      function check() {
        var v = parseFloat(String(inp.value).replace(/[$,\s]/g, ''));
        if (isNaN(v)) { fb(card, false, 'Type a number first.'); return; }
        var ok = Math.abs(v - d.answer) <= (d.tol || 0);
        if (ok) { inp.disabled = true; card.querySelector('.drill__check').disabled = true; }
        fb(card, ok, ok ? '<b>Right.</b> ' + md(d.why) : '<b>Not quite.</b> Check your math and try again.');
        result(i, ok);
      }
      card.querySelector('.drill__check').addEventListener('click', check);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') check(); });
    } else {
      var ta = card.querySelector('textarea');
      card.querySelector('.drill__check').addEventListener('click', function () {
        var t = ta.value;
        if (t.trim().length < 8) { fb(card, false, 'Write the message first.'); return; }
        var rows = d.need.map(function (r) { var ok = new RegExp(r[0], 'i').test(t); return '<li class="' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ ' : '✗ ') + esc(r[1]) + '</li>'; });
        var bad = d.never.filter(function (r) { return new RegExp(r[0], 'i').test(t); });
        bad.forEach(function (r) { rows.push('<li class="bad">✗ ' + esc(r[1]) + '</li>'); });
        var ok = !/class="bad"/.test(rows.join(''));
        fb(card, ok, (ok ? '<b>Good message.</b> Everything the team checks for is there.' : '<b>Almost.</b> Fix the red lines and check again.') +
          '<ul class="drill__rules">' + rows.join('') + '</ul><div class="drill__model"><small>THE TEAM\'S VERSION</small><pre>' + esc(d.model) + '</pre></div>');
        result(i, ok);
      });
    }
  }
  function reset() {
    first = {}; solved = {};
    cards.forEach(function (c, i) { c.innerHTML = orig[i]; bind(c, i); });
    score();
    page.scrollIntoView({ behavior: 'smooth' });
  }
  cards.forEach(bind);
  score();
})();
