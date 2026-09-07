/**
 * Tests for the error reporting layer.
 *
 * Two properties, both load-bearing:
 *
 *  - It must never throw. This wraps every request handler; an observability
 *    layer that can fail the request it observes is worse than none.
 *  - It must never carry a credential to a third party. Error messages are the
 *    classic leak — a failed Google refresh puts the refresh token in the
 *    exception text, and this module ships that text to Sentry. The repo
 *    already has a pre-commit hook for logged secrets precisely because a live
 *    access token was logged for months.
 */
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { captureError, redact, withObservability } from "../_shared/observability.ts";

// No sinks configured: every test here exercises the "degrade quietly" path.
Deno.env.delete("SENTRY_DSN");
Deno.env.delete("SUPABASE_URL");
Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");

Deno.test("redact removes every credential shape the system handles", () => {
  const cases: [string, string][] = [
    ["failed with ya29.a0AfH6SMBxxxxxxxxxxxx", "google access token"],
    ["refresh_token=1//04abcdefghijklmnop rejected", "google refresh token"],
    ["Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9", "supabase jwt"],
    ["key sk-proj-abcdefghijklmnop failed", "openai key"],
    ["sbp_0102030405060708090a0b0c", "supabase pat"],
    ["whsec_abcdefghijklmnop mismatch", "webhook secret"],
    ["token eb_live_abcdefghijklmnop expired", "echobrief PAT"],
    ["share ebs_live_abcdefghijklmnop revoked", "share token"],
    ["v1.AAAAAAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB bad", "sealed credential"],
  ];
  for (const [input, label] of cases) {
    const out = redact(input);
    assertStringIncludes(out, "[redacted]", `${label} was not redacted: ${out}`);
  }
});

Deno.test("redact leaves ordinary error text alone", () => {
  const msg = "Sarvam returned state=Success with an empty transcript for chunk 3";
  assertEquals(redact(msg), msg);
});

Deno.test("captureError never throws, with no sinks configured", async () => {
  await captureError(new Error("boom"), { fn: "test-fn" });
  await captureError("a bare string", { fn: "test-fn", meetingId: crypto.randomUUID() });
  await captureError({ weird: true }, { fn: "test-fn", extra: { chunk: 3 } });
  await captureError(null, { fn: "test-fn" });
});

Deno.test("captureError survives a sink that rejects", async () => {
  Deno.env.set("SUPABASE_URL", "https://example.invalid");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "irrelevant");
  const original = globalThis.fetch;
  globalThis.fetch = () => Promise.reject(new Error("network is down"));
  try {
    // The point: a dead database must not turn one error into two.
    await captureError(new Error("original failure"), { fn: "test-fn" });
  } finally {
    globalThis.fetch = original;
    Deno.env.delete("SUPABASE_URL");
    Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  }
});

Deno.test("withObservability passes a successful response through untouched", async () => {
  const handler = withObservability("test-fn", () =>
    Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 201 })));
  const res = await handler(new Request("https://example.test/thing", { method: "POST" }));
  assertEquals(res.status, 201);
  assertEquals(await res.json(), { ok: true });
});

Deno.test("withObservability converts a thrown error into the same 500 these functions already returned", async () => {
  const handler = withObservability("test-fn", () => {
    throw new Error("unhandled");
  });
  const res = await handler(new Request("https://example.test/thing"));
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body, { error: "Internal error" });
});

Deno.test("a thrown credential does not reach the response body", async () => {
  const handler = withObservability("test-fn", () => {
    throw new Error("refresh failed for ya29.a0AfH6SMBsecretsecret");
  });
  const res = await handler(new Request("https://example.test/thing"));
  const text = await res.text();
  assert(!text.includes("ya29."), `credential leaked to the caller: ${text}`);
});
