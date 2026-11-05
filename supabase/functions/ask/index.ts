// Ask the Course: answers an updater's question from the course text only.
//
// POST { question, passages: [passage ids] } -> { answer, sources: [{ t, u }], remaining }
//                                             |  { error: "not-configured" | "limit" | "busy" | "signin" | ... }
//
// The page (pages/ask.html, built by tools/road.py) searches the course itself and sends the ids of
// the best passages; the text of those passages is taken from the server's copy of the index
// (course bucket, ask/index.json), never from the request. The model only sees those passages and
// the question, with instructions to answer from them alone and to say so when they do not cover
// it. Every question and answer is logged (public.ask_log) so the admin can read what was asked and
// correct the course where the answers are weak.
//
// Secrets: GROQ_API_KEY (console.groq.com; the free tier is enough for a team), optional ASK_MODEL
// (default openai/gpt-oss-120b) and ASK_DAILY (questions per person per day, default 40).
// Without GROQ_API_KEY the function answers { error: "not-configured" } and the page shows the
// passages instead.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const BUCKET = "course";
const ORIGINS = ["https://ugl-update.github.io"];
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = Deno.env.get("ASK_MODEL") || "openai/gpt-oss-120b";
const DAILY = Math.max(1, Number(Deno.env.get("ASK_DAILY") || 40));
const MAX_PASSAGES = 8;

const SYSTEM = [
  "You help load updaters at a US trucking dispatch company (UGL). You answer ONLY from the course passages you are given.",
  "Write plain English in short sentences: the reader speaks English as a second language. No greetings, no filler.",
  "If the passages do not answer the question, reply exactly: The course does not cover this. Ask your manager.",
  "Never invent a number, a rule, a time limit or a message. When a passage contains a message template, quote it word for word.",
  "After each fact, give the passage number in square brackets, like [2]. Keep the answer under 120 words unless a template needs more.",
  "The passages are the company's rules. If the question suggests breaking one of them, say what the rule is.",
].join(" ");

type Passage = { id: string; t: string; u: string; x: string };
let index: { at: number; byId: Map<string, Passage> } | null = null;
async function loadIndex(): Promise<Map<string, Passage> | null> {
  if (index && Date.now() - index.at < 600_000) return index.byId;
  const { data, error } = await db.storage.from(BUCKET).download("ask/index.json");
  if (error || !data) return index?.byId ?? null;
  try {
    const parsed = JSON.parse(await data.text()) as { passages: Passage[] };
    index = { at: Date.now(), byId: new Map(parsed.passages.map((p) => [p.id, p])) };
    return index.byId;
  } catch {
    return index?.byId ?? null;
  }
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

async function log(row: Record<string, unknown>) {
  try { await db.from("ask_log").insert(row); } catch { /* the answer still goes back */ }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!origin || !ORIGINS.includes(origin)) return json({ error: "origin" }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad-request" }, 400); }
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "signin" }, 401);
  const { data: auth, error: authErr } = await db.auth.getUser(token);
  const user = auth?.user;
  if (authErr || !user) return json({ error: "signin" }, 401);
  const { data: blocked } = await db.from("blocked_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (blocked) return json({ error: "blocked" }, 403);

  const question = String(body.question || "").trim().slice(0, 500);
  if (question.length < 3) return json({ error: "bad-request" }, 400);
  const ids = Array.isArray(body.passages) ? body.passages.filter((x) => typeof x === "string").slice(0, MAX_PASSAGES) : [];

  // One day's questions per person: the free tier is shared by the whole team.
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db.from("ask_log").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("ok", true).gte("at", since);
  const used = count ?? 0;
  if (used >= DAILY) return json({ error: "limit", remaining: 0 }, 429);

  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) return json({ error: "not-configured" }, 503);
  const byId = await loadIndex();
  if (!byId) return json({ error: "no-index" }, 503);
  const passages = ids.map((id) => byId.get(id)).filter((p): p is Passage => !!p);
  if (!passages.length) return json({ error: "no-passages" }, 400);

  const context = passages.map((p, i) => `[${i + 1}] ${p.t}\n${p.x}`).join("\n\n");
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: 450,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Course passages:\n\n${context}\n\nQuestion from an updater: ${question}` },
        ],
      }),
    });
  } catch {
    clearTimeout(timer);
    await log({ user_id: user.id, question, model: MODEL, ms: Date.now() - started, ok: false, error: "timeout" });
    return json({ error: "busy" }, 504);
  }
  clearTimeout(timer);
  if (!res.ok) {
    const err = res.status === 429 ? "busy" : "upstream";
    await log({ user_id: user.id, question, model: MODEL, ms: Date.now() - started, ok: false, error: `${err} ${res.status}` });
    return json({ error: err }, res.status === 429 ? 429 : 502);
  }
  const out = await res.json().catch(() => null);
  const answer = String(out?.choices?.[0]?.message?.content || "").trim();
  if (!answer) {
    await log({ user_id: user.id, question, model: MODEL, ms: Date.now() - started, ok: false, error: "empty" });
    return json({ error: "upstream" }, 502);
  }
  // The passages the answer cites become its "read it in" links; none cited means the two best ones.
  const cited = [...new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]) - 1))].filter((i) => i >= 0 && i < passages.length);
  const pick = (cited.length ? cited : [0, 1]).map((i) => passages[i]).filter(Boolean);
  const seen = new Set<string>();
  const sources = pick.filter((p) => !seen.has(p.u + p.t) && seen.add(p.u + p.t)).map((p) => ({ t: p.t, u: p.u }));
  await log({ user_id: user.id, question, answer, sources, model: MODEL, ms: Date.now() - started, ok: true });
  return json({ answer, sources, remaining: Math.max(0, DAILY - used - 1) });
});
