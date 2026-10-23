// Content gateway: the only way to get course files out of the private bucket.
//
// POST { action: "open",  module, path, part?, signals }  -> { url, etag, size, flags }
// POST { action: "event", kind, module?, detail? }         -> { ok }
//
// Every request is checked and logged on the server (public.access_log / security_events),
// so a trainee cannot skip the log, fake their progress or pull files with a script:
//   - the caller must be a signed-in, non-blocked user;
//   - crawlers, AI fetchers, HTTP libraries, headless and WebDriver-controlled browsers are refused;
//   - a request without the browser signals module.html sends is refused;
//   - too many files in a short time is refused (rate and bulk-download limits in gateway_open);
//   - people with an access limit (public.user_access) only get the items it allows.
// The file itself comes from a signed URL that expires after 60 seconds.
//
// Auto-block: a refusal that can only come from a machine (script, bot, AI or automated browser,
// a request from outside the course page, lessons pulled faster than anyone reads) blocks the
// account itself, and so does the third copy / print / save attempt within a day (the first two
// get a warning). Admins are never blocked automatically. Each auto-block is logged as
// security_events kind "auto-block" and emailed to the admin when RESEND_API_KEY and ALERT_EMAIL
// are set (ALERT_FROM optional).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const BUCKET = "course";
const ORIGINS = ["https://ugl-update.github.io"];

// Never a trainee's browser: crawlers, AI fetchers, HTTP libraries, automation and headless browsers.
const BLOCK_UA =
  /HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium|webdriver|python-requests|python-urllib|aiohttp|httpx|Scrapy|curl\/|Wget|Go-http-client|okhttp|Java\/|libwww|node-fetch|undici|axios|Deno\/|Bun\/|GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|Claude-SearchBot|Claude-Web|anthropic-ai|PerplexityBot|Perplexity-User|Google-Extended|GoogleOther|Bytespider|CCBot|Amazonbot|Applebot-Extended|cohere-ai|Diffbot|YouBot|meta-externalagent|FacebookBot|Timpibot|ImagesiftBot|\bbot\b|crawler|spider/i;
// Browsers built around an AI agent. They usually report a plain Chrome user agent, so this only
// catches the ones that name themselves; the behaviour checks catch the rest.
const AGENT_UA = /ChatGPT Atlas|\bAtlas\/\d|\bComet\/\d|Perplexity|\bDia\/\d|Genspark|Fellou|Opera Neon/i;
const EVENT_KINDS = ["copy", "print", "save", "view"];

// Refusals that block the account, with what the person and the admin are told.
const AUTO_BLOCK: Record<string, string> = {
  "bot-or-script": "Course material was fetched by a script or download tool.",
  "automated-browser": "The course was opened in a browser controlled by a program.",
  "ai-browser": "The course was opened in an AI browser.",
  "not-a-browser": "Course material was requested from outside the course page.",
  "not-the-course-site": "Course material was requested from another website or tool.",
  "too-many-requests": "Too many lessons were pulled in a few minutes.",
  "bulk-download": "Too many lessons were pulled in a few minutes.",
  "repeated-copy": "Repeated attempts to copy, save or print course material.",
};
// Copy, print and save attempts: two warnings, the third within 24 hours blocks. Attempts made
// before the warnings existed do not count.
const STRIKE_KINDS = ["copy", "print", "save"];
const STRIKES = 3;
const STRIKES_SINCE = Date.parse("2026-10-23T03:00:00Z");
const SITE = "https://ugl-update.github.io/ugl-training-course/";

async function isAdmin(id: string) {
  const { data } = await db.from("admins").select("user_id").eq("user_id", id).maybeSingle();
  return !!data;
}

// Email the admin through Resend. Without the secrets this does nothing; it never holds up a reply
// for more than a few seconds.
async function notify(subject: string, text: string) {
  const key = Deno.env.get("RESEND_API_KEY"), to = Deno.env.get("ALERT_EMAIL");
  if (!key || !to) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("ALERT_FROM") || "UGL Training Course <onboarding@resend.dev>",
        to: to.split(",").map((s) => s.trim()).filter(Boolean), subject, text,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* the event is logged either way */ }
}

