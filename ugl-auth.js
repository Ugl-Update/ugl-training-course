// Shared Supabase client for the course pages.
(function () {
  var cfg = window.UGL_CONFIG;
  var db = window.uglDb = window.supabase.createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  // An admin can block or delete an account at any time. Ask the sign-in server now, every 30
  // seconds and whenever the tab comes back into view, so the person is signed out within moments
  // instead of when their sign-in runs out. onEnded('blocked') when the account is blocked (the
  // server answers "user_banned"), onEnded('ended') when it was deleted or its session ended.
  // Being offline or a server hiccup is not a sign-out.
  window.uglWatchSession = function (onEnded) {
    var busy = false, over = false;
    function end(reason) {
      over = true;
      try { if (window.caches) caches.delete('ugl-content-v1'); } catch (e) {}
      // Only this device: the server refuses every request from a blocked or deleted account anyway.
      db.auth.signOut({ scope: 'local' }).catch(function () {}).then(function () { over = false; onEnded(reason); });
    }
    function check() {
      if (busy || over || document.visibilityState === 'hidden') return;
      busy = true;
      db.auth.getSession().then(function (s) {
        if (!s.data || !s.data.session) return null;
        return db.auth.getUser().then(function (r) {
          var e = r.error;
          if (!e) return;
          if (e.code === 'user_banned' || /banned/i.test(e.message || '')) end('blocked');
          else if (e.name === 'AuthSessionMissingError' || e.status === 401 || e.status === 403 || e.status === 404) end('ended');
        });
      }).catch(function () {}).then(function () { busy = false; });
    }
    check();
    setInterval(check, 30000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
  };
})();
