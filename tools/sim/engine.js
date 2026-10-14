// Work Simulator engine. Inlined into pages/simulator.html by tools/build_content.py.
// Expects window.UGL_SIM_CASES (array of cases, see sources/simulator-cases.json) and a #sim element.
// Results go to Supabase (sim_results) when the page runs inside the live site, else to this browser.
(function () {
  var CASES = window.UGL_SIM_CASES || [];
  var root = document.getElementById('sim');
  if (!root) return;

  // ------------------------------------------------------------ helpers
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function h(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function initials(n) { return n.split(/\s+/).map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase(); }
  function caseMax(c) { return c.steps.reduce(function (n, s) { return n + (s.task.type === 'reply' ? s.task.rubric.length : 1); }, 0); }
  function addMinutes(clock, m) {
    var p = clock.split(':'), t = (+p[0]) * 60 + (+p[1]) + m;
    return String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }
  function remote() { return window.uglDb && typeof window.uglDb.from === 'function' ? window.uglDb : null; }

  // ------------------------------------------------------------ results
  var LS_KEY = 'ugl-sim-best';
  var best = {};
  function loadLocal() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; } }
  function saveLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(best)); } catch (e) {} }
  function remember(id, score, max) {
    var b = best[id];
    if (!b || score / max > b.score / b.max) best[id] = { score: score, max: max };
  }
  function loadBest() {
    best = loadLocal();
    var db = remote();
    if (!db) return Promise.resolve();
    return db.from('sim_results').select('case_id,score,max_score').then(function (r) {
      (r.data || []).forEach(function (x) { remember(x.case_id, x.score, x.max_score); });
    }, function () {});
  }
  function saveResult(c, score, max, answers) {
    remember(c.id, score, max); saveLocal();
    var db = remote();
    if (db) db.from('sim_results').insert({ case_id: c.id, score: score, max_score: max, answers: answers }).then(function () {}, function () {});
  }

  // ------------------------------------------------------------ case list
  function showList() {
    root.innerHTML = '';
    var grid = h('div', 'sim-cases');
    CASES.forEach(function (c) {
      var b = best[c.id], max = caseMax(c);
      var card = h('button', 'sim-case');
      card.type = 'button';
      card.innerHTML =
        '<div class="sim-case__top"><span class="sim-tag">' + esc(c.tag) + '</span><span class="sim-level">' + esc(c.level) + '</span></div>' +
        '<div class="sim-case__title">' + esc(c.title) + '</div>' +
        '<div class="sim-case__sum">' + esc(c.summary) + '</div>' +
        '<div class="sim-case__foot"><span>' + c.steps.length + ' steps · ' + max + ' points</span>' +
        (b ? '<span class="sim-best ' + (b.score / b.max >= 0.8 ? 'is-good' : '') + '">Best ' + b.score + ' / ' + b.max + '</span>' : '<span class="sim-best">Not tried</span>') +
        '</div>';
      card.addEventListener('click', function () { startCase(c); });
      grid.appendChild(card);
    });
    root.appendChild(grid);
  }

  // ------------------------------------------------------------ one case
  var S; // state of the running case

  function startCase(c) {
    S = { c: c, i: 0, score: 0, max: caseMax(c), earned: 0, clock: c.clock || '09:00', threads: {}, active: null, files: {}, answers: [], log: [] };
    Object.keys(c.contacts).forEach(function (k) { S.threads[k] = { msgs: [], unread: 0 }; });
    root.innerHTML = '';
    var ws = h('div', 'sim-ws');
    ws.innerHTML =
      '<aside class="sim-apps"><div class="sim-apps__top"><button type="button" class="sim-back">← All cases</button></div>' +
      '<div class="sim-app" data-app="email"><div class="sim-app__label"><span class="sim-dot sim-dot--mail"></span>GMAIL</div><div class="sim-threads"></div></div>' +
      '<div class="sim-app" data-app="telegram"><div class="sim-app__label"><span class="sim-dot sim-dot--tg"></span>TELEGRAM</div><div class="sim-threads"></div></div></aside>' +
      '<section class="sim-main"><header class="sim-head"></header><div class="sim-msgs" aria-live="polite"></div><div class="sim-task"></div></section>' +
      '<aside class="sim-side"><div class="sim-side__block"><div class="sim-k">CASE</div><div class="sim-side__title"></div></div>' +
      '<div class="sim-side__block"><div class="sim-k">LOAD BRIEF</div><dl class="sim-brief"></dl></div>' +
      '<div class="sim-side__block"><div class="sim-k">PROGRESS</div><ol class="sim-steps"></ol><div class="sim-score"></div></div></aside>';
    root.appendChild(ws);
    window.scrollTo(0, Math.max(0, root.getBoundingClientRect().top + window.scrollY - 90));
    ws.querySelector('.sim-back').addEventListener('click', function () { loadBest().then(showList); });
    ws.querySelector('.sim-side__title').textContent = c.title;
    ws.querySelector('.sim-brief').innerHTML = c.brief.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');
    S.ws = ws;
    // Threads exist from the start, as in a real inbox; they fill as the case runs.
    renderThreads();
    var first = c.steps[0].msg ? c.steps[0].msg.from : Object.keys(c.contacts)[0];
    S.active = first;
    enterStep();
  }

  function contact(k) { return S.c.contacts[k]; }

  function renderThreads() {
    ['email', 'telegram'].forEach(function (app) {
      var box = S.ws.querySelector('[data-app="' + app + '"] .sim-threads');
      var keys = Object.keys(S.c.contacts).filter(function (k) { return contact(k).channel === app; });
      S.ws.querySelector('[data-app="' + app + '"]').hidden = !keys.length;
      box.innerHTML = '';
      keys.forEach(function (k) {
        var t = S.threads[k], ct = contact(k), last = t.msgs[t.msgs.length - 1];
        var row = h('button', 'sim-thread' + (S.active === k ? ' is-on' : '') + (t.unread ? ' is-unread' : ''));
        row.type = 'button';
        row.innerHTML = '<span class="sim-av sim-av--' + app + '">' + esc(initials(ct.name)) + '</span>' +
          '<span class="sim-thread__body"><span class="sim-thread__name">' + esc(ct.name) + '</span>' +
          '<span class="sim-thread__last">' + esc(last ? (last.dir === 'out' ? 'You: ' : '') + (last.subject || last.text).split('\n')[0] : ct.role) + '</span></span>' +
          (t.unread ? '<span class="sim-badge">' + t.unread + '</span>' : '');
        row.addEventListener('click', function () { S.active = k; t.unread = 0; renderThreads(); renderThread(); });
        box.appendChild(row);
      });
    });
  }

  function renderThread() {
    var k = S.active, ct = contact(k), t = S.threads[k], app = ct.channel;
    S.ws.querySelector('.sim-head').innerHTML = '<span class="sim-av sim-av--' + app + '">' + esc(initials(ct.name)) + '</span><div><b>' + esc(ct.name) + '</b><small>' +
      esc(ct.role) + (ct.address ? ' · ' + esc(ct.address) : '') + '</small></div><span class="sim-app-chip">' + (app === 'email' ? 'GMAIL' : 'TELEGRAM') + '</span>';
    var box = S.ws.querySelector('.sim-msgs');
    box.className = 'sim-msgs sim-msgs--' + app;
    box.innerHTML = t.msgs.length ? '' : '<p class="sim-empty">No messages yet.</p>';
    t.msgs.forEach(function (m) {
      var att = (m.attach || []).map(function (a) { return '<span class="sim-file">📎 ' + esc(a.name) + '<small>' + esc(a.label || '') + '</small></span>'; }).join('');
      if (app === 'email') {
        box.appendChild(h('article', 'sim-mail' + (m.dir === 'out' ? ' is-out' : ''),
          '<div class="sim-mail__meta"><b>' + esc(m.dir === 'out' ? 'You' : ct.name) + '</b><span>' + esc(m.time) + '</span></div>' +
          '<div class="sim-mail__to">' + (m.dir === 'out' ? 'to ' + esc(ct.name) + ' &lt;' + esc(ct.address || '') + '&gt;' : 'to you') + '</div>' +
          (m.subject ? '<div class="sim-mail__subj">' + esc(m.subject) + '</div>' : '') +
          '<div class="sim-mail__body">' + esc(m.text) + '</div>' + (att ? '<div class="sim-files">' + att + '</div>' : '')));
      } else {
        box.appendChild(h('div', 'sim-bubble' + (m.dir === 'out' ? ' is-out' : ''),
          (att ? '<div class="sim-files">' + att + '</div>' : '') + '<div>' + esc(m.text) + '</div><time>' + esc(m.time) + '</time>'));
      }
    });
    box.scrollTop = box.scrollHeight;
  }

  function renderSide() {
    var ol = S.ws.querySelector('.sim-steps');
    ol.innerHTML = S.c.steps.map(function (st, i) {
      var r = S.log[i], cls = i === S.i && !S.done ? 'is-now' : r ? (r.got === r.of ? 'is-ok' : 'is-part') : '';
      return '<li class="' + cls + '"><span>' + esc(st.task.q) + '</span>' + (r ? '<b>' + r.got + '/' + r.of + '</b>' : '') + '</li>';
    }).join('');
    S.ws.querySelector('.sim-score').innerHTML = '<span>SCORE</span><b>' + S.earned + '</b><span>/ ' + S.max + '</span>';
  }

  function deliver(msg) {
    S.clock = addMinutes(S.clock, 3 + Math.floor(Math.random() * 6));
    var m = { dir: 'in', text: msg.text, subject: msg.subject, attach: msg.attach, time: S.clock };
    S.threads[msg.from].msgs.push(m);
    (msg.attach || []).forEach(function (a) { S.files[a.id] = a; });
    if (S.active !== msg.from) S.threads[msg.from].unread++;
    S.active = msg.from; S.threads[msg.from].unread = 0;
  }

  function enterStep() {
    var st = S.c.steps[S.i];
    if (st.msg) deliver(st.msg);
    if (st.task.type === 'reply') S.active = st.task.to;
    renderThreads(); renderThread(); renderSide(); renderTask();
  }

  function renderTask() {
    var st = S.c.steps[S.i], t = st.task, box = S.ws.querySelector('.sim-task');
    box.innerHTML = '<div class="sim-task__label">YOUR MOVE · STEP ' + (S.i + 1) + ' OF ' + S.c.steps.length + '</div><div class="sim-task__q">' + esc(t.q) + '</div>';
    if (t.type === 'choice') {
      var list = h('div', 'sim-opts');
      t.options.forEach(function (o, j) {
        var lab = h('label', 'sim-opt');
        lab.innerHTML = '<input type="' + (t.multi ? 'checkbox' : 'radio') + '" name="sim-opt" value="' + j + '"><span>' + esc(o.t) + '</span>';
        list.appendChild(lab);
      });
      box.appendChild(list);
      var go = h('button', 'sim-btn', t.multi ? 'Submit answer' : 'Choose');
      go.type = 'button'; go.disabled = true;
      list.addEventListener('change', function () { go.disabled = !list.querySelector('input:checked'); });
      go.addEventListener('click', function () { gradeChoice(t, list); });
      box.appendChild(go);
    } else {
      var ct = contact(t.to), isMail = ct.channel === 'email', files = Object.keys(S.files);
      var form = h('form', 'sim-compose');
      form.innerHTML =
        '<div class="sim-compose__to">' + (isMail ? 'To: <b>' + esc(ct.name) + '</b> &lt;' + esc(ct.address || '') + '&gt;' : 'Telegram to <b>' + esc(ct.name) + '</b>') + '</div>' +
        (isMail ? '<input class="sim-in" id="sim-subj" placeholder="Subject" autocomplete="off">' : '') +
        '<textarea class="sim-in" id="sim-body" rows="' + (isMail ? 7 : 4) + '" placeholder="' + (isMail ? 'Write your email…' : 'Write a message…') + '"></textarea>' +
        (files.length ? '<div class="sim-attach"><span>ATTACH</span>' + files.map(function (id) {
          return '<label class="sim-chip"><input type="checkbox" value="' + esc(id) + '"><span>📎 ' + esc(S.files[id].name) + '</span></label>';
        }).join('') + '</div>' : '') +
        '<div class="sim-compose__row"><button class="sim-btn" type="submit">Send</button><span class="sim-hint">Re-read any message from the list on the left. Graded after you send.</span></div>';
      form.addEventListener('submit', function (e) { e.preventDefault(); gradeReply(t, form); });
      box.appendChild(form);
    }
    var first = box.querySelector('textarea, input');
    if (first && window.matchMedia('(min-width: 981px)').matches) first.focus({ preventScroll: true });
  }

  function feedback(html, ok) {
    var box = S.ws.querySelector('.sim-task');
    box.innerHTML = '<div class="sim-fb ' + (ok ? 'is-ok' : 'is-bad') + '">' + html + '</div>';
    var last = S.i === S.c.steps.length - 1;
    var nx = h('button', 'sim-btn', last ? 'See results' : 'Next →');
    nx.type = 'button';
    nx.addEventListener('click', function () { if (last) finish(); else { S.i++; enterStep(); } });
    box.appendChild(nx);
    nx.focus({ preventScroll: true });
    renderSide();
  }

  function gradeChoice(t, list) {
    var picked = [].map.call(list.querySelectorAll('input:checked'), function (x) { return +x.value; });
    var right = t.options.map(function (o, j) { return o.ok ? j : -1; }).filter(function (j) { return j >= 0; });
    var ok = picked.length === right.length && picked.every(function (j) { return right.indexOf(j) >= 0; });
    S.earned += ok ? 1 : 0;
    S.log[S.i] = { got: ok ? 1 : 0, of: 1 };
    S.answers.push({ step: S.i + 1, type: 'choice', picked: picked.map(function (j) { return t.options[j].t; }), correct: ok });
    var rows = t.options.map(function (o, j) {
      var was = picked.indexOf(j) >= 0, cls = o.ok ? 'is-right' : was ? 'is-wrong' : '';
      if (!o.ok && !was) return '';
      return '<li class="' + cls + '"><b>' + (o.ok ? '✓' : '✗') + '</b><span>' + esc(o.t) + (o.why ? '<small>' + esc(o.why) + '</small>' : '') + '</span></li>';
    }).join('');
    feedback('<div class="sim-fb__title">' + (ok ? 'Correct' : 'Not quite') + '</div><ul class="sim-fb__list">' + rows + '</ul>', ok);
  }

  function gradeReply(t, form) {
    var subj = form.querySelector('#sim-subj'), body = form.querySelector('#sim-body').value.trim();
    if (!body) { form.querySelector('#sim-body').focus(); return; }
    var attached = [].map.call(form.querySelectorAll('.sim-attach input:checked'), function (x) { return x.value; });
    var text = ((subj ? subj.value + '\n' : '') + body).toLowerCase();
    var hits = t.rubric.map(function (p) {
      if (p.attach) return attached.indexOf(p.attach) >= 0;
      return p.re.every(function (r) { return new RegExp(r, 'i').test(text); });
    });
    var got = hits.filter(Boolean).length;
    S.earned += got;
    S.log[S.i] = { got: got, of: t.rubric.length };
    S.answers.push({ step: S.i + 1, type: 'reply', to: t.to, subject: subj ? subj.value : undefined, text: body, attached: attached, points: got + '/' + t.rubric.length });
    S.clock = addMinutes(S.clock, 2);
    S.threads[t.to].msgs.push({ dir: 'out', text: body, subject: subj ? subj.value : '', attach: attached.map(function (id) { return S.files[id]; }), time: S.clock });
    S.active = t.to; renderThreads(); renderThread();
    var rows = t.rubric.map(function (p, j) {
      return '<li class="' + (hits[j] ? 'is-right' : 'is-wrong') + '"><b>' + (hits[j] ? '✓' : '✗') + '</b><span>' + esc(p.t) + '</span></li>';
    }).join('');
    var model = (t.model.subject ? 'Subject: ' + t.model.subject + '\n\n' : '') + t.model.body;
    feedback('<div class="sim-fb__title">' + got + ' of ' + t.rubric.length + ' checklist points</div><ul class="sim-fb__list">' + rows + '</ul>' +
      '<details class="sim-model"' + (got < t.rubric.length ? ' open' : '') + '><summary>Model answer</summary><pre>' + esc(model) + '</pre></details>' +
      '<p class="sim-fb__note">The checklist looks for key facts in your message. Compare with the model answer for tone and wording.</p>', got === t.rubric.length);
  }

  function finish() {
    S.done = true;
    var pct = Math.round(S.earned / S.max * 100);
    saveResult(S.c, S.earned, S.max, S.answers);
    renderSide();
    var verdict = pct >= 80 ? ['Ready', 'You handled this case the way the policy expects.'] : pct >= 50 ? ['Review', 'Some steps were missed. Read the feedback and try the case again.'] : ['Try again', 'Go back over the policy for this load type, then retry.'];
    var box = S.ws.querySelector('.sim-task');
    box.innerHTML = '<div class="sim-done"><div class="sim-done__pct ' + (pct >= 80 ? 'is-ok' : pct >= 50 ? 'is-mid' : 'is-bad') + '">' + pct + '%</div>' +
      '<div><div class="sim-fb__title">' + verdict[0] + ' · ' + S.earned + ' / ' + S.max + ' points</div><p>' + verdict[1] + '</p></div></div>';
    var row = h('div', 'sim-compose__row');
    var again = h('button', 'sim-btn', 'Retry case'); again.type = 'button';
    again.addEventListener('click', function () { startCase(S.c); });
    var back = h('button', 'sim-btn sim-btn--ghost', 'All cases'); back.type = 'button';
    back.addEventListener('click', function () { loadBest().then(showList); });
    row.appendChild(again); row.appendChild(back); box.appendChild(row);
  }

  loadBest().then(showList);
})();
