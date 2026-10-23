// Login, invite / password-reset handling and sign-out for index.html.
(function () {
  var db = window.uglDb;

  // Invite and recovery links arrive as #access_token=...&type=invite|recovery.
  // Read the type now; supabase-js clears the hash once it has the session.
  var linkType = (location.hash.match(/[#&]type=([a-z]+)/) || [])[1] || '';
  var needsPassword = linkType === 'invite' || linkType === 'recovery';

  var $ = function (id) { return document.getElementById(id); };
  var gate = $('ugl-pass-gate');
  var loginForm = $('ugl-login-form');
  var setpwForm = $('ugl-setpw-form');
  var email = $('ugl-email');
  var pass = $('ugl-pass-input');
  var loginErr = $('ugl-pass-error');
  var loginBtn = $('ugl-pass-submit');
  var newPass = $('ugl-new-pass');
  var newPass2 = $('ugl-new-pass2');
  var setpwErr = $('ugl-setpw-error');
  var setpwBtn = $('ugl-setpw-submit');
  var userLabel = $('ugl-user-email');

  var domain = '@' + window.UGL_CONFIG.userDomain;
  // "omar" -> "omar@ugldispatch.com"; a full email is passed through unchanged.
  function toLoginId(name) { name = name.trim().toLowerCase(); return name.indexOf('@') === -1 ? name + domain : name; }
  function toDisplayName(email) { return email && email.slice(-domain.length) === domain ? email.slice(0, -domain.length) : email; }

  function show(el, msg) { el.textContent = msg; el.style.display = 'block'; }
  function hide(el) { el.style.display = 'none'; }

  function showCourse(user) {
    userLabel.textContent = toDisplayName(user.email) || 'INTERNAL MODULES';
    if (window.uglOnSignedIn) window.uglOnSignedIn(user);
    document.body.classList.remove('ugl-locked');
    document.body.classList.add('ugl-unlocked');
    gate.classList.add('is-leaving');
    setTimeout(function () { gate.style.display = 'none'; }, 340);
  }

  function showLogin() {
    document.body.classList.remove('ugl-unlocked');
    document.body.classList.add('ugl-locked');
    if (window.uglOnSignedOut) window.uglOnSignedOut();
    gate.classList.remove('is-leaving');
    gate.style.display = '';
    setpwForm.hidden = true;
    loginForm.hidden = false;
    pass.value = '';
    hide(loginErr);
    email.focus();
  }

  function showSetPassword() {
    document.body.classList.add('ugl-locked');
    loginForm.hidden = true;
    setpwForm.hidden = false;
    $('ugl-setpw-lead').textContent = linkType === 'invite'
      ? 'Welcome! Choose a password for your account.'
      : 'Choose a new password for your account.';
    newPass.focus();
  }

  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    hide(loginErr);
    var em = toLoginId(email.value);
    if (!email.value.trim() || !pass.value) { show(loginErr, 'Enter your username and password.'); return; }
    loginBtn.disabled = true;
    db.auth.signInWithPassword({ email: em, password: pass.value }).then(function (r) {
      loginBtn.disabled = false;
      if (r.error && (r.error.code === 'user_banned' || /banned/i.test(r.error.message || ''))) {
        show(loginErr, ENDED.blocked);
        return;
      }
      if (r.error) {
        show(loginErr, 'Incorrect username or password.');
        // Tell the admin page someone tried this account (the password is never sent).
        try {
          fetch(window.UGL_CONFIG.url + '/functions/v1/login-report', {
            method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ login: em })
          }).catch(function () {});
        } catch (x) {}
        return;
      }
      showCourse(r.data.user);
    });
  });

  setpwForm.addEventListener('submit', function (e) {
    e.preventDefault();
    hide(setpwErr);
    if (newPass.value.length < 8) { show(setpwErr, 'Use at least 8 characters.'); return; }
    if (newPass.value !== newPass2.value) { show(setpwErr, 'Passwords do not match.'); return; }
    setpwBtn.disabled = true;
    db.auth.updateUser({ password: newPass.value }).then(function (r) {
      setpwBtn.disabled = false;
      if (r.error) { show(setpwErr, r.error.message); return; }
      needsPassword = false;
      history.replaceState(null, '', location.pathname);
      setpwForm.hidden = true;
      loginForm.hidden = false;
      showCourse(r.data.user);
    });
  });

  // Signing out also clears the lessons kept on this device for fast reopening (module.html).
  $('ugl-lock-btn').addEventListener('click', function () {
    try { if (window.caches) caches.delete('ugl-content-v1'); } catch (e) {}
    db.auth.signOut().then(showLogin);
  });

  // Signed out by the server: blocked or deleted by an admin (ugl-auth.js), here or on a lesson page.
  var ENDED = {
    blocked: 'Your access is paused. Contact your trainer.',
    auto: 'Your access has been blocked. This incident has been forwarded to the admin.',
    ended: 'You have been signed out. Sign in again, or contact your trainer if that does not work.'
  };
  function signedOutByServer(reason) {
    showLogin();
    show(loginErr, ENDED[reason] || ENDED.ended);
  }
  window.uglWatchSession(signedOutByServer);
  var out = (location.search.match(/[?&]out=(blocked|auto|ended)\b/) || [])[1];
  if (out) history.replaceState(null, '', location.pathname + location.hash);

  db.auth.getSession().then(function (r) {
    var session = r.data && r.data.session;
    if (session && needsPassword) { showSetPassword(); return; }
    if (session) { showCourse(session.user); return; }
    showLogin();
    if (out) show(loginErr, ENDED[out]);
  });
})();
