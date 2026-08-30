/**
 * Unit tests for _shared/dodo.ts: Standard Webhooks signature verification and
 * the event-type → subscription_status mapping dodo-webhook relies on.
 */
import {
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  subscriptionStatusForEvent,
  verifyStandardWebhook,
} from "../_shared/dodo.ts";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

const SECRET_BYTES = new TextEncoder().encode("test-webhook-secret-material");
const SECRET = `whsec_${toBase64(SECRET_BYTES)}`;

async function sign(id: string, timestamp: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    SECRET_BYTES,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  return toBase64(new Uint8Array(mac));
}

const NOW = 1_700_000_000;
const BODY = JSON.stringify({ type: "subscription.active", data: { subscription_id: "sub_1" } });

Deno.test("verifyStandardWebhook accepts a valid v1-prefixed signature", async () => {
  const sig = await sign("msg_1", String(NOW), BODY);
  const ok = await verifyStandardWebhook(SECRET, {
    id: "msg_1",
    timestamp: String(NOW),
    signature: `v1,${sig}`,
  }, BODY, NOW);
  assertEquals(ok, true);
});

Deno.test("verifyStandardWebhook accepts an unprefixed signature among several", async () => {
  const sig = await sign("msg_1", String(NOW), BODY);
  const ok = await verifyStandardWebhook(SECRET, {
    id: "msg_1",
    timestamp: String(NOW),
    signature: `v1,bm90LXRoaXM= ${sig}`,
  }, BODY, NOW);
  assertEquals(ok, true);
});

Deno.test("verifyStandardWebhook rejects a tampered body", async () => {
  const sig = await sign("msg_1", String(NOW), BODY);
  const ok = await verifyStandardWebhook(SECRET, {
    id: "msg_1",
    timestamp: String(NOW),
    signature: `v1,${sig}`,
  }, BODY.replace("sub_1", "sub_2"), NOW);
  assertEquals(ok, false);
});

Deno.test("verifyStandardWebhook rejects a wrong secret", async () => {
  const sig = await sign("msg_1", String(NOW), BODY);
  const otherSecret = `whsec_${toBase64(new TextEncoder().encode("different-secret"))}`;
  const ok = await verifyStandardWebhook(otherSecret, {
    id: "msg_1",
    timestamp: String(NOW),
    signature: `v1,${sig}`,
  }, BODY, NOW);
  assertEquals(ok, false);
});

Deno.test("verifyStandardWebhook rejects a stale timestamp", async () => {
  const stale = String(NOW - 6 * 60);
  const sig = await sign("msg_1", stale, BODY);
  const ok = await verifyStandardWebhook(SECRET, {
    id: "msg_1",
    timestamp: stale,
    signature: `v1,${sig}`,
  }, BODY, NOW);
  assertEquals(ok, false);
});

Deno.test("verifyStandardWebhook rejects missing headers", async () => {
  const ok = await verifyStandardWebhook(SECRET, {
    id: null,
    timestamp: String(NOW),
    signature: "v1,abc",
  }, BODY, NOW);
  assertEquals(ok, false);
});

Deno.test("subscriptionStatusForEvent maps lifecycle events", () => {
  assertEquals(subscriptionStatusForEvent("subscription.active"), "active");
  assertEquals(subscriptionStatusForEvent("subscription.renewed"), "active");
  assertEquals(subscriptionStatusForEvent("subscription.unpaused"), "active");
  assertEquals(subscriptionStatusForEvent("subscription.plan_changed"), "active");
  assertEquals(subscriptionStatusForEvent("subscription.on_hold"), "on_hold");
  assertEquals(subscriptionStatusForEvent("subscription.paused"), "paused");
  assertEquals(subscriptionStatusForEvent("subscription.cancelled"), "cancelled");
  assertEquals(subscriptionStatusForEvent("subscription.expired"), "expired");
  assertEquals(subscriptionStatusForEvent("subscription.failed"), "failed");
});

Deno.test("subscriptionStatusForEvent returns null for non-status events", () => {
  assertEquals(subscriptionStatusForEvent("subscription.updated"), null);
  assertEquals(subscriptionStatusForEvent("subscription.update_payment_method"), null);
  assertEquals(subscriptionStatusForEvent("payment.succeeded"), null);
  assertEquals(subscriptionStatusForEvent("payment.failed"), null);
  assertEquals(subscriptionStatusForEvent("totally.unknown"), null);
});
