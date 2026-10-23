// The "On a load" tools: Message builder, EFS request, lumper and late fees, customer rules,
// glossary and who to tag. Each page sets window.UGL_TOOL and calls one function here.
// Copying is allowed here only through the Copy buttons and the editable boxes, whose job is to be pasted.
window.UGLRoad = (function () {
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function md(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); }
  function toast(msg) {
    var t = document.querySelector('.rt-toast');
    if (!t) { t = document.createElement('div'); t.className = 'rt-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('is-on');
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('is-on'); }, 2600);
  }
  function copy(ta) {
    var text = ta.value;
    function fallback() { ta.focus(); ta.select(); toast('Selected. Press Ctrl+C to copy.'); }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast('Copied. Paste it where it goes.'); }, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }
  // Fill {field} blanks. A line that is only an empty blank is dropped; other empty blanks show as [label].
  function fill(text, vals, labels) {
    return text.split('\n').filter(function (line) {
      var m = line.match(/^\s*\{([a-z_]+)\}\s*$/); return !m || (vals[m[1]] || '').trim();
    }).join('\n').replace(/\{([a-z_]+)\}/g, function (_, f) { var v = (vals[f] || '').trim(); return v || '[' + (labels[f] || f).replace(/\s*\(.*?\)/g, '').toLowerCase() + ']'; });
  }
  function blanksOf(text) { var out = []; text.replace(/\{([a-z_]+)\}/g, function (_, f) { if (out.indexOf(f) < 0) out.push(f); }); return out; }
  function anchor() { return decodeURIComponent((location.hash || '').replace(/^#/, '').replace(/^lesson-[a-z0-9-]+?(--|$)/, '')); }
  function out(rows) { return '<textarea class="rt-out" rows="' + Math.max(4, rows) + '" spellcheck="false" aria-label="Message"></textarea>'; }
  function copyBtn(label) { return '<button type="button" class="btn rt-copy">' + (label || 'Copy') + '</button>'; }

  // ------------------------------------------------------------ message builder
  function builder(D) {
    var vals = {}, cur = null, q = $('mb-q'), groups = $('mb-groups'), main = $('mb-main');
    var by = {}; D.messages.forEach(function (m) { by[m.id] = m; });
    function list() {
      var t = q.value.trim().toLowerCase();
      groups.innerHTML = D.groups.map(function (g) {
        var ms = D.messages.filter(function (m) { return m.group === g.id && (!t || (m.title + ' ' + m.when + ' ' + m.text).toLowerCase().indexOf(t) >= 0); });
        if (!ms.length) return '';
        return '<div class="mb__g" id="' + g.id + '"><h4>' + esc(g.title) + '</h4>' + ms.map(function (m) {
          return '<button type="button" data-m="' + m.id + '"' + (cur && cur.id === m.id ? ' class="is-on"' : '') + '>' + esc(m.title) + '</button>';
        }).join('') + '</div>';
      }).join('') || '<p class="empty">NO MESSAGES MATCH</p>';
    }
    function show(id, scroll) {
      cur = by[id]; list();
      var g = D.groups.filter(function (x) { return x.id === cur.group; })[0];
      var fs = blanksOf(cur.text);
      main.innerHTML = '<div class="mb__top"><span>' + esc(D.to[cur.to]) + '</span><span class="msg__src">' + esc(D.src[cur.src]) + '</span></div>' +
        '<h2>' + esc(cur.title) + '</h2><p class="mb__when">' + md(cur.when) + '</p>' + (g.note ? '<div class="gate"><b>RULE</b><span>' + md(g.note) + '</span></div>' : '') +
        (fs.length ? '<div class="mb__fields">' + fs.map(function (f) {
          return '<label class="field"><label for="f-' + f + '">' + esc(D.fields[f].toUpperCase()) + '</label><input id="f-' + f + '" data-f="' + f + '" autocomplete="off"></label>';
        }).join('') + '</div>' : '') +
        out(cur.text.split('\n').length + 1) +
        ((cur.attach || cur.never) ? '<div class="msg__att">' + (cur.attach ? '<small>ATTACH</small>' + cur.attach.map(function (a) { return '<span>' + esc(a) + '</span>'; }).join('') : '') +
          (cur.never ? '<small>NEVER</small>' + cur.never.map(function (a) { return '<span class="no">' + esc(a) + '</span>'; }).join('') : '') + '</div>' : '') +
        '<div class="rt-bar">' + copyBtn() + '<span>You can edit the text before copying.</span></div>';
      var ta = main.querySelector('.rt-out');
      function render() { ta.value = fill(cur.text, vals, D.fields); }
      [].forEach.call(main.querySelectorAll('[data-f]'), function (inp) {
        var f = inp.getAttribute('data-f'); inp.value = vals[f] || '';
        inp.addEventListener('input', function () { vals[f] = inp.value; render(); });
      });
      main.querySelector('.rt-copy').addEventListener('click', function () { copy(ta); });
      render();
      if (scroll && window.matchMedia('(max-width: 860px)').matches) main.scrollIntoView({ behavior: 'smooth' });
    }
    groups.addEventListener('click', function (e) { var b = e.target.closest('[data-m]'); if (b) show(b.getAttribute('data-m'), true); });
    q.addEventListener('input', list);
    var a = anchor(), start = by[a] ? a : (D.messages.filter(function (m) { return m.group === a; })[0] || D.messages[0]).id;
    show(start);
    var ga = $(by[start].group); if (a && ga && !by[a]) ga.scrollIntoView();
  }

  // ------------------------------------------------------------ EFS request
  var EFS_FIELDS = {
    company: ['Company name', ''], truck: ['Truck', ''], driver: ['Driver', ''], amount: ['Amount $', ''], reason: ['Reason', ''], payee: ['Payee', ''],
    load: ['Load ID #', ''], link: ['Link', ''], disp: ['Dispatcher to tag', '@dispatcher']
  };
  function efs() {
    var root = $('efs'), mode = 'company', v = { disp: '@dispatcher' };
    var CHIPS = {
      company: ['parking', 'buying straps', 'buying a padlock', 'buying coolant', 'buying a pulp'],
      load: ['lumper fee at the receiver, tried calling and emailing the broker for 20 minutes, no answer', 'lumper fee at the receiver, spoke to the broker and they asked us to pay it, they will reimburse', 'late fee at the receiver, the broker cannot pay it and asked us to pay', 'rescheduling fee']
    };
    var PROOF = {
      company: ['A picture or video of what the driver is paying for or buying', 'After accounting issues the EFS: ask the driver for the receipt'],
      load: ['Screenshots of the emails, calls, transcripts or call notes showing you tried the broker, or the broker\'s answer about the payment', 'Tag the dispatcher', 'After accounting issues the EFS: ask the driver for the receipt']
    };
    function text() {
      var L = ['EFS Request - ' + (v.company || '[company name]'), 'Truck: ' + (v.truck || ''), 'Driver: ' + (v.driver || ''), 'Amount $: ' + (v.amount || ''), 'Reason: ' + (v.reason || ''), 'Payee: ' + (v.payee || '')];
      if (mode === 'load') L.push('Load ID # ' + (v.load || ''), 'Link: ' + (v.link || ''), (v.disp || '@dispatcher') + ' please note');
      return L.join('\n');
    }
    function draw() {
      var keys = ['company', 'truck', 'driver', 'amount', 'reason', 'payee'].concat(mode === 'load' ? ['load', 'link', 'disp'] : []);
      root.innerHTML = '<div class="qa-mode" role="tablist"><button type="button" data-mode="company"' + (mode === 'company' ? ' class="is-on"' : '') + '>Company expense</button>' +
        '<button type="button" data-mode="load"' + (mode === 'load' ? ' class="is-on"' : '') + '>Load fee</button></div>' +
        '<p class="mb__when">' + (mode === 'company' ? 'Parking, straps, coolant, a padlock: anything bought for the company.' : 'Lumper, late, escort or rescheduling fee on a load.') + '</p>' +
        '<div class="grid2"><div>' + keys.map(function (k) {
          return '<label class="field"><label for="e-' + k + '">' + EFS_FIELDS[k][0].toUpperCase() + '</label>' + (k === 'reason' ? '<textarea id="e-' + k + '" data-k="' + k + '" rows="3"></textarea>' : '<input id="e-' + k + '" data-k="' + k + '" autocomplete="off"' + (k === 'amount' ? ' inputmode="decimal"' : '') + '>') +
            (k === 'reason' ? '<div class="chipsel">' + CHIPS[mode].map(function (c) { return '<button type="button" data-r="' + esc(c) + '">' + esc(c.length > 48 ? c.slice(0, 46) + '…' : c) + '</button>'; }).join('') + '</div>' : '') + '</label>';
        }).join('') + '</div><div>' + out(10) + '<div class="rt-bar">' + copyBtn() + '</div>' +
        '<div class="proof"><h4>BEFORE YOU POST IT</h4>' + PROOF[mode].map(function (p, i) { return '<label><input type="checkbox" data-p="' + i + '"> <span>' + esc(p) + '</span></label>'; }).join('') + '</div></div></div>';
      var ta = root.querySelector('.rt-out');
      function render() { ta.value = text(); }
      [].forEach.call(root.querySelectorAll('[data-k]'), function (inp) {
        var k = inp.getAttribute('data-k'); inp.value = v[k] || '';
        inp.addEventListener('input', function () { v[k] = inp.value; render(); });
      });
      root.querySelector('.rt-copy').addEventListener('click', function () {
        var all = [].every.call(root.querySelectorAll('[data-p]'), function (c) { return c.checked; });
        copy(ta); if (!all) setTimeout(function () { toast('Copied. Remember the proof: tick the list before you post.'); }, 50);
      });
      render();
    }
    root.addEventListener('click', function (e) {
      var m = e.target.closest('[data-mode]'); if (m) { mode = m.getAttribute('data-mode'); draw(); return; }
      var r = e.target.closest('[data-r]'); if (r) { v.reason = r.getAttribute('data-r'); var t = root.querySelector('[data-k=reason]'); t.value = v.reason; t.dispatchEvent(new Event('input')); }
    });
    draw();
  }

  // ------------------------------------------------------------ lumper and late fees
  function fees(D) {
    var root = $('fee'), s = {}, log = [], timer = null;
    function now() { return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
    function note(t) { log.push(now() + ' · ' + t); }
    function labels() { return { amount: 'amount', fee: 'fee', link: 'link' }; }
    function vals() { return { amount: s.amount, fee: s.fee, link: s.link }; }
    function clock(secs, label, done) {
      clearInterval(timer);
      var end = Date.now() + secs * 1000, el = root.querySelector('[data-clock]');
      function tick() {
        var left = Math.max(0, Math.round((end - Date.now()) / 1000));
        if (!document.body.contains(el)) { clearInterval(timer); return; }
        el.textContent = Math.floor(left / 60) + ':' + ('0' + left % 60).slice(-2);
        if (!left) { clearInterval(timer); el.classList.add('is-up'); el.nextElementSibling.textContent = done; }
      }
      el.nextElementSibling.textContent = label; tick(); timer = setInterval(tick, 1000);
    }
    var STEPS = {
      start: function () {
        return '<h2>What does the facility want paid?</h2><div class="fee-pick"><button type="button" data-go="how" data-set="fee=lumper fee"><b>Lumper fee</b><span>Unloading the pallets. Mostly at receivers.</span></button>' +
          '<button type="button" data-go="how" data-set="fee=late fee"><b>Late fee</b><span>The appointment was missed.</span></button></div>';
      },
      how: function () {
        return '<h2>How did they ask?</h2><div class="fee-pick"><button type="button" data-go="details" data-set="via=link"><b>A link</b><span>Texted to the driver.</span></button>' +
          '<button type="button" data-go="details" data-set="via=none"><b>No link</b><span>They only told the driver an amount.</span></button></div>';
      },
      details: function () {
        var link = s.via === 'link';
        return '<h2>' + (link ? 'Open the link' : 'Confirm with the employee') + '</h2><ol class="numlist">' + (link ?
          '<li><span class="nl-n">1</span><span>Ask the driver to share the link in the group.</span></li><li><span class="nl-n">2</span><span>Open it: the exact amount, the payment method, and is it really a ' + esc(s.fee) + '?</span></li>' :
          '<li><span class="nl-n">1</span><span>The driver confirms the <b>exact amount, 100%</b>, with the employee, so nothing extra is added later.</span></li><li><span class="nl-n">2</span><span>And the <b>payment method</b>.</span></li>') +
          '</ol><div class="grid2"><label class="field"><label for="fa">AMOUNT ($)</label><input id="fa" data-s="amount" inputmode="decimal"></label>' +
          '<label class="field"><label for="fm">PAYMENT METHOD</label><select id="fm" data-s="method"><option>Relay</option><option>EFS</option><option>Comcheck</option><option>Card</option><option>Cash</option><option>Other</option></select></label></div>' +
          (link ? '<label class="field"><label for="fl">LINK</label><input id="fl" data-s="link" autocomplete="off"></label>' : '') +
          '<button type="button" class="btn" data-go="email">Next: email the broker</button>';
      },
      email: function () {
        return '<h2>Email the broker</h2><p class="mb__when">Always, once you know the amount and the method. Attach a screenshot of the amount.</p>' + out(5) +
          '<div class="rt-bar">' + copyBtn() + '<button type="button" class="btn btn--ghost" data-go="wait" data-log="Emailed the broker">I sent it: start the 5-minute timer</button></div>';
      },
      wait: function () {
        return '<h2>Wait for the answer</h2><div class="fee-clock"><b data-clock>5:00</b><span></span></div>' +
          '<div class="proof"><h4>WHEN YOU CALL, THE BROKER MAY ASK</h4>' + ['Check in time', 'Door #', 'Which stop (DEL 1, DEL 2…)', 'MC # or DOT #', 'The driver\'s phone #'].map(function (x) { return '<label><input type="checkbox"> <span>' + x + '</span></label>'; }).join('') + '</div>' +
          '<h3 class="sub">What did the broker say?</h3><div class="fee-pick fee-pick--4">' +
          '<button type="button" data-go="code" data-log="Broker gave a money code"><b>Here is a money code</b><span>By email, phone or text to the driver.</span></button>' +
          '<button type="button" data-go="paid" data-log="Broker will pay the link"><b>We will pay the link</b><span>Send them the link.</span></button>' +
          '<button type="button" data-go="reimb" data-log="Broker asked us to pay and will reimburse"><b>You pay, we reimburse</b><span>Get it by email.</span></button>' +
          '<button type="button" data-go="efs" data-set="why=cant" data-log="Broker cannot pay it"><b>We can\'t pay it</b><span>Screenshot their answer.</span></button>' +
          '<button type="button" data-go="noans" data-log="Called the broker, no answer"><b>No answer</b><span>Called and emailed, nothing.</span></button></div>';
      },
      noans: function () {
        return '<h2>Keep trying for 15–20 minutes</h2><div class="fee-clock"><b data-clock>15:00</b><span></span></div><p class="mb__when">Keep calling and checking the email. Screenshot every call and email: they are the proof that we really tried.</p>' +
          '<div class="fee-pick"><button type="button" data-go="wait"><b>The broker answered</b><span>Back to their answer.</span></button><button type="button" data-go="efs" data-set="why=none" data-log="No answer after 15–20 minutes"><b>Still nothing</b><span>Request an EFS.</span></button></div>';
      },
      code: function () {
        return '<h2>Pay with the money code</h2><label class="field"><label for="fc">PASTE THE CODE</label><input id="fc" data-code autocomplete="off"></label>' +
          '<p class="mb__when">Enter it on the link exactly, <b>with no spaces</b>:</p><div class="fee-code" data-clean>—</div>' +
          (s.method === 'Relay' ? '<p class="note">Relay: Pay with a check → I Have A Money Code → enter the code → Submit.</p>' : '') +
          '<p class="mb__when">Fill in the other fields the form asks for.</p><button type="button" class="btn" data-go="receipt" data-log="Paid with the money code">Paid: next, the receipt</button>';
      },
      paid: function () {
        return '<h2>The broker pays the link</h2><p class="mb__when">Send them the link if they don\'t have it, and wait for their confirmation that it is paid.</p><button type="button" class="btn" data-go="receipt" data-log="Broker paid the link">Paid: next, the receipt</button>';
      },
      reimb: function () {
        return '<h2>Get it in writing</h2><p class="mb__when">They said it on the phone; now ask for it by email. Then we pay through an EFS request, with their email as the proof.</p>' + out(5) +
          '<div class="rt-bar">' + copyBtn() + '<button type="button" class="btn btn--ghost" data-go="efs" data-set="why=reimb">Next: the EFS request</button></div>';
      },
      efs: function () {
        var why = s.why === 'none' ? 'tried calling and emailing the broker for 15–20 minutes, no answer' : s.why === 'reimb' ? 'the broker asked us to pay it and will reimburse' : 'the broker cannot pay it';
        return '<h2>Request an EFS</h2><ol class="numlist"><li><span class="nl-n">1</span><span>Screenshots: ' + (s.why === 'none' ? 'every call and every email' : 'the broker\'s answer (their email, or the call transcript)') + '.</span></li>' +
          '<li><span class="nl-n">2</span><span>Post the request in the company\'s EFS group for the exact amount, with the screenshots.</span></li>' +
          '<li><span class="nl-n">3</span><span>Once accounting issues it, pay, and ask the driver for the receipt.</span></li></ol>' +
          '<div class="pre"><figcaption>Reason line for the request</figcaption><pre>' + esc(s.fee + ' at the receiver, ' + why) + '</pre></div>' +
          '<div class="rt-bar"><a class="btn btn--ghost" href="module.html?m=efs-request">Open the EFS request builder →</a><button type="button" class="btn" data-go="receipt" data-log="Paid with an EFS">Paid: next, the receipt</button></div>';
      },
      receipt: function () {
        return '<h2>Get the receipt</h2><p class="mb__when">Share it in the driver\'s group and email it to the broker.</p>' + out(4) + '<div class="rt-bar">' + copyBtn() + '</div>' +
          '<div class="pre"><figcaption>What happened</figcaption><pre>' + esc(log.join('\n')) + '</pre></div><button type="button" class="btn btn--ghost" data-go="start" data-reset>Start a new fee</button>';
      }
    };
    var TEXT = { email: D.ask, reimb: D.reimburse, receipt: D.receipt };
    function go(step) {
      root.innerHTML = '<div class="card fee-card">' + STEPS[step]() + '</div>';
      var ta = root.querySelector('.rt-out');
      if (ta) { ta.value = fill(TEXT[step], vals(), labels()); root.querySelector('.rt-copy').addEventListener('click', function () { copy(ta); }); }
      [].forEach.call(root.querySelectorAll('[data-s]'), function (inp) {
        var k = inp.getAttribute('data-s'); if (s[k]) inp.value = s[k]; else s[k] = inp.value;
        inp.addEventListener('input', function () { s[k] = inp.value; }); inp.addEventListener('change', function () { s[k] = inp.value; });
      });
      var code = root.querySelector('[data-code]');
      if (code) code.addEventListener('input', function () { root.querySelector('[data-clean]').textContent = code.value.replace(/\s+/g, '') || '—'; });
      if (step === 'wait') clock(300, 'Waiting for an email answer.', 'No answer in 5 minutes: call the broker now.');
      if (step === 'noans') clock(1200, 'Keep calling. You can request the EFS after 15 minutes.', '20 minutes: request the EFS with the screenshots.');
      if (step !== 'wait' && step !== 'noans') clearInterval(timer);
    }
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-go]'); if (!b) return;
      if (b.hasAttribute('data-reset')) { s = {}; log = []; }
      var set = b.getAttribute('data-set'); if (set) s[set.split('=')[0]] = set.split('=')[1];
      if (b.getAttribute('data-log')) note(b.getAttribute('data-log') + (s.amount && /Emailed/.test(b.getAttribute('data-log')) ? ' ($' + s.amount + ' ' + s.fee + ')' : ''));
      go(b.getAttribute('data-go'));
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    go('start');
  }

  // ------------------------------------------------------------ customer rules
  function customers(D) {
    var root = $('cr'), ci = 0, ki = 0, vals = {};
    function draw() {
      var c = D.customers[ci], k = c.cases[ki];
      root.innerHTML = '<div class="qa-mode" role="tablist">' + D.customers.map(function (x, i) { return '<button type="button" data-c="' + i + '"' + (i === ci ? ' class="is-on"' : '') + '>' + esc(x.name) + '</button>'; }).join('') + '</div>' +
        '<div class="grid2 cr"><div><div class="card"><h3>' + esc(c.name) + ' <small>' + esc(c.what.toUpperCase()) + '</small></h3><ul class="plain plain--doc">' + c.rules.map(function (r) { return '<li>' + md(r) + '</li>'; }).join('') + '</ul></div>' +
        '<h3 class="sub">Which case?</h3><div class="cr-cases">' + c.cases.map(function (x, i) { return '<button type="button" data-k="' + i + '"' + (i === ki ? ' class="is-on"' : '') + '>' + esc(x.t) + '</button>'; }).join('') + '</div></div>' +
        '<div><div class="proof"><h4>COLLECT</h4>' + k.need.map(function (n) { return '<label><input type="checkbox"> <span>' + esc(n) + '</span></label>'; }).join('') + '</div>' +
        '<div class="mb__top"><span>TO THE BROKER · EMAIL</span><span class="msg__src">' + esc(D.src[k.src || 'course']) + '</span></div>' +
        '<div class="mb__fields">' + blanksOf(k.text).map(function (f) { return '<label class="field"><label for="c-' + f + '">' + esc(D.fields[f].toUpperCase()) + '</label><input id="c-' + f + '" data-f="' + f + '" autocomplete="off"></label>'; }).join('') + '</div>' +
        out(k.text.split('\n').length + 1) + '<div class="rt-bar">' + copyBtn() + '</div></div></div>';
      var ta = root.querySelector('.rt-out');
      function render() { ta.value = fill(k.text, vals, D.fields); }
      [].forEach.call(root.querySelectorAll('[data-f]'), function (inp) { var f = inp.getAttribute('data-f'); inp.value = vals[f] || ''; inp.addEventListener('input', function () { vals[f] = inp.value; render(); }); });
      root.querySelector('.rt-copy').addEventListener('click', function () { copy(ta); });
      render();
    }
    root.addEventListener('click', function (e) {
      var c = e.target.closest('[data-c]'); if (c) { ci = +c.getAttribute('data-c'); ki = 0; draw(); return; }
      var k = e.target.closest('[data-k]'); if (k) { ki = +k.getAttribute('data-k'); draw(); }
    });
    draw();
  }

  // ------------------------------------------------------------ glossary
  function glossary(D) {
    var q = $('gl-q'), cats = $('gl-cats'), outEl = $('gl-out'), none = $('gl-none'), cat = '';
    cats.innerHTML = '<button type="button" data-g="" class="is-on">All</button>' + Object.keys(D.groups).map(function (g) { return '<button type="button" data-g="' + g + '">' + esc(D.groups[g]) + '</button>'; }).join('');
    function draw() {
      var t = q.value.trim().toLowerCase(), n = 0;
      outEl.innerHTML = Object.keys(D.groups).map(function (g) {
        if (cat && cat !== g) return '';
        var rows = D.terms.filter(function (x) { return x[2] === g && (!t || (x[0] + ' ' + x[1]).toLowerCase().indexOf(t) >= 0); });
        n += rows.length;
        return rows.length ? '<h3 class="sub">' + esc(D.groups[g]) + '</h3><dl class="gloss">' + rows.map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl>' : '';
      }).join('');
      none.style.display = n ? 'none' : 'block';
    }
    cats.addEventListener('click', function (e) {
      var b = e.target.closest('[data-g]'); if (!b) return; cat = b.getAttribute('data-g');
      [].forEach.call(cats.children, function (x) { x.classList.toggle('is-on', x === b); }); draw();
    });
    q.addEventListener('input', draw);
    draw();
  }

  // ------------------------------------------------------------ who to tag
  function who() {
    var q = $('who-q'), cards = [].slice.call(document.querySelectorAll('#who [data-s]')), none = $('who-none');
    q.addEventListener('input', function () {
      var ws = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean), shown = 0;
      cards.forEach(function (c) { var h = c.getAttribute('data-s'), ok = ws.every(function (w) { return h.indexOf(w) >= 0; }); c.style.display = ok ? '' : 'none'; if (ok) shown++; });
      none.style.display = shown ? 'none' : 'block';
    });
  }

  return { builder: builder, efs: efs, fees: fees, customers: customers, glossary: glossary, who: who, fill: fill };
})();
