// Course portal: Home / Course / Tools / Simulator tabs, driven by ugl-catalog.js.
// Each catalog item appears in exactly one tab; Home only summarises progress.
// Data access goes through `env`, so the same portal runs on the live site (Supabase)
// and in the offline preview (window.UGL_ENV is set there before this script loads).
(function () {
  var cat = window.UGL_CATALOG;
  var env = window.UGL_ENV || realEnv();
  var simOn = !cat.simulator.hidden;
  var ALL = cat.items.filter(function (i) { return !i.hidden; });
  var ITEMS, TABS, lessons;
  var done = {}, simDone = {}, cards = [];
  var $ = function (id) { return document.getElementById(id); };
  var portal = $('portal');

  // What this person may open: null = everything; { mode: 'tools' } or { mode: 'custom', items: [...] }
  // set by an admin (user_access). The content gateway enforces it; here it only decides what to show.
  function applyAccess(access) {
    if (access && access.mode !== 'tools' && access.mode !== 'custom') access = null;
    ITEMS = ALL.filter(function (it) {
      if (!access) return true;
      if (access.mode === 'tools') return it.section === 'tools';
      return (access.items || []).indexOf(it.id) >= 0;
    });
    lessons = ITEMS.filter(function (i) { return i.section === 'course' && !i.soon; });
    var has = function (sec) { return ITEMS.some(function (i) { return i.section === sec; }); };
    TABS = (lessons.length ? [{ id: 'home', label: 'Home' }, { id: 'course', label: 'Course' }] : [])
      .concat(has('tools') ? [{ id: 'tools', label: 'Tools' }] : [])
      .concat(simOn && has('simulator') ? [{ id: 'simulator', label: 'Simulator' }] : []);
    if (!TABS.length) TABS = [{ id: 'none', label: 'Home' }];
  }

  // Every item opens inside the site through module.html, which fetches it via the content gateway.
  function realEnv() {
    var db = window.uglDb;
    return {
      // Progress is what the trainee marks as read (lesson_done), never what they merely opened.
      loadDone: function () {
        return db.from('lesson_done').select('module').limit(1000).then(function (r) {
          return (r.data || []).map(function (x) { return x.module; });
        }, function () { return []; });
      },
      setDone: function (id, on) {
        var q = on ? db.from('lesson_done').insert({ module: id }) : db.from('lesson_done').delete().eq('module', id);
        return q.then(function (r) { if (r.error && r.error.code !== '23505') throw r.error; });
      },
      loadSimDone: function () {
        return db.from('sim_results').select('case_id').limit(1000).then(function (r) {
          return (r.data || []).map(function (x) { return x.case_id; });
        }, function () { return []; });
      },
      href: function (it) { return 'module.html?m=' + encodeURIComponent(it.id); },
      // Ask for this person's row by id: admins may read everyone's rows, so an unfiltered read
      // would hand an admin someone else's limit.
      loadAccess: function (user) {
        return db.from('user_access').select('mode,items').eq('user_id', user.id).maybeSingle()
          .then(function (r) { return r.data || null; }, function () { return null; });
      },
      isAdmin: function () {
        return db.rpc('is_admin').then(function (r) { return r.data === true; }, function () { return false; });
      }
    };
  }

  // ------------------------------------------------------------- building blocks
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function txt(e, sel, t) { e.querySelector(sel).textContent = t; return e; }
  function pct(n, of) { return of ? Math.round(n / of * 100) : 0; }

  // A card is a link to the lesson (no icon tile: the tag line says what it is); course lessons also
  // get a "Mark as read" button beside the link (a sibling, so pressing it never opens the lesson).
  function card(it) {
    var graded = it.section === 'course' && !it.soon;
    var wrap = el('div', 'lcard-wrap' + (graded ? ' has-mark' : ''));
    var a = el(it.soon ? 'div' : 'a', 'lcard' + (it.soon ? ' is-soon' : ''),
      '<span class="lcard__body"><span class="lcard__top"><span class="lcard__tag"></span><span class="lcard__state"></span></span>' +
      '<span class="lcard__title"></span><span class="lcard__desc"></span></span>' + (it.soon ? '' : '<span class="lcard__arrow" aria-hidden="true">→</span>'));
    txt(a, '.lcard__tag', it.tag); txt(a, '.lcard__title', it.title); txt(a, '.lcard__desc', it.desc);
    if (it.kind === 'stop') {
      // The stop page keeps the trainee's best drill score in this browser; show it on the road.
      try {
        var best = JSON.parse(localStorage.getItem('ugl-drills:' + it.id) || 'null');
        if (best && best.n) { var m = el('span', 'lcard__meta'); m.textContent = 'Drills: best ' + best.right + ' of ' + best.n; a.querySelector('.lcard__body').appendChild(m); }
      } catch (e) {}
    }
    a._item = it;
    a._hay = (it.title + ' ' + it.desc + ' ' + it.tag).toLowerCase();
    wrap.appendChild(a);
    if (it.soon) {
      txt(a, '.lcard__state', 'Coming soon');
    } else {
      a.href = env.href(it);
      cards.push(a);
    }
    if (graded && env.setDone) {
      var b = el('button', 'lcard__mark', '<span class="m-off">Mark as read</span><span class="m-on">✓ Read</span><span class="m-undo">Mark as unread</span>');
      b.type = 'button';
      b.addEventListener('click', function () { toggleDone(it, b); });
      a._mark = b;
      wrap.appendChild(b);
    }
    return wrap;
  }

  function toggleDone(it, b) {
    var on = !done[it.id];
    if (on) done[it.id] = true; else delete done[it.id];
    b.disabled = true;
    refresh();
    env.setDone(it.id, on).then(function () { b.disabled = false; }, function () {
      if (on) delete done[it.id]; else done[it.id] = true;
      b.disabled = false;
      refresh();
      alert('Could not save that. Check your connection and try again.');
    });
  }

  function grid(items) { var g = el('div', 'cards'); items.forEach(function (it) { g.appendChild(card(it)); }); return g; }
  // The road: stops in order along a line, each one a normal lesson card.
  function road(items) {
    var r = el('ol', 'road');
    items.forEach(function (it) {
      var li = el('li', 'road__stop', '<span class="road__n" aria-hidden="true"></span>');
      txt(li, '.road__n', /^road-po$/.test(it.id) ? 'PO' : it.id.replace(/^road-/, ''));
      li.appendChild(card(it)); r.appendChild(li);
    });
    return r;
  }

  // A hero is a title and one line: no eyebrow above it.
  function hero(title, lead) {
    var h = el('section', 'hero', '<h1></h1><p></p>');
    txt(h, 'h1', title); txt(h, 'p', lead);
    return h;
  }

  function meter(label) {
    return el('div', 'meter', '<div class="meter__top"><span>' + label + '</span><b></b></div><div class="progress"><i></i></div>');
  }
  function setMeter(m, n, of) { m.querySelector('b').textContent = n + ' / ' + of; m.querySelector('i').style.width = pct(n, of) + '%'; }

  // "Next up": the first stop of the road not yet marked as read, or the library once the road is
  // done. The Home and Course tabs both open with it; refresh() fills it in.
  function nextUp() {
    var s = el('section', 'nextup', '<span class="nextup__k">Next up</span><b class="nextup__title"></b><span class="nextup__line"></span><a class="nextup__go btn-primary" href="#"></a>');
    s.setAttribute('data-nextup', ''); s.hidden = true;
    return s;
  }
  function roadStops() {
    var road = {};
    cat.tracks.forEach(function (t) { if (t.road) road[t.id] = true; });
    return lessons.filter(function (i) { return road[i.track]; });
  }

  // ------------------------------------------------------------- views
  function viewHome() {
    var v = el('div', 'view');
    v.appendChild(nextUp());
    v.appendChild(el('section', 'hero', '<h1 id="hello">Welcome back.</h1>' +
      '<p>' + (simOn ? 'Your progress across the course and the simulator. ' : 'Your progress through the course. ') + (TABS.some(function (t) { return t.id === 'tools'; }) ? 'Tools are always one tab away.' : '') + '</p>'));
    var ov = el('div', 'overview' + (simOn ? '' : ' overview--two'));

    var c = el('section', 'ov ov--course', '<div class="ov__k">Course</div><div class="ov__big"><b data-course-n>0</b><span>of ' + lessons.length + ' lessons read</span></div>' +
      '<div class="progress progress--lg"><i data-course-bar></i></div><div class="ov__tracks"></div>' +
      '<div class="ov__actions"><a class="btn-primary" id="continue" href="#"><span id="continue-label">Start with</span> <b id="continue-title"></b></a><a class="btn-link" href="#course">All lessons</a></div>');
    var tr = c.querySelector('.ov__tracks');
    cat.tracks.forEach(function (t) {
      if (!lessons.some(function (i) { return i.track === t.id; })) return;
      var m = meter(''); m.setAttribute('data-track-meter', t.id); m.querySelector('span').textContent = t.title; tr.appendChild(m);
    });
    ov.appendChild(c);

    if (simOn) {
    var s = el('section', 'ov', '<div class="ov__k">Simulator</div><div class="ov__big"><b data-sim-n>0</b><span>of ' + cat.simulator.cases + ' cases completed</span></div>' +
      '<div class="progress progress--lg"><i data-sim-bar></i></div><p class="ov__p">Practise real broker emails and driver chats, scored against company policy.</p>' +
      '<div class="ov__actions"><a class="btn-secondary" href="#simulator">Go to simulator</a></div>');
    ov.appendChild(s);
    }

    var tools = ITEMS.filter(function (i) { return i.section === 'tools'; });
    if (!tools.length) { ov.classList.add('overview--one'); v.appendChild(ov); return v; }
    var groups = cat.toolGroups.filter(function (g) { return tools.some(function (i) { return i.group === g.id; }); });
    var t = el('section', 'ov', '<div class="ov__k">Tools</div><div class="ov__big"><b>' + tools.length + '</b><span>' + (tools.length === 1 ? 'tool' : 'tools') + ' for the shift</span></div>' +
      '<p class="ov__p">' + groups.map(function (g) { return g.title; }).join(' · ') + '. Calculators, state tables and checklists you can open mid-call.</p>' +
      '<div class="ov__actions"><a class="btn-secondary" href="#tools">Go to tools</a></div>');
    ov.appendChild(t);
    v.appendChild(ov);
    return v;
  }

  function viewCourse() {
    var v = el('div', 'view');
    v.appendChild(nextUp());
    v.appendChild(hero('The course',
      'Start with the road: one load, stop by stop, from the rate confirmation to the POD. When you finish a lesson, mark it as read; that is what counts toward your progress.'));
    var find = el('input', 'search'); find.type = 'search'; find.id = 'find'; find.placeholder = 'Search lessons and policies…';
    find.setAttribute('aria-label', 'Search the course'); find.autocomplete = 'off';
    v.appendChild(find);
    var tracks = el('div', ''); tracks.id = 'tracks';
    // The road comes first; every other track is the Library, under one heading (when both exist).
    var shown = cat.tracks.map(function (t) { return { t: t, items: ITEMS.filter(function (i) { return i.section === 'course' && i.track === t.id; }) }; })
      .filter(function (x) { return x.items.length; });
    var hasRoad = shown.some(function (x) { return x.t.road; });
    shown.forEach(function (x) {
      var t = x.t;
      if (!t.road && hasRoad && !tracks.querySelector('.lib-head')) {
        var lh = el('div', 'lib-head', '<h2>Library</h2><p>The decks, policies and compliance files the road links to. Open them any time; they count toward your progress too.</p>');
        lh.id = 'library';
        tracks.appendChild(lh);
      }
      var sec = el('section', 'track' + (t.road ? ' track--road' : ''), '<div class="track__head"><div class="track__text"><h2 class="track__title"></h2><p class="track__desc"></p></div>' +
        '<div class="track__prog"><span></span><div class="progress"><i></i></div></div></div>');
      sec.id = 'track-' + t.id; sec._items = x.items.filter(function (i) { return !i.soon; });
      txt(sec, '.track__title', t.title); txt(sec, '.track__desc', t.desc);
      sec.appendChild(t.road ? road(x.items) : grid(x.items));
      tracks.appendChild(sec);
    });
    v.appendChild(tracks);
    var none = el('p', 'empty', 'No lessons match that search.'); none.id = 'find-none';
    v.appendChild(none);
    find.addEventListener('input', function () {
      var q = find.value.trim().toLowerCase(), shown = 0;
      tracks.querySelectorAll('.track').forEach(function (sec) {
        var any = 0;
        sec.querySelectorAll('.lcard').forEach(function (c) {
          var ok = !q || c._hay.indexOf(q) !== -1;
          c.closest('.road__stop, .lcard-wrap').hidden = !ok;
          if (ok) any++;
        });
        sec.hidden = !any; shown += any;
      });
      var lh = tracks.querySelector('.lib-head');
      if (lh) lh.hidden = ![].some.call(tracks.querySelectorAll('.track:not(.track--road)'), function (x) { return !x.hidden; });
      none.style.display = shown ? 'none' : 'block';
    });
    return v;
  }

  function viewTools() {
    var v = el('div', 'view');
    v.appendChild(hero('Tools for the shift', 'Quick answers while you are on a load. These are references, so they do not count toward course progress.'));
    cat.toolGroups.forEach(function (g) {
      var items = ITEMS.filter(function (i) { return i.section === 'tools' && i.group === g.id; });
      if (!items.length) return;
      var b = el('section', 'group', '<div class="group__head"><h2></h2><p></p></div>');
      txt(b, 'h2', g.title); txt(b, 'p', g.desc);
      b.appendChild(grid(items)); v.appendChild(b);
    });
    return v;
  }

  function viewSimulator() {
    var v = el('div', 'view');
    v.appendChild(hero('Work simulator', 'Handle a real shift in a safe place. Messages arrive one at a time; you decide what to do, write the replies, and every answer is checked against company policy.'));
    v.appendChild(el('ol', 'how', '<li><b>Messages arrive</b><span>Broker emails land in Gmail. Drivers, the fuel team and maintenance write in Telegram.</span></li>' +
      '<li><b>You decide and reply</b><span>Pick the right action, attach the right paperwork, and write the email or message.</span></li>' +
      '<li><b>You get scored</b><span>Each reply is checked for the facts the policy requires, with a model answer to compare.</span></li>'));
    var row = el('div', 'sim-row');
    var sim = ITEMS.filter(function (i) { return i.section === 'simulator'; });
    row.appendChild(grid(sim));
    var m = meter('Cases completed'); m.classList.add('meter--card'); m.setAttribute('data-sim-meter', '');
    row.appendChild(m);
    v.appendChild(row);
    v.appendChild(el('p', 'note-line', 'Scores and your written replies are saved to your account so your trainer can review them. New cases are added as they come in from the team.'));
    return v;
  }

  // ------------------------------------------------------------- tabs
  var views = {}, current = 'home';
  function viewNone() {
    var v = el('div', 'view');
    v.appendChild(hero('Nothing is open to you yet', 'Your trainer has not given you access to any lessons or tools. Ask them to open what you need.'));
    return v;
  }
  // (Re)build the tabs and views for the current access; run again when someone signs in.
  function build() {
    var nav = $('tabs');
    nav.innerHTML = ''; portal.innerHTML = ''; cards = []; views = {};
    TABS.forEach(function (t) {
      var a = el('a', 'tab'); a.href = '#' + t.id; a.textContent = t.label; a.setAttribute('data-tab', t.id);
      nav.appendChild(a);
    });
    var make = { home: viewHome, course: viewCourse, tools: viewTools, simulator: viewSimulator, none: viewNone };
    TABS.forEach(function (t) { views[t.id] = make[t.id](); views[t.id].setAttribute('data-view', t.id); portal.appendChild(views[t.id]); });
    portal.appendChild(el('p', 'page-foot', 'Unified Service and Consulting · Dispatch training course'));
    route();
  }

  function route() {
    var h = location.hash.slice(1), jump = null;
    // #library opens the Course tab at the library heading (the "Next up" link once the road is done).
    if (h === 'library' && views.course) { h = 'course'; jump = 'library'; }
    // Tab names switch tabs; anything else (auth callbacks, preview lesson links) keeps the current tab.
    if (TABS.some(function (t) { return t.id === h; })) { current = h; window.scrollTo(0, 0); }
    if (!TABS.some(function (t) { return t.id === current; })) current = TABS[0].id;
    TABS.forEach(function (t) {
      views[t.id].hidden = t.id !== current;
      $('tabs').querySelector('[data-tab="' + t.id + '"]').classList.toggle('is-on', t.id === current);
    });
    if (jump && $(jump)) $(jump).scrollIntoView();
  }

  // ------------------------------------------------------------- progress
  function refresh() {
    var n = 0, next = null;
    lessons.forEach(function (it) { if (done[it.id]) n++; else if (!next) next = it; });
    cards.forEach(function (c) {
      var on = !!done[c._item.id] && c._item.section === 'course';
      c.classList.toggle('is-done', on);
      c.querySelector('.lcard__state').textContent = on ? '✓ Read' : '';
      if (c._mark) {
        c._mark.classList.toggle('is-on', on);
        c._mark.setAttribute('aria-pressed', on);
        c._mark.title = on ? 'Mark ' + c._item.title + ' as unread' : 'Mark ' + c._item.title + ' as read';
      }
    });
    document.querySelectorAll('[data-course-n]').forEach(function (e) { e.textContent = n; });
    document.querySelectorAll('[data-course-bar]').forEach(function (e) { e.style.width = pct(n, lessons.length) + '%'; });
    cat.tracks.forEach(function (t) {
      var items = lessons.filter(function (i) { return i.track === t.id; });
      var k = items.filter(function (i) { return done[i.id]; }).length;
      document.querySelectorAll('[data-track-meter="' + t.id + '"]').forEach(function (m) { setMeter(m, k, items.length); });
      var sec = $('track-' + t.id);
      if (sec) { sec.querySelector('.track__prog span').textContent = k + ' / ' + items.length; sec.querySelector('.track__prog i').style.width = pct(k, items.length) + '%'; }
    });
    var simN = Math.min(cat.simulator.cases, Object.keys(simDone).length);
    document.querySelectorAll('[data-sim-n]').forEach(function (e) { e.textContent = simN; });
    document.querySelectorAll('[data-sim-bar]').forEach(function (e) { e.style.width = pct(simN, cat.simulator.cases) + '%'; });
    document.querySelectorAll('[data-sim-meter]').forEach(function (m) { setMeter(m, simN, cat.simulator.cases); });

    // Next up: the first unread stop of the road; once the road is done, the library (or the course tab).
    var stops = roadStops(), stop = null;
    stops.forEach(function (it) { if (!stop && !done[it.id]) stop = it; });
    var hasLib = lessons.some(function (i) { return stops.indexOf(i) < 0; });
    document.querySelectorAll('[data-nextup]').forEach(function (s) {
      s.hidden = !stops.length;
      if (!stops.length) return;
      var go = s.querySelector('.nextup__go');
      if (stop) {
        s.querySelector('.nextup__title').textContent = stop.title;
        s.querySelector('.nextup__line').textContent = stop.desc;
        go.textContent = n ? 'Continue' : 'Start'; go.href = env.href(stop);
      } else {
        s.querySelector('.nextup__title').textContent = 'You finished the road';
        s.querySelector('.nextup__line').textContent = hasLib ? 'The library has the decks, policies and files the road linked to; they count too.' : 'Every stop is marked as read. Open any of them again when you need it.';
        go.textContent = hasLib ? 'Open the library' : 'All lessons'; go.href = hasLib ? '#library' : '#course';
      }
    });

    var target = next || lessons[0], go = $('continue');
    if (!go || !target) return;
    $('continue-label').textContent = !n ? 'Start with' : next ? 'Continue with' : 'Review';
    $('continue-title').textContent = target.title;
    go.href = env.href(target);
  }

  function loadProgress() {
    Promise.all([env.loadDone(), env.loadSimDone ? env.loadSimDone() : Promise.resolve([])]).then(function (r) {
      done = {}; simDone = {};
      r[0].forEach(function (id) { done[id] = true; });
      r[1].forEach(function (id) { simDone[id] = true; });
      refresh();
    });
  }

  // Lessons kept on this device for fast reopening (module.html) that this person may no longer
  // open are deleted, so a new limit also clears what was saved before it.
  function pruneCache() {
    try {
      if (!window.caches) return;
      var keep = {};
      ITEMS.forEach(function (it) {
        keep[it.path] = 1;
        ['audio', 'media'].forEach(function (p) { keep[p + '/' + it.path.replace(/\.html$/, '.pack')] = 1; });
      });
      caches.open(window.uglCacheName || 'ugl-content-v1').then(function (c) {
        return c.keys().then(function (ks) {
          ks.forEach(function (k) {
            var m = k.url.match(/\/__ugl-cache\/([^?]*)\?/);
            if (m && !keep[decodeURIComponent(m[1])]) c.delete(k);
          });
        });
      }).catch(function () {});
    } catch (e) {}
  }

  function setUser(user) {
    var email = user && user.email, dom = '@' + ((window.UGL_CONFIG && window.UGL_CONFIG.userDomain) || '');
    var name = email ? (email.slice(-dom.length) === dom ? email.slice(0, -dom.length) : email.split('@')[0]) : '';
    if ($('hello')) $('hello').textContent = name ? 'Welcome back, ' + name.charAt(0).toUpperCase() + name.slice(1) + '.' : 'Welcome back.';
  }

  applyAccess(null); build(); refresh();
  window.addEventListener('hashchange', route);
  // The Admin link is only a shortcut: the admin page's data is protected by the database itself.
  function showAdmin(on) { var a = $('ugl-admin'); if (a) a.hidden = !on; }
  window.uglOnSignedIn = function (user) {
    // Keep the menu out of sight until we know what this person may open, so nothing flashes up.
    portal.style.visibility = $('tabs').style.visibility = 'hidden';
    // The access limit, the progress and the admin flag are asked for at the same time, not one after another.
    var progress = Promise.all([env.loadDone(), env.loadSimDone ? env.loadSimDone() : Promise.resolve([])]);
    if (env.isAdmin) env.isAdmin().then(showAdmin);
    (env.loadAccess ? env.loadAccess(user) : Promise.resolve(null)).then(function (access) {
      applyAccess(access); build(); setUser(user); refresh(); pruneCache();
      portal.style.visibility = $('tabs').style.visibility = '';
      return progress;
    }).then(function (r) {
      done = {}; simDone = {};
      r[0].forEach(function (id) { done[id] = true; });
      r[1].forEach(function (id) { simDone[id] = true; });
      refresh();
    });
  };
  window.uglOnSignedOut = function () {
    done = {}; simDone = {}; applyAccess(null); build(); refresh(); showAdmin(false);
    portal.style.visibility = $('tabs').style.visibility = '';
  };
  window.uglPortal = { refresh: loadProgress };
  window.addEventListener('pageshow', function (e) { if (e.persisted) loadProgress(); });
})();