// Block the account: blocked_users row, Supabase ban (signs them out everywhere), log, email.
// Returns false for admins, who are never blocked automatically.
async function autoBlock(user: { id: string; email?: string }, reason: string, ctx: { module: string | null; ip: string; ua: string; extra?: Record<string, unknown> }) {
  if (await isAdmin(user.id)) return false;
  const why = AUTO_BLOCK[reason];
  const { error } = await db.from("blocked_users").insert({ user_id: user.id, reason: "Blocked automatically: " + why, blocked_by: null });
  const fresh = !error;
  if (error && error.code !== "23505") return false;
  await db.auth.admin.updateUserById(user.id, { ban_duration: "876000h" });
  if (!fresh) return true;
  const username = (user.email || "").replace(/@.*$/, "");
  await db.from("security_events").insert({
    user_id: user.id, kind: "auto-block", module: ctx.module ? ctx.module.slice(0, 80) : null,
    detail: { reason, why, ...(ctx.extra || {}) }, ip: ctx.ip.slice(0, 80), ua: ctx.ua,
  });
  await notify(
    `Course access blocked: ${username}`,
    `${username} was blocked automatically on the training course.\n\n` +
      `What happened: ${why}\n` +
      (ctx.module ? `Lesson: ${ctx.module}\n` : "") +
      `When: ${new Date().toUTCString()}\n` +
      `Address: ${ctx.ip || "unknown"}\n` +
      `Browser: ${ctx.ua || "unknown"}\n\n` +
      `They were signed out and cannot sign in until you unblock them: Admin page, their row, Unblock.\n${SITE}admin.html\n`,
  );
  return true;
}
const SAFE_PATH = /^[A-Za-z0-9._\-\/ ()]{1,200}$/;
const SIGNAL_KEYS = ["ua", "wd", "headless", "langs", "plat", "tz", "scr", "touch", "hc", "brands"];

// The site's catalog (ugl-catalog.js) says which file belongs to which item and whether it is a lesson
// or a tool. Read from the live site, one item per line, and kept for 5 minutes.
const CATALOG_URL = "https://ugl-update.github.io/ugl-training-course/ugl-catalog.js";
type Item = { id: string; section: string; path: string };
let catalog: { at: number; items: Map<string, Item> } | null = null;
async function loadCatalog(): Promise<Map<string, Item> | null> {
  if (catalog && Date.now() - catalog.at < 300_000) return catalog.items;
  try {
    const res = await fetch(CATALOG_URL, { headers: { "Cache-Control": "no-cache" } });
    if (!res.ok) return catalog?.items ?? null;
    const items = new Map<string, Item>();
    for (const line of (await res.text()).split("\n")) {
      const m = line.match(/\{\s*id:\s*'([^']+)'.*?section:\s*'([^']+)'.*?path:\s*'([^']+)'/);
      if (m && !/hidden:\s*true/.test(line)) items.set(m[1], { id: m[1], section: m[2], path: m[3] });
    }
    if (items.size < 5) return catalog?.items ?? null;
    catalog = { at: Date.now(), items };
    return items;
  } catch {
    return catalog?.items ?? null;
  }
}

