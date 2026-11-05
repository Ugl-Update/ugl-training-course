-- gateway_open: the content gateway's check-and-log step, now with the bucket as a parameter so the
-- staging gateway (content-staging, bucket course-staging) finds its own files. Calls without p_bucket
-- keep checking the live "course" bucket. This is the canonical definition of the function; the limits
-- (60 requests per 10 minutes, 14 distinct lessons = bulk download, 9 = flagged) live here.
drop function if exists public.gateway_open(uuid, text, text, text, text, text, jsonb, text, text[]);
create or replace function public.gateway_open(
  p_user uuid, p_module text, p_path text, p_part text, p_ip text, p_ua text, p_signals jsonb, p_block text, p_flags text[],
  p_bucket text default 'course'
) returns jsonb
language plpgsql security definer set search_path to ''
as $function$
declare
  v_part text := coalesce(nullif(p_part, ''), 'main');
  v_bucket text := case when p_bucket in ('course', 'course-staging') then p_bucket else 'course' end;
  v_reason text := p_block;
  v_flags text[] := coalesce(p_flags, '{}');
  v_n int;
  v_meta jsonb;
begin
  if v_reason is null and exists (select 1 from public.blocked_users where user_id = p_user) then
    v_reason := 'blocked-user';
  end if;
  if v_reason is null then
    select count(*) into v_n from public.access_log where user_id = p_user and at > now() - interval '10 minutes';
    if v_n >= 60 then v_reason := 'too-many-requests'; end if;
  end if;
  if v_reason is null and v_part = 'main' then
    select count(distinct module) into v_n from public.access_log
      where user_id = p_user and part = 'main' and allowed and module is distinct from p_module and at > now() - interval '10 minutes';
    if v_n >= 14 then v_reason := 'bulk-download';
    elsif v_n >= 9 then v_flags := array_append(v_flags, 'bulk');
    end if;
  end if;
  if v_reason is null then
    select o.metadata into v_meta from storage.objects o where o.bucket_id = v_bucket and o.name = p_path;
    if v_meta is null then v_reason := 'not-found'; end if;
  end if;
  insert into public.access_log (user_id, module, path, part, allowed, reason, flags, ip, ua, signals)
  values (p_user, left(p_module, 80), left(p_path, 200), v_part, v_reason is null, v_reason, v_flags, left(p_ip, 80), left(p_ua, 400), p_signals);
  if v_reason is not null then
    return jsonb_build_object('allowed', false, 'reason', v_reason);
  end if;
  if v_part = 'main' and p_module is not null then
    insert into public.module_opens (user_id, email, module)
    values (p_user, (select email from auth.users where id = p_user), p_module);
  end if;
  return jsonb_build_object('allowed', true, 'etag', v_meta->>'eTag', 'size', (v_meta->>'size')::bigint, 'flags', to_jsonb(v_flags));
end $function$;
-- Only the gateway (service role) may call it, as before.
revoke all on function public.gateway_open(uuid, text, text, text, text, text, jsonb, text, text[], text) from public, anon, authenticated;
grant execute on function public.gateway_open(uuid, text, text, text, text, text, jsonb, text, text[], text) to service_role;
