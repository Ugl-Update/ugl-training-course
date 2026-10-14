// Shared Supabase client for the course pages.
(function () {
  var cfg = window.UGL_CONFIG;
  window.uglDb = window.supabase.createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
})();
