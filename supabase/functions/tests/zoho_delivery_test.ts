/**
 * `deliverToZoho`, against a stubbed database and a stubbed Zoho.
 *
 * This runs unattended after every meeting and writes into someone's system of
 * record, so the assertions that matter are the refusals: writing twice, writing
 * for a harness meeting, writing when nobody in the room is in the CRM, and
 * throwing — which would fail a meeting whose insights are already saved.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { deliverToZoho } from "../_shared/zoho-delivery.ts";

interface Op { op: string; table: string; row?: Record<string, unknown> }

function fakeSupabase(conn: Record<string, unknown> | null, claimError: { code: string } | null = null) {
  const ops: Op[] = [];
  const from = (table: string) => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () => Promise.resolve({ data: table === "zoho_connections" ? conn : null }),
      insert: (row: Record<string, unknown>) => {
        ops.push({ op: "insert", table, row });
        return Promise.resolve({ error: claimError });
      },
      update: (row: Record<string, unknown>) => {
        ops.push({ op: "update", table, row });
        return chain;
      },
      then: (res: (v: unknown) => void) => res({ data: null, error: null }),
    };
    return chain;
  };
  return { client: { from } as any, ops };
}

function mockZoho(replies: Array<{ status?: number; body?: unknown }>) {
  const calls: string[] = [];
  const original = globalThis.fetch;
  let i = 0;
  globalThis.fetch = ((url: string | URL) => {
    calls.push(String(url));
    const r = replies[Math.min(i++, replies.length - 1)];
    const status = r.status ?? 200;
    return Promise.resolve(
      status === 204 ? new Response(null, { status: 204 })
                     : new Response(JSON.stringify(r.body ?? {}), { status }),
    );
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const connected = {
  id: "z-1",
  user_id: "u-1",
  access_token: "1000.access",
  refresh_token: "1000.refresh",
  // Comfortably in the future, so no refresh is attempted.
  token_expiry: new Date(Date.now() + 3600_000).toISOString(),
  api_domain: "https://www.zohoapis.in",
  location: "in",
  needs_reconnect: false,
};
// Owner is @oltaflock.ai; the client is external and is the one that matters.
const meeting = {
  id: "m-1",
  user_id: "u-1",
  title: "Ryan Travels",
  attendees: [
    { email: "khush@oltaflock.ai", self: true, organizer: true },
    { email: "mathew@ryantravel.test" },
  ],
};
const insights = { summary_short: "Agreed to send a proposal." };

const FOUND = { body: { data: [{ id: "111", Full_Name: "Mathew Ryan" }] } };
const NOTE_OK = { body: { data: [{ status: "success", details: { id: "999" } }] } };

Deno.test("zoho delivery: no connection writes nothing and calls nothing", async () => {
  const db = fakeSupabase(null);
  const z = mockZoho([FOUND]);
  try {
    assertEquals(await deliverToZoho(db.client, meeting, insights), { written: 0, reason: "not_connected" });
    assertEquals(z.calls.length, 0);
    assertEquals(db.ops.length, 0);
  } finally { z.restore(); }
});

Deno.test("zoho delivery: a meeting with no external attendee never reaches the API", async () => {
  // Manually started bot meetings carry no attendee list at all, and an
  // internal-only meeting has nobody to match. Both are ordinary, not errors.
  const db = fakeSupabase(connected);
  const z = mockZoho([FOUND]);
  try {
    assertEquals(
      await deliverToZoho(db.client, { ...meeting, attendees: [] }, insights),
      { written: 0, reason: "no_external_attendees" },
    );
    assertEquals(
      await deliverToZoho(db.client, {
        ...meeting,
        attendees: [{ email: "khush@oltaflock.ai", self: true }, { email: "vineet@oltaflock.ai" }],
      }, insights),
      { written: 0, reason: "no_external_attendees" },
    );
    assertEquals(z.calls.length, 0);
  } finally { z.restore(); }
});

Deno.test("zoho delivery: a harness meeting never touches a real CRM", async () => {
  const db = fakeSupabase(connected);
  const z = mockZoho([FOUND]);
  try {
    const r = await deliverToZoho(db.client, { ...meeting, title: "[harness] pipeline" }, insights);
    assertEquals(r, { written: 0, reason: "harness_meeting" });
    assertEquals(z.calls.length, 0);
    assertEquals(db.ops.filter((o) => o.op === "insert").length, 0);
  } finally { z.restore(); }
});

Deno.test("zoho delivery: the claim is inserted before the note is written", async () => {
  const db = fakeSupabase(connected);
  const z = mockZoho([FOUND, NOTE_OK]);
  try {
    assertEquals(await deliverToZoho(db.client, meeting, insights), { written: 1 });
    const claim = db.ops[0];
    assertEquals(claim.op, "insert");
    assertEquals(claim.table, "zoho_deliveries");
    assertEquals(claim.row?.record_id, "111");
    assertEquals(claim.row?.module, "Contacts");
    assertEquals(claim.row?.matched_email, "mathew@ryantravel.test");
    // Search, then note — in that order.
    assertEquals(z.calls[0].includes("/Contacts/search"), true);
    assertEquals(z.calls[1].includes("/Contacts/111/Notes"), true);
    assertEquals(db.ops.some((o) => o.row?.note_id === "999"), true);
  } finally { z.restore(); }
});

Deno.test("zoho delivery: a regeneration loses the claim and writes no second note", async () => {
  const db = fakeSupabase(connected, { code: "23505" });
  const z = mockZoho([FOUND, NOTE_OK]);
  try {
    assertEquals(await deliverToZoho(db.client, meeting, insights), { written: 0, reason: "no_match" });
    // The search happened; the note did not.
    assertEquals(z.calls.length, 1);
    assertEquals(z.calls.some((c) => c.includes("/Notes")), false);
  } finally { z.restore(); }
});

Deno.test("zoho delivery: an attendee who is not in the CRM is skipped quietly", async () => {
  const db = fakeSupabase(connected);
  const z = mockZoho([{ status: 204 }, { status: 204 }]);
  try {
    assertEquals(await deliverToZoho(db.client, meeting, insights), { written: 0, reason: "no_match" });
    assertEquals(db.ops.filter((o) => o.op === "insert").length, 0);
  } finally { z.restore(); }
});

Deno.test("zoho delivery: a revoked grant flags needs_reconnect and stops", async () => {
  const db = fakeSupabase(connected);
  const z = mockZoho([{ status: 401, body: { code: "INVALID_TOKEN", message: "invalid oauth token" } }]);
  try {
    const r = await deliverToZoho(db.client, meeting, insights);
    assertEquals(r.written, 0);
    assertEquals(r.reason, "INVALID_TOKEN");
    assertEquals(db.ops.some((o) => o.table === "zoho_connections" && o.row?.needs_reconnect === true), true);
  } finally { z.restore(); }
});

Deno.test("zoho delivery: an expired access token is refreshed before the lookup", async () => {
  Deno.env.set("ZOHO_CLIENT_ID", "cid");
  Deno.env.set("ZOHO_CLIENT_SECRET", "csec");
  // A refreshed token is SEALED before it is written back, so this test needs a
  // real key — without one the refresh path degrades to `refresh_failed`, which
  // is correct behaviour but would leave the refresh itself untested.
  const hadKey = Deno.env.get("TOKEN_ENCRYPTION_KEY");
  Deno.env.set("TOKEN_ENCRYPTION_KEY", btoa(String.fromCharCode(...new Uint8Array(32).fill(7))));
  const db = fakeSupabase({ ...connected, token_expiry: new Date(Date.now() - 1000).toISOString() });
  const z = mockZoho([
    { body: { access_token: "1000.fresh", expires_in: 3600 } },
    FOUND,
    NOTE_OK,
  ]);
  try {
    assertEquals(await deliverToZoho(db.client, meeting, insights), { written: 1 });
    assertEquals(z.calls[0].includes("accounts.zoho.in/oauth/v2/token"), true);
    // The refreshed token is persisted, or every meeting pays for a refresh.
    assertEquals(db.ops.some((o) => o.table === "zoho_connections" && "access_token" in (o.row ?? {})), true);
  } finally {
    z.restore();
    Deno.env.delete("ZOHO_CLIENT_ID");
    Deno.env.delete("ZOHO_CLIENT_SECRET");
    if (hadKey) Deno.env.set("TOKEN_ENCRYPTION_KEY", hadKey);
    else Deno.env.delete("TOKEN_ENCRYPTION_KEY");
  }
});

Deno.test("zoho delivery: a database failure is swallowed, never thrown", async () => {
  const exploding = { from: () => { throw new Error("connection terminated"); } } as any;
  assertEquals(await deliverToZoho(exploding, meeting, insights), { written: 0, reason: "error" });
});
