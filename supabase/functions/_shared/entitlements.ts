/**
 * Plan limits and the gate that enforces them.
 *
 * Every path that starts a Recall bot spends real money — Recall bot-hours,
 * then Sarvam minutes, then a GPT chain of facts → synthesis → validation →
 * coaching. Until this module existed nothing checked whether the account was
 * entitled to spend it, and the caps printed on the pricing page were
 * decorative. The two entry points that must call `checkRecordingAllowed`
 * before creating a bot are `start-recall-recording` and `auto-join-meetings`.
 *
 * The numbers here are the contract shown to customers on the pricing page.
 * Change them in both places or not at all. `free` is the exception: it is not
 * sold, it is the no-subscription state, and it grants nothing.
 */

export type PlanKey = "free" | "starter" | "pro" | "teams";

export interface PlanLimits {
  label: string;
  /** Hard ceiling on meetings started per billing period. null = no count cap. */
  meetingsPerPeriod: number | null;
  /** Included recorded seconds per billing period. null = counted by meetings instead. */
  includedSeconds: number | null;
  /**
   * Extra recorded seconds allowed past `includedSeconds`, billed as overage.
   * The pricing page promises Starter "₹129/hr overage, capped at +10 hrs".
   * Pro says "₹99/hr after that" with no stated ceiling, so we impose one —
   * an uncapped paid plan is still an uncapped spend channel.
   */
  overageSeconds: number;
  /** Hard per-meeting recording limit, handed to Recall as automatic_leave. */
  maxMeetingSeconds: number;
  /** Days transcripts and insights are kept. Enforced by the prune cron. */
  retentionDays: number;
}

const HOUR = 3600;

export const PLANS: Record<PlanKey, PlanLimits> = {
  // Not a plan you can buy — the state an account is in with no live
  // subscription. There is no free tier: the pricing page sells Starter, Pro
  // and Teams only, so an unsubscribed account records nothing. Design
  // partners and internal accounts get in via `profiles.plan_override`.
  free: {
    label: "No plan",
    meetingsPerPeriod: 0,
    includedSeconds: null,
    overageSeconds: 0,
    maxMeetingSeconds: 45 * 60,
    retentionDays: 14,
  },
  starter: {
    label: "Starter",
    meetingsPerPeriod: null,
    includedSeconds: 10 * HOUR,
    overageSeconds: 10 * HOUR,
    maxMeetingSeconds: 4 * HOUR,
    retentionDays: 30,
  },
  pro: {
    label: "Pro",
    meetingsPerPeriod: null,
    includedSeconds: 25 * HOUR,
    overageSeconds: 25 * HOUR,
    maxMeetingSeconds: 4 * HOUR,
    retentionDays: 90,
  },
  // Not self-serve. Present so a manually-provisioned account has somewhere to
  // point until the organisations schema exists.
  teams: {
    label: "Teams",
    meetingsPerPeriod: null,
    includedSeconds: 100 * HOUR,
    overageSeconds: 100 * HOUR,
    maxMeetingSeconds: 6 * HOUR,
    retentionDays: 365,
  },
};

/**
 * Statuses that still entitle an account. `cancelled` is deliberately included:
 * Dodo cancellations run to the end of the paid period, so the plan stays live
 * until `subscription_renews_at` passes (checked in `planForProfile`).
 */
const ENTITLED_STATUSES = new Set(["active", "cancelled"]);

export interface BillingProfile {
  subscription_status?: string | null;
  subscription_product_id?: string | null;
  subscription_renews_at?: string | null;
  plan_override?: string | null;
}

/**
 * Resolve which plan a profile is on.
 *
 * DODO_PLAN_PRODUCTS and DODO_PLAN_PRODUCTS_ANNUAL are JSON objects of
 * `{ "<dodo product id>": "pro" }` and the product id on the profile decides;
 * the two periods are merged because an annual Pro is still Pro. A subscription
 * whose product is in neither map falls back to DODO_DEFAULT_PAID_PLAN.
 */
export function planForProfile(
  profile: BillingProfile | null | undefined,
  env: (key: string) => string | undefined = (k) => Deno.env.get(k),
  now: Date = new Date(),
): PlanKey {
  if (!profile) return "free";

  // A manual override on the profile wins — how a design partner or an
  // internal account gets a plan without going through checkout.
  const override = profile.plan_override;
  if (override && override in PLANS) return override as PlanKey;

  const status = (profile.subscription_status || "").toLowerCase();
  if (!ENTITLED_STATUSES.has(status)) return "free";

  // A cancelled subscription keeps its plan only until the period it was paid
  // for actually ends.
  if (status === "cancelled") {
    const renews = profile.subscription_renews_at
      ? Date.parse(profile.subscription_renews_at)
      : NaN;
    if (!Number.isFinite(renews) || renews <= now.getTime()) return "free";
  }

  const productId = profile.subscription_product_id;
  if (productId) {
    // Both billing periods resolve to the same entitlement — an annual Pro
    // subscription is a Pro subscription.
    const mapped = { ...productMap("monthly", env), ...productMap("annual", env) }[productId];
    if (mapped && mapped in PLANS) return mapped as PlanKey;
  }

  const fallback = env("DODO_DEFAULT_PAID_PLAN") || "starter";
  return (fallback in PLANS ? fallback : "starter") as PlanKey;
}

