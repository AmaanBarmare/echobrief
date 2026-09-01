/**
 * Client-side mirror of the plan limits.
 *
 * The authority is `supabase/functions/_shared/entitlements.ts` — that is what
 * actually refuses a recording. This copy exists so the usage meter can render
 * without a round trip, and the numbers must match it exactly. The pricing page
 * (`src/components/landing/Pricing.tsx`) is the third copy; all three change
 * together or none of them do.
 */

export type PlanKey = 'free' | 'starter' | 'pro' | 'teams';

export interface PlanLimits {
  label: string;
  meetingsPerPeriod: number | null;
  includedSeconds: number | null;
  overageSeconds: number;
  maxMeetingSeconds: number;
  retentionDays: number;
}

const HOUR = 3600;

export const PLANS: Record<PlanKey, PlanLimits> = {
  free: {
    label: 'Free',
    meetingsPerPeriod: 5,
    includedSeconds: null,
    overageSeconds: 0,
    maxMeetingSeconds: 45 * 60,
    retentionDays: 14,
  },
  starter: {
    label: 'Starter',
    meetingsPerPeriod: null,
    includedSeconds: 10 * HOUR,
    overageSeconds: 10 * HOUR,
    maxMeetingSeconds: 4 * HOUR,
    retentionDays: 30,
  },
  pro: {
    label: 'Pro',
    meetingsPerPeriod: null,
    includedSeconds: 25 * HOUR,
    overageSeconds: 25 * HOUR,
    maxMeetingSeconds: 4 * HOUR,
    retentionDays: 90,
  },
  teams: {
    label: 'Teams',
    meetingsPerPeriod: null,
    includedSeconds: 100 * HOUR,
    overageSeconds: 100 * HOUR,
    maxMeetingSeconds: 6 * HOUR,
    retentionDays: 365,
  },
};

const ENTITLED_STATUSES = new Set(['active', 'cancelled']);

/** Mirrors `planForProfile` in entitlements.ts, minus the Dodo product map. */
export function planForProfile(profile: {
  subscription_status?: string | null;
  subscription_renews_at?: string | null;
  plan_override?: string | null;
} | null): PlanKey {
  if (!profile) return 'free';
  const override = profile.plan_override;
  if (override && override in PLANS) return override as PlanKey;

  const status = (profile.subscription_status || '').toLowerCase();
  if (!ENTITLED_STATUSES.has(status)) return 'free';
  if (status === 'cancelled') {
    const renews = profile.subscription_renews_at
      ? Date.parse(profile.subscription_renews_at)
      : NaN;
    if (!Number.isFinite(renews) || renews <= Date.now()) return 'free';
  }
  // The server may resolve a paid subscription to a higher plan via the Dodo
  // product map; showing Starter here is the conservative floor.
  return 'starter';
}

/** Start of the current billing period — the IST calendar month, as ISO. */
export function periodStart(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * HOUR * 1000);
  return new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 5.5 * HOUR * 1000,
  ).toISOString();
}

export function formatHours(seconds: number): string {
  const hours = seconds / HOUR;
  return hours >= 10 ? `${Math.round(hours)}` : hours.toFixed(1).replace(/\.0$/, '');
}
