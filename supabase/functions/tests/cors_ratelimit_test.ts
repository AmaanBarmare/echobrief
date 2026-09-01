/**
 * The CORS origin allowlist, and the rate limiter's in-memory fallback.
 *
 * The database-backed path is covered by the pipeline harness against a real
 * project; what is worth unit-testing here is the origin matching (a security
 * boundary that used to trust every *.vercel.app) and that the fallback still
 * counts correctly when Postgres is unreachable.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from "../_shared/rate-limit.ts";

const PROD = "https://echobrief.in";

Deno.test("CORS: production and www origins are echoed back", () => {
  for (const origin of ["https://echobrief.in", "https://www.echobrief.in"]) {
    assertEquals(getCorsHeaders(origin)["Access-Control-Allow-Origin"], origin);
  }
});

Deno.test("CORS: localhost dev ports are allowed", () => {
  for (const origin of ["http://localhost:5173", "http://localhost:3000", "http://localhost:8080"]) {
    assertEquals(getCorsHeaders(origin)["Access-Control-Allow-Origin"], origin);
  }
});

Deno.test("CORS: our own Vercel previews are allowed", () => {
  for (const origin of [
    "https://echobrief-abc123.vercel.app",
    "https://echobrief-git-main-oltaflock-ai.vercel.app",
  ]) {
    assertEquals(getCorsHeaders(origin)["Access-Control-Allow-Origin"], origin, origin);
  }
});

Deno.test("CORS: someone else's vercel.app is NOT allowed", () => {
  // The whole point of the change: this namespace is not ours.
  for (const origin of [
    "https://evil.vercel.app",
    "https://echobrief.vercel.app.evil.com",
    "https://notechobrief-x.vercel.app",
    "http://echobrief-abc.vercel.app",
    "https://echobrief-abc.vercel.app.attacker.net",
  ]) {
    assertEquals(getCorsHeaders(origin)["Access-Control-Allow-Origin"], PROD, origin);
  }
});

Deno.test("CORS: a null or unknown origin falls back to production", () => {
  assertEquals(getCorsHeaders(null)["Access-Control-Allow-Origin"], PROD);
  assertEquals(getCorsHeaders("https://example.com")["Access-Control-Allow-Origin"], PROD);
});

Deno.test("getClientIdentifier prefers Cloudflare, then real-ip, then forwarded-for", () => {
  const h = (init: Record<string, string>) => new Request("https://x.test", { headers: init });
  assertEquals(getClientIdentifier(h({ "cf-connecting-ip": "1.1.1.1", "x-real-ip": "2.2.2.2" })), "1.1.1.1");
  assertEquals(getClientIdentifier(h({ "x-real-ip": "2.2.2.2" })), "2.2.2.2");
  assertEquals(getClientIdentifier(h({ "x-forwarded-for": "3.3.3.3, 4.4.4.4" })), "3.3.3.3");
  assertEquals(getClientIdentifier(h({})), "unknown");
});

Deno.test("rate limit fallback counts and then refuses", async () => {
  // No SUPABASE_URL/SERVICE_ROLE_KEY in the test env, so this exercises the
  // in-memory fallback — the path that runs when Postgres is unreachable.
  const key = `unit-test:${crypto.randomUUID()}`;
  const config = { maxRequests: 3, windowSeconds: 60 };

  for (let i = 0; i < 3; i++) {
    const r = await checkRateLimit(key, config);
    assert(r.allowed, `request ${i + 1} should be allowed`);
    assertEquals(r.remaining, 2 - i);
  }
  const over = await checkRateLimit(key, config);
  assert(!over.allowed, "the fourth request must be refused");
  assertEquals(over.remaining, 0);
  assert(over.resetIn > 0 && over.resetIn <= 60);
});

Deno.test("rate limit keys are independent", async () => {
  const config = { maxRequests: 1, windowSeconds: 60 };
  const a = `unit-a:${crypto.randomUUID()}`;
  const b = `unit-b:${crypto.randomUUID()}`;
  assert((await checkRateLimit(a, config)).allowed);
  assert(!(await checkRateLimit(a, config)).allowed);
  // b has its own budget.
  assert((await checkRateLimit(b, config)).allowed);
});

Deno.test("LLM presets are tighter than the general API preset", () => {
  assert(RATE_LIMITS.LLM.maxRequests < RATE_LIMITS.API.maxRequests);
  assert(RATE_LIMITS.LLM_HEAVY.maxRequests < RATE_LIMITS.LLM.maxRequests);
});
