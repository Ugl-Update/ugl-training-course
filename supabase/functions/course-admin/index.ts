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
const SOURCES = "ugl-update/ugl-training-sources";   // private content repo
const SITE_REPO = "ugl-update/ugl-training-course";  // public site shell
const SAFE_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._\- ()]{1,150}$/;

// Which bucket a workflow may write, decided from the repository and branch in its OIDC token:
//   sources repo, main          -> "course"          the live content (private)
//   sources repo, other branch  -> "course-staging"  content the staging site reads (private, admins only)
//   site repo, other branch     -> "staging-site"    the staging copy of the site shell (public files)
// The site repo's main never writes anywhere: GitHub Pages publishes it.
async function bucketFor(req: Request): Promise<string | null> {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, { issuer: ISSUER, audience: AUDIENCE });
    const repo = String(payload.repository || "").toLowerCase(), ref = String(payload.ref || "");
    if (!ref.startsWith("refs/heads/")) return null;
    if (repo === SOURCES) return ref === "refs/heads/main" ? "course" : "course-staging";
    if (repo === SITE_REPO && ref !== "refs/heads/main") return "staging-site";
    return null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const bucket = await bucketFor(req);
  if (!bucket) return new Response("forbidden", { status: 403 });

  const path = new URL(req.url).searchParams.get("path") || "";
  if (!SAFE_PATH.test(path) || path.includes("..")) return new Response("bad path", { status: 400 });

  if (req.method === "PUT") {
    const type = req.headers.get("content-type") || "application/octet-stream";
    const { error } = await db.storage.from(bucket).upload(path, await req.arrayBuffer(), {
      // The staging shell is fetched straight from the bucket, so keep its cache short: a push shows within a minute.
      contentType: type, upsert: true, cacheControl: bucket === "staging-site" ? "60" : "3600",
    });
    return error ? new Response(error.message, { status: 500 }) : new Response("ok " + bucket);
  }
  if (req.method === "DELETE") {
    const { error } = await db.storage.from(bucket).remove([path]);
    return error ? new Response(error.message, { status: 500 }) : new Response("ok " + bucket);
  }
  return new Response("method", { status: 405 });
});