/** The plans a customer can actually buy from checkout. */
export const SELLABLE_PLANS: PlanKey[] = ["starter", "pro"];

/** Billing periods a plan can be bought on. Same entitlement, different cadence. */
export type BillingPeriod = "monthly" | "annual";
export const BILLING_PERIODS: BillingPeriod[] = ["monthly", "annual"];

const PRODUCT_MAP_ENV: Record<BillingPeriod, string> = {
  monthly: "DODO_PLAN_PRODUCTS",
  annual: "DODO_PLAN_PRODUCTS_ANNUAL",
};

/** `{ "<dodo product id>": "starter" | "pro" }` for one billing period. */
function productMap(
  period: BillingPeriod,
  env: (key: string) => string | undefined,
): Record<string, string> {
  try {
    return JSON.parse(env(PRODUCT_MAP_ENV[period]) || "{}") as Record<string, string>;
  } catch {
    // A malformed env var must not knock every paying customer down to free.
    return {};
  }
}

/**
 * The Dodo product to sell for a plan on a billing period — the inverse of the
 * product maps `planForProfile` reads, so the same env vars define the mapping
 * in both directions and the two can never disagree.
 *
 * DODO_PRODUCT_ID stays the fallback for the single-product setup: it answers
 * for DODO_DEFAULT_PAID_PLAN (default "starter") when the map has no entry.
 */
export function productForPlan(
  plan: PlanKey,
  period: BillingPeriod = "monthly",
  env: (key: string) => string | undefined = (k) => Deno.env.get(k),
): string | null {
  if (!SELLABLE_PLANS.includes(plan)) return null;

  for (const [productId, mapped] of Object.entries(productMap(period, env))) {
    if (mapped === plan) return productId;
  }

  // Single-product setup: DODO_PRODUCT_ID answers for the default plan, monthly.
  const fallbackPlan = env("DODO_DEFAULT_PAID_PLAN") || "starter";
  if (period === "monthly" && plan === fallbackPlan) return env("DODO_PRODUCT_ID") || null;
  return null;
}

/**
 * Start of the current billing period, as an ISO string.
 *
 * Calendar month in IST — the rest of the product (due dates, cron schedules,
 * email subjects) already reasons in IST, and a user reading "5 meetings this
 * month" means their month, not UTC's.
 */
export function periodStart(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * HOUR * 1000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 5.5 * HOUR * 1000)
    .toISOString();
}

export interface UsageSnapshot {
  meetingsStarted: number;
  recordedSeconds: number;
}

/** Read this user's usage for the current billing period. */
export async function readUsage(
  supabase: any,
  userId: string,
  now: Date = new Date(),
): Promise<UsageSnapshot> {
  const since = periodStart(now);
  const { data, error } = await supabase
    .from("usage_events")
    .select("kind, seconds")
    .eq("user_id", userId)
    .gte("occurred_at", since);
  if (error) throw error;

  let meetingsStarted = 0;
  let recordedSeconds = 0;
  for (const row of (data ?? []) as Array<{ kind: string; seconds: number }>) {
    if (row.kind === "meeting_started") meetingsStarted += 1;
    else if (row.kind === "meeting_recorded") recordedSeconds += row.seconds || 0;
  }
  return { meetingsStarted, recordedSeconds };
}

export type EntitlementDecision =
  | {
      allowed: true;
      plan: PlanKey;
      limits: PlanLimits;
      usage: UsageSnapshot;
      /** Whether this recording starts inside the plan's overage band. */
      isOverage: boolean;
    }
  | {
      allowed: false;
      plan: PlanKey;
      limits: PlanLimits;
      usage: UsageSnapshot;
      reason: string;
      /** Machine-readable for the frontend's upgrade prompt. */
      code: "meeting_limit" | "hour_limit";
    };

/**
 * The gate. Call before creating a Recall bot; refuse with 402 when it says no.
 *
 * Fails OPEN on a usage read error for accounts that have an allowance — a
 * transient Postgres blip should not stop a paying customer recording, and
 * losing a little quota accounting is the cheaper failure. It does NOT fail
 * open for an account with a zero allowance: no subscription means no bot,
 * and a read error must not become a way to record for free.
 */
