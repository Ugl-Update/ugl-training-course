// Bucket sync: lets the private content repo's GitHub Action upload built files to the
// private "course" bucket, so nobody has to upload them by hand.
//
//   PUT    ?path=pages/x.html   body = file bytes, Content-Type = file type   -> upsert
//   DELETE ?path=pages/x.html                                               -> remove
//
// There is no password to leak: each call carries a short-lived GitHub OIDC token, and only a
// workflow running on the main branch of Ugl-Update/ugl-training-sources can get one that passes.
// The function can only write to the course bucket; it cannot read files or touch the database.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ISSUER = "https://token.actions.githubusercontent.com";
const JWKS = createRemoteJWKSet(new URL(ISSUER + "/.well-known/jwks"));
const AUDIENCE = "ugl-course-sync";
const REPOSITORY = "ugl-update/ugl-training-sources";
const SAFE_PATH = /^(?:[A-Za-z0-9._-]+\/)?[A-Za-z0-9._\- ()]{1,150}$/;

async function fromSourcesRepo(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: ISSUER, audience: AUDIENCE });
    return String(payload.repository || "").toLowerCase() === REPOSITORY && payload.ref === "refs/heads/main";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (!(await fromSourcesRepo(req))) return new Response("forbidden", { status: 403 });

  const path = new URL(req.url).searchParams.get("path") || "";
  if (!SAFE_PATH.test(path) || path.includes("..")) return new Response("bad path", { status: 400 });

  if (req.method === "PUT") {
    const type = req.headers.get("content-type") || "application/octet-stream";
    const { error } = await db.storage.from("course").upload(path, await req.arrayBuffer(), {
      contentType: type, upsert: true, cacheControl: "3600",
    });
    return error ? new Response(error.message, { status: 500 }) : new Response("ok");
  }
  if (req.method === "DELETE") {
    const { error } = await db.storage.from("course").remove([path]);
    return error ? new Response(error.message, { status: 500 }) : new Response("ok");
  }
  return new Response("method", { status: 405 });
});
