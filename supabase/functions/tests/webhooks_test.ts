import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildWebhookPayload, signWebhook } from "../_shared/webhooks.ts";

Deno.test("signWebhook produces a Standard-Webhooks v1 HMAC over id.timestamp.body", async () => {
  const sig = await signWebhook("secret", "msg_1", 1700000000, "{}");
  assert(sig.startsWith("v1,"));
  // Reference: HMAC-SHA256(key, "msg_1.1700000000.{}") computed independently here.
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const ref = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("msg_1.1700000000.{}")));
  assertEquals(sig, `v1,${btoa(String.fromCharCode(...ref))}`);
  // Deterministic, and sensitive to the body.
  assertEquals(await signWebhook("secret", "msg_1", 1700000000, "{}"), sig);
  assert((await signWebhook("secret", "msg_1", 1700000000, "{\"a\":1}")) !== sig);
});

Deno.test("buildWebhookPayload is compact: no transcript, facts subset, app link", () => {
  const payload = buildWebhookPayload(
    "meeting.insights_ready",
    { id: "m1", title: "Call", start_time: "2026-08-28T04:00:00Z", user_id: "u", attendees: [] },
    {
      summary_short: "s",
      action_items: [{ task: "t" }],
      facts: { meeting_type: "sales_discovery", numbers: [{ metric: "TTV", value: "$5M" }], secret_field: 1 },
      coaching: { summary: "coach" },
      transcript: "SHOULD NOT LEAK",
    },
    "https://app",
  ) as Record<string, any>;
  assertEquals(payload.event, "meeting.insights_ready");
  assertEquals(payload.meeting.url, "https://app/meeting/m1");
  assertEquals(payload.facts.meeting_type, "sales_discovery");
  assertEquals(payload.facts.numbers.length, 1);
  assertEquals("secret_field" in payload.facts, false);
  assertEquals("transcript" in payload, false);
  assertEquals(payload.coaching_summary, "coach");
});
