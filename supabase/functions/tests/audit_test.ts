/**
 * Tests for the audit writer.
 *
 * The properties worth defending: it never breaks the thing it audits, it never
 * stores a raw credential, and the network fields survive the shapes a proxy
 * chain actually produces — a bad inet cast would fail the insert and silently
 * cost the row we were trying to keep.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { recordAudit, requestActor } from "../_shared/audit.ts";

function fakeDb(sink: { rows: Record<string, unknown>[]; fail?: string }) {
  return {
    from(_table: string) {
      return {
        insert(row: Record<string, unknown>) {
          if (sink.fail) return Promise.resolve({ error: { message: sink.fail } });
          sink.rows.push(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

Deno.test("a share view is recorded with the token hashed, never stored raw", async () => {
  const sink = { rows: [] as Record<string, unknown>[] };
  const token = "ebs_live_supersecretsharetoken";
  await recordAudit(fakeDb(sink), {
    action: "share.viewed",
    actorType: "share_token",
    actorToken: token,
    resourceType: "meeting",
    resourceId: "11111111-1111-1111-1111-111111111111",
  });
  const row = sink.rows[0];
  assertEquals(row.action, "share.viewed");
  assertEquals(row.actor_user_id, null);
  assertEquals((row.actor_token_id as string).length, 64, "expected a sha256 hex digest");
  assert(!JSON.stringify(row).includes(token), "the raw token reached the row");
});

Deno.test("a failed insert does not throw — the audited operation must still succeed", async () => {
  const sink = { rows: [] as Record<string, unknown>[], fail: "permission denied" };
  await recordAudit(fakeDb(sink), { action: "share.revoked", actorType: "user", actorUserId: "u1" });
  // No assertion beyond "did not throw": that is the whole contract.
});

Deno.test("a database that throws outright is also survivable", async () => {
  const exploding = {
    from() {
      throw new Error("connection reset");
    },
  };
  await recordAudit(exploding, { action: "account.deleted", actorType: "user", actorUserId: "u1" });
});

Deno.test("requestActor takes the client from a proxy chain, not the proxy", () => {
  const req = new Request("https://example.test", {
    headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2", "user-agent": "Mozilla/5.0" },
  });
  const actor = requestActor(req);
  assertEquals(actor.ip, "203.0.113.7");
  assertEquals(actor.userAgent, "Mozilla/5.0");
});

Deno.test("a missing or malformed forwarded-for yields null, not a bad inet", () => {
  // An unparseable value would fail the insert's inet cast and cost the row.
  for (const value of ["", "unknown", "not an ip", "<script>"]) {
    const req = new Request("https://example.test", { headers: { "x-forwarded-for": value } });
    assertEquals(requestActor(req).ip, null, `${value} should not be treated as an address`);
  }
  assertEquals(requestActor(new Request("https://example.test")).ip, null);
});

Deno.test("an IPv6 client address survives", () => {
  const req = new Request("https://example.test", {
    headers: { "x-forwarded-for": "2001:db8::1, 10.0.0.1" },
  });
  assertEquals(requestActor(req).ip, "2001:db8::1");
});

Deno.test("a long user agent is truncated rather than rejected", () => {
  const req = new Request("https://example.test", { headers: { "user-agent": "x".repeat(2000) } });
  assertEquals(requestActor(req).userAgent!.length, 500);
});

Deno.test("result defaults to ok, and a denial can be recorded explicitly", async () => {
  const sink = { rows: [] as Record<string, unknown>[] };
  await recordAudit(fakeDb(sink), { action: "share.viewed", actorType: "anonymous" });
  await recordAudit(fakeDb(sink), {
    action: "recording.accessed",
    actorType: "user",
    actorUserId: "u1",
    result: "denied",
  });
  assertEquals(sink.rows[0].result, "ok");
  assertEquals(sink.rows[1].result, "denied");
});