export async function checkRecordingAllowed(
  supabase: any,
  userId: string,
  now: Date = new Date(),
): Promise<EntitlementDecision> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_status, subscription_product_id, subscription_renews_at, plan_override")
    .eq("user_id", userId)
    .maybeSingle();

  const plan = planForProfile(profile as BillingProfile | null);
  const limits = PLANS[plan];

  let usage: UsageSnapshot;
  try {
    usage = await readUsage(supabase, userId, now);
  } catch (err) {
    const empty = { meetingsStarted: 0, recordedSeconds: 0 };
    if (limits.meetingsPerPeriod === 0) {
      console.error("[entitlements] usage read failed on a zero-allowance account, refusing:", err);
      return {
        allowed: false,
        plan,
        limits,
        usage: empty,
        code: "meeting_limit",
        reason: "This account has no active subscription. Choose a plan to start recording.",
      };
    }
    console.error("[entitlements] usage read failed, allowing:", err);
    return { allowed: true, plan, limits, usage: empty, isOverage: false };
  }

  if (limits.meetingsPerPeriod !== null && usage.meetingsStarted >= limits.meetingsPerPeriod) {
    return {
      allowed: false,
      plan,
      limits,
      usage,
      code: "meeting_limit",
      reason: limits.meetingsPerPeriod === 0
        ? "This account has no active subscription. Choose a plan to start recording."
        : `Your ${limits.label} plan includes ${limits.meetingsPerPeriod} meetings a month ` +
          `and you have used all of them. Upgrade to keep recording.`,
    };
  }

  if (limits.includedSeconds !== null) {
    const ceiling = limits.includedSeconds + limits.overageSeconds;
    if (usage.recordedSeconds >= ceiling) {
      return {
        allowed: false,
        plan,
        limits,
        usage,
        code: "hour_limit",
        reason:
          `Your ${limits.label} plan is capped at ${Math.round(ceiling / HOUR)} meeting-hours ` +
          `a month including overage, and you have reached it. Upgrade to keep recording.`,
      };
    }
    return {
      allowed: true,
      plan,
      limits,
      usage,
      isOverage: usage.recordedSeconds >= limits.includedSeconds,
    };
  }

  return { allowed: true, plan, limits, usage, isOverage: false };
}

/**
 * Append a usage row. Never throws — a bookkeeping failure must not fail the
 * recording the user is waiting on. A 23505 means the row is already there
 * (retry or replayed callback) and is the expected, correct no-op.
 */
export async function recordUsage(
  supabase: any,
  row: {
    userId: string;
    meetingId: string | null;
    kind: "meeting_started" | "meeting_recorded";
    seconds?: number;
    plan: PlanKey;
    isOverage?: boolean;
  },
): Promise<void> {
  const { error } = await supabase.from("usage_events").insert({
    user_id: row.userId,
    meeting_id: row.meetingId,
    kind: row.kind,
    seconds: Math.max(0, Math.round(row.seconds ?? 0)),
    plan: row.plan,
    is_overage: row.isOverage ?? false,
  });
  if (error && error.code !== "23505") {
    console.error("[entitlements] usage write failed:", error);
  }
}

/**
 * Ledger the duration a meeting actually recorded, once the pipeline knows it.
 *
 * Called from `afterInsightsSaved`, so it runs on every completion path
 * (Sarvam, Whisper fallback, and regeneration). Regeneration re-entering here
 * is harmless: the unique index on (meeting_id, kind) turns the second write
 * into the 23505 that `recordUsage` swallows.
 *
 * Never throws — accounting must not be able to fail a completed meeting.
 */
export async function recordRecordedSeconds(
  supabase: any,
  userId: string,
  meetingId: string,
  seconds: number,
): Promise<void> {
  if (!userId || !meetingId || !(seconds > 0)) return;
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_status, subscription_product_id, subscription_renews_at, plan_override")
      .eq("user_id", userId)
      .maybeSingle();
    const plan = planForProfile(profile as BillingProfile | null);
    const limits = PLANS[plan];

    // Overage is decided against usage BEFORE this meeting, which is what the
    // ledger holds at this moment — this row has not been written yet.
    let isOverage = false;
    if (limits.includedSeconds !== null) {
      const usage = await readUsage(supabase, userId);
      isOverage = usage.recordedSeconds >= limits.includedSeconds;
    }

    await recordUsage(supabase, {
      userId,
      meetingId,
      kind: "meeting_recorded",
      seconds,
      plan,
      isOverage,
    });
  } catch (err) {
    console.error("[entitlements] recordRecordedSeconds failed:", err);
  }
}
