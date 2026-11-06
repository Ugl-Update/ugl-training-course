-- The course helper's Groq key lives in Vault (name 'groq_api_key'). Only the ask edge function, which uses the
-- service role, may read it; the website's anon and signed-in roles cannot. Applied 6 November 2026.
--
-- To set or replace the key (SQL editor, as postgres):
--   select vault.create_secret('<the key>', 'groq_api_key', 'Groq API key for the ask edge function');
--   -- or, when it exists: select vault.update_secret((select id from vault.secrets where name = 'groq_api_key'), '<the key>');
-- An Edge Functions secret named GROQ_API_KEY, if set in the dashboard, takes priority over Vault.
create or replace function public.groq_api_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'groq_api_key' order by created_at desc limit 1;
$$;
revoke all on function public.groq_api_key() from public, anon, authenticated;
grant execute on function public.groq_api_key() to service_role;
