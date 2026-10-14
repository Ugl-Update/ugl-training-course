// Failed sign-ins: the login page (ugl-login.js) reports each wrong username/password here, so the
// admin page can show who tried to get into which account. No sign-in is needed (the caller has just
// failed one); requests from other sites are ignored and each address is capped at 30 reports an hour.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ORIGINS = ["https://ugl-update.github.io"];
const LOGIN = /^[a-z0-9._@-]{1,80}$/;

Deno.serve(async (req) => {
  const done = new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": ORIGINS[0] } });
  if (req.method !== "POST" || !ORIGINS.includes(req.headers.get("origin") || "")) return done;
  let login = "";
  try { login = String((JSON.parse(await req.text()) || {}).login || "").trim().toLowerCase(); } catch { return done; }
  if (!LOGIN.test(login)) return done;
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  await db.rpc("report_failed_signin", { p_login: login, p_ip: ip, p_ua: (req.headers.get("user-agent") || "").slice(0, 400) });
  return done;
});