// null = allowed; otherwise the refusal reason. Only called for people who have a limit.
async function accessProblem(limit: { mode: string; items: string[] }, module: string, path: string, part: string) {
  const items = await loadCatalog();
  if (!items) return "no-access";
  const it = items.get(module);
  if (!it) return "no-access";
  const expected = part === "audio" ? "audio/" + it.path.replace(/\.html$/, ".pack") : it.path;
  if (path !== expected) return "no-access";
  if (limit.mode === "tools") return it.section === "tools" ? null : "no-access";
  return (limit.items || []).includes(it.id) ? null : "no-access";
}

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "bad-request" }, 400); }
  if (!body || typeof body !== "object") return json({ error: "bad-request" }, 400);

  // Beacons sent while a page closes cannot set headers, so page reports may carry the token in the body.
  const header = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const token = header || (body.action === "event" && typeof body.token === "string" ? body.token : "");
  if (!token) return json({ error: "signin" }, 401);
  const { data: auth, error: authErr } = await db.auth.getUser(token);
  const user = auth?.user;
  if (authErr || !user) return json({ error: "signin" }, 401);
  const ua = (req.headers.get("user-agent") || "").slice(0, 400);
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "").split(",")[0].trim();

  if (body.action === "event") {
    const kind = String(body.kind || "");
    if (!EVENT_KINDS.includes(kind)) return json({ error: "bad-request" }, 400);
    let detail = body.detail ?? null;
    if (detail !== null && JSON.stringify(detail).length > 2000) detail = { truncated: true };
    const module = body.module ? String(body.module) : null;
    await db.rpc("gateway_event", { p_user: user.id, p_kind: kind, p_module: module, p_detail: detail, p_ip: ip, p_ua: ua });
    if (!STRIKE_KINDS.includes(kind) || await isAdmin(user.id)) return json({ ok: true });
    const since = new Date(Math.max(Date.now() - 86_400_000, STRIKES_SINCE)).toISOString();
    const { count } = await db.from("security_events").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).in("kind", STRIKE_KINDS).gte("at", since);
    const strikes = count ?? 0;
    if (strikes < STRIKES) return json({ ok: true, strikes, limit: STRIKES });
    const blocked = await autoBlock(user, "repeated-copy", { module, ip, ua, extra: { strikes, last: kind } });
    return json({ ok: true, strikes, limit: STRIKES, blocked, why: AUTO_BLOCK["repeated-copy"] });
  }

  if (body.action !== "open") return json({ error: "bad-request" }, 400);
  const path = String(body.path || "");
  const part = body.part === "audio" ? "audio" : "main";
  if (!SAFE_PATH.test(path) || path.includes("..")) return json({ error: "bad-request" }, 400);

  // Decide what to refuse outright, and what only to flag for the admin.
  const s = body.signals && typeof body.signals === "object" ? body.signals : null;
  let block: string | null = null;
  const flags: string[] = [];
  if (!origin || !ORIGINS.includes(origin)) block = "not-the-course-site";
  else if (!s) block = "not-a-browser";
  else if (BLOCK_UA.test(ua) || BLOCK_UA.test(String(s.ua || ""))) block = "bot-or-script";
  else if (s.wd === true || s.headless === true) block = "automated-browser";
  else if (AGENT_UA.test(ua) || AGENT_UA.test(String(s.ua || ""))) block = "ai-browser";
  if (!block) {
    // If the limit cannot be read, refuse rather than treat the person as unlimited.
    const { data: limit, error: limitErr } = await db.from("user_access").select("mode,items").eq("user_id", user.id).maybeSingle();
    if (limitErr) return json({ error: "server" }, 500);
    if (limit) block = await accessProblem(limit, String(body.module || ""), path, part);
  }
  if (s) {
    if (s.ua && s.ua !== ua) flags.push("user-agent-mismatch");
    if (s.langs === 0) flags.push("headless-hints");
  }
  // Keep only the known signal fields, each short, for the log.
  const signals = s
    ? Object.fromEntries(SIGNAL_KEYS.filter((k) => k in s).map((k) => {
      const v = s[k];
      return [k, typeof v === "number" || typeof v === "boolean" ? v : String(v).slice(0, 300)];
    }))
    : null;

  const { data: verdict, error } = await db.rpc("gateway_open", {
    p_user: user.id, p_module: body.module ? String(body.module) : null, p_path: path, p_part: part,
    p_ip: ip, p_ua: ua, p_signals: signals, p_block: block, p_flags: flags,
  });
  if (error || !verdict) return json({ error: "server" }, 500);
  if (!verdict.allowed) {
    const reason = String(verdict.reason || "");
    if (Object.hasOwn(AUTO_BLOCK, reason) && await autoBlock(user, reason, { module: body.module ? String(body.module) : null, ip, ua, extra: { path } })) {
      return json({
        error: "blocked", reason: "auto-blocked", why: AUTO_BLOCK[reason],
        message: "Your access has been blocked. This incident has been forwarded to the admin.",
      }, 403);
    }
    return json({ error: "blocked", reason }, reason === "not-found" ? 404 : 403);
  }

  const { data: signed, error: signErr } = await db.storage.from(BUCKET).createSignedUrl(path, 60);
  if (signErr || !signed) return json({ error: "server" }, 500);
  return json({ url: signed.signedUrl, etag: verdict.etag, size: verdict.size, flags: verdict.flags });
});
