/**
 * Unit tests for the plan gate. Pure parts only — plan resolution, the IST
 * billing period, and the allow/refuse decision against a stubbed supabase.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  checkRecordingAllowed,
  periodStart,
  PLANS,
  planForProfile,
  readUsage,
} from "../_shared/entitlements.ts";

const noEnv = () => undefined;

Deno.test("planForProfile: no profile or no subscription is free", () => {
  assertEquals(planForProfile(null, noEnv), "free");
  assertEquals(planForProfile({}, noEnv), "free");
  assertEquals(planForProfile({ subscription_status: "none" }, noEnv), "free");
});

Deno.test("planForProfile: non-entitling statuses stay free", () => {
  for (const status of ["paused", "on_hold", "expired", "failed"]) {
    assertEquals(planForProfile({ subscription_status: status }, noEnv), "free", status);
  }
});

Deno.test("planForProfile: active subscription falls back to starter", () => {
  assertEquals(planForProfile({ subscription_status: "active" }, noEnv), "starter");
});

Deno.test("planForProfile: DODO_DEFAULT_PAID_PLAN overrides the fallback", () => {
  const env = (k: string) => (k === "DODO_DEFAULT_PAID_PLAN" ? "pro" : undefined);
  assertEquals(planForProfile({ subscription_status: "active" }, env), "pro");
});

Deno.test("planForProfile: an unknown fallback plan degrades to starter, not a crash", () => {
  const env = (k: string) => (k === "DODO_DEFAULT_PAID_PLAN" ? "enterprise" : undefined);
  assertEquals(planForProfile({ subscription_status: "active" }, env), "starter");
});

Deno.test("planForProfile: product id map wins over the fallback", () => {
  const env = (k: string) =>
    k === "DODO_PLAN_PRODUCTS" ? '{"prod_abc":"pro"}' : undefined;
  assertEquals(
    planForProfile({ subscription_status: "active", subscription_product_id: "prod_abc" }, env),
    "pro",
  );
  // An id not in the map falls through to the default paid plan.
  assertEquals(
    planForProfile({ subscription_status: "active", subscription_product_id: "prod_zzz" }, env),
    "starter",
  );
});

Deno.test("planForProfile: malformed DODO_PLAN_PRODUCTS does not downgrade a payer", () => {
  const env = (k: string) => (k === "DODO_PLAN_PRODUCTS" ? "{not json" : undefined);
  assertEquals(
    planForProfile({ subscription_status: "active", subscription_product_id: "prod_abc" }, env),
    "starter",
  );
});

Deno.test("planForProfile: cancelled keeps the plan until the period ends", () => {
  const now = new Date("2026-09-01T00:00:00Z");
  assertEquals(
    planForProfile(
      { subscription_status: "cancelled", subscription_renews_at: "2026-09-20T00:00:00Z" },
      noEnv,
      now,
    ),
    "starter",
  );
  assertEquals(
    planForProfile(
      { subscription_status: "cancelled", subscription_renews_at: "2026-08-20T00:00:00Z" },
      noEnv,
      now,
    ),
    "free",
  );
  // No renewal date at all is not a licence to keep recording.
  assertEquals(planForProfile({ subscription_status: "cancelled" }, noEnv, now), "free");
});

Deno.test("planForProfile: plan_override beats everything", () => {
  assertEquals(planForProfile({ plan_override: "pro" }, noEnv), "pro");
  assertEquals(
    planForProfile({ plan_override: "teams", subscription_status: "expired" }, noEnv),
    "teams",
  );
  // A junk override is ignored rather than trusted.
  assertEquals(planForProfile({ plan_override: "unlimited" }, noEnv), "free");
});

Deno.test("periodStart: the IST calendar month, expressed in UTC", () => {
  // 2026-09-01 02:00 IST is still inside September in IST.
  assertEquals(
    periodStart(new Date("2026-08-31T20:30:00Z")),
    "2026-08-31T18:30:00.000Z",
  );
  // 2026-08-31 23:00 IST -> August's period.
  assertEquals(
    periodStart(new Date("2026-08-31T17:30:00Z")),
    "2026-07-31T18:30:00.000Z",
  );
});

/** Minimal supabase stub: profiles.maybeSingle() and a usage_events select. */
function stubSupabase(profile: unknown, usageRows: Array<{ kind: string; seconds: number }>) {
  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: profile }) }) }),
        };
      }
      if (table === "usage_events") {
        return {
          select: () => ({
            eq: () => ({ gte: () => Promise.resolve({ data: usageRows, error: null }) }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

Deno.test("readUsage sums meetings and seconds separately", async () => {
  const sb = stubSupabase(null, [
    { kind: "meeting_started", seconds: 0 },
    { kind: "meeting_started", seconds: 0 },
    { kind: "meeting_recorded", seconds: 900 },
    { kind: "meeting_recorded", seconds: 1800 },
  ]);
  assertEquals(await readUsage(sb, "u1"), { meetingsStarted: 2, recordedSeconds: 2700 });
});

Deno.test("free plan: refuses the sixth meeting of the month", async () => {
  const rows = Array.from({ length: 5 }, () => ({ kind: "meeting_started", seconds: 0 }));
  const decision = await checkRecordingAllowed(stubSupabase(null, rows), "u1");
  assert(!decision.allowed);
  assertEquals(decision.plan, "free");
  assertEquals(decision.code, "meeting_limit");
});

Deno.test("free plan: allows the fifth meeting", async () => {
  const rows = Array.from({ length: 4 }, () => ({ kind: "meeting_started", seconds: 0 }));
  const decision = await checkRecordingAllowed(stubSupabase(null, rows), "u1");
  assert(decision.allowed);
  assertEquals(decision.limits.maxMeetingSeconds, 45 * 60);
});

Deno.test("paid plan: included hours allow, overage band allows and is flagged", async () => {
  const profile = { subscription_status: "active" };
  const included = PLANS.starter.includedSeconds!;

  const under = await checkRecordingAllowed(
    stubSupabase(profile, [{ kind: "meeting_recorded", seconds: included - 60 }]),
    "u1",
  );
  assert(under.allowed);
  assertEquals(under.isOverage, false);

  const over = await checkRecordingAllowed(
    stubSupabase(profile, [{ kind: "meeting_recorded", seconds: included + 60 }]),
    "u1",
  );
  assert(over.allowed);
  assertEquals(over.isOverage, true);
});

Deno.test("paid plan: refuses past included + overage ceiling", async () => {
  const ceiling = PLANS.starter.includedSeconds! + PLANS.starter.overageSeconds;
  const decision = await checkRecordingAllowed(
    stubSupabase({ subscription_status: "active" }, [
      { kind: "meeting_recorded", seconds: ceiling },
    ]),
    "u1",
  );
  assert(!decision.allowed);
  assertEquals(decision.code, "hour_limit");
});

Deno.test("a usage read failure fails OPEN — a DB blip must not stop recording", async () => {
  const sb = {
    from(table: string) {
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) };
      }
      return {
        select: () => ({
          eq: () => ({ gte: () => Promise.resolve({ data: null, error: { message: "boom" } }) }),
        }),
      };
    },
  };
  const decision = await checkRecordingAllowed(sb, "u1");
  assert(decision.allowed);
});

Deno.test("every plan has a per-meeting ceiling Recall can enforce", () => {
  for (const [key, limits] of Object.entries(PLANS)) {
    assert(limits.maxMeetingSeconds > 0, `${key} has no per-meeting cap`);
    assert(limits.retentionDays > 0, `${key} has no retention window`);
  }
});
