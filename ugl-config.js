// Public Supabase settings. The publishable key is designed to be exposed in the
// browser; access is enforced by Row Level Security and the private storage bucket.
window.UGL_CONFIG = {
  url: 'https://fjojwlygbbajfqhdusut.supabase.co',
  key: 'sb_publishable_v0r-1buW7nd7xDQXqj6KOA_apsNbENA',
  bucket: 'course',
  // People sign in with a plain username. Supabase needs an email-shaped id, so the site
  // quietly appends this domain (omar -> omar@ugldispatch.com). No email is ever sent.
  userDomain: 'ugldispatch.com'
};
