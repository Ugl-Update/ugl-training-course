// Account management for the admin page (admin.html). Only signed-in admins can use it.
//
// POST { action: "create",   username, password, admin? } -> { id, username }
// POST { action: "password", user_id, password }           -> { ok }
//
// People sign in with a plain username; behind the scenes the account is <username>@ugldispatch.com
// (see ugl-config.js). Every change is written to security_events as kind "admin".
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ORIGINS = ["https://ugl-update.github.io"];
const DOMAIN = "ugldispatch.com";
const USERNAME = /^[a-z0-9][a-z0-9._-]{1,31}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function passwordProblem(p: unknown) {
  if (typeof p !== "string" || p.length < 8) return "Use a password of at least 8 characters.";
  if (p.length > 72) return "Use a password of at most 72 characters.";
  return null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await db.auth.getUser(token) : { data: null };
  const me = auth?.user;
  if (!me) return json({ error: "Please sign in again." }, 401);
  const { data: isAdmin } = await db.from("admins").select("user_id").eq("user_id", me.id).maybeSingle();
  if (!isAdmin) return json({ error: "Only admins can manage accounts." }, 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const ua = (req.headers.get("user-agent") || "").slice(0, 400);
  const log = (detail: Record<string, unknown>) =>
    db.from("security_events").insert({ user_id: me.id, kind: "admin", detail, ip, ua });

  if (body.action === "create") {
    const username = String(body.username || "").trim().toLowerCase();
    if (!USERNAME.test(username)) {
      return json({ error: "Usernames are 2 to 32 characters: letters, numbers, dots, dashes or underscores, starting with a letter or number." }, 400);
    }
    const problem = passwordProblem(body.password);
    if (problem) return json({ error: problem }, 400);
    const { data, error } = await db.auth.admin.createUser({
      email: `${username}@${DOMAIN}`, password: body.password, email_confirm: true,
    });
    if (error || !data.user) {
      const taken = /already|exists|registered/i.test(error?.message || "");
      return json({ error: taken ? "That username is already taken." : "Could not create the account: " + (error?.message || "unknown error") }, taken ? 409 : 500);
    }
    if (body.admin === true) await db.from("admins").insert({ user_id: data.user.id });
    await log({ action: "create-user", username, admin: body.admin === true });
    return json({ id: data.user.id, username });
  }

  if (body.action === "password") {
    const id = String(body.user_id || "");
    if (!UUID.test(id)) return json({ error: "Bad request." }, 400);
    const problem = passwordProblem(body.password);
    if (problem) return json({ error: problem }, 400);
    const { data, error } = await db.auth.admin.updateUserById(id, { password: body.password });
    if (error || !data.user) return json({ error: "Could not change the password: " + (error?.message || "unknown error") }, 500);
    await log({ action: "reset-password", username: (data.user.email || "").replace("@" + DOMAIN, "") });
    return json({ ok: true });
  }

  return json({ error: "Bad request." }, 400);
});
