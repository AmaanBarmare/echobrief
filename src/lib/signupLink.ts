/**
 * Where a "get started" CTA points now that registration is open.
 *
 * A plan carried on the link is a hint, not an entitlement: it opens the Auth
 * page in sign-up mode and, once the account exists, lands the user on
 * Settings → Billing with that plan pre-selected. What they are actually
 * allowed to record is decided server-side by `_shared/entitlements.ts` off the
 * subscription Dodo confirms — never off this parameter.
 */
import type { PlanKey } from '@/lib/plans';

export function signupPath(plan?: PlanKey): string {
  return plan ? `/auth?signup=1&plan=${plan}` : '/auth?signup=1';
}

/** Where a signed-up user lands to pay. */
export function billingPath(plan?: PlanKey): string {
  return plan ? `/settings?tab=billing&plan=${plan}` : '/settings?tab=billing';
}
