import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  claimEmailDelivery,
  recordEmailDelivery,
  releaseEmailDelivery,
  SUMMARY_EMAIL_KIND,
} from "../_shared/email-delivery.ts";

/**
 * Minimal stand-in for the supabase-js query builder — only the chains
 * email-delivery.ts actually uses: insert().select().single(),
 * delete().eq(), update().eq().
 */
function fakeSupabase(opts: {
  insertResult?: { data?: unknown; error?: { code: string; message: string } };
  log?: string[];
}) {
  const log = opts.log ?? [];
  return {
    log,
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          log.push(`insert:${table}:${JSON.stringify(row)}`);
          const result = opts.insertResult ?? { data: { id: "claim-1" }, error: null };
          return {
            select: () => ({ single: () => Promise.resolve(result) }),
          };
        },
        delete() {
          return {
            eq: (col: string, val: string) => {
              log.push(`delete:${table}:${col}=${val}`);
              return Promise.resolve({ error: null });
            },
          };
        },
        update(patch: Record<string, unknown>) {
          return {
            eq: (col: string, val: string) => {
              log.push(`update:${table}:${col}=${val}:${JSON.stringify(patch)}`);
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

Deno.test("claimEmailDelivery: first caller wins the slot", async () => {
  const db = fakeSupabase({});
  const claim = await claimEmailDelivery(db, "m1", "a@b.com");
  assertEquals(claim.claimed, true);
  assertEquals(claim.claimId, "claim-1");
  assertEquals(
    db.log[0],
    `insert:email_deliveries:${JSON.stringify({
      meeting_id: "m1",
      recipient_email: "a@b.com",
      kind: SUMMARY_EMAIL_KIND,
    })}`,
  );
});

Deno.test("claimEmailDelivery: unique violation means somebody already sent it", async () => {
  const db = fakeSupabase({
    insertResult: {
      error: { code: "23505", message: "duplicate key value violates unique constraint" },
    },
  });
  const claim = await claimEmailDelivery(db, "m1", "a@b.com");
  assertEquals(claim.claimed, false);
  assertEquals(claim.claimId, undefined);
});

Deno.test("claimEmailDelivery: unexpected DB errors fail OPEN, never swallow the summary", async () => {
  const db = fakeSupabase({
    insertResult: {
      error: { code: "42P01", message: 'relation "email_deliveries" does not exist' },
    },
  });
  const claim = await claimEmailDelivery(db, "m1", "a@b.com");
  assertEquals(claim.claimed, true);
  assertEquals(claim.degraded, true);
  assertEquals(claim.claimId, undefined);
});

Deno.test("claimEmailDelivery: kind separates automatic summaries from other mail", async () => {
  const db = fakeSupabase({});
  await claimEmailDelivery(db, "m1", "a@b.com", "digest_report");
  assertEquals(db.log[0].includes('"kind":"digest_report"'), true);
});

Deno.test("releaseEmailDelivery: deletes the claim, no-ops without an id", async () => {
  const db = fakeSupabase({});
  await releaseEmailDelivery(db, "claim-1");
  assertEquals(db.log, ["delete:email_deliveries:id=claim-1"]);
  await releaseEmailDelivery(db, undefined);
  assertEquals(db.log.length, 1);
});

Deno.test("recordEmailDelivery: stamps the provider id, no-ops when either is missing", async () => {
  const db = fakeSupabase({});
  await recordEmailDelivery(db, "claim-1", "resend-123");
  assertEquals(db.log, [
    'update:email_deliveries:id=claim-1:{"provider_message_id":"resend-123"}',
  ]);
  await recordEmailDelivery(db, "claim-1", undefined);
  await recordEmailDelivery(db, undefined, "resend-123");
  assertEquals(db.log.length, 1);
});
