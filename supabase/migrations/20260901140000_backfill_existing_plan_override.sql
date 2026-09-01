-- Backfill plan_override for the accounts that predate the paywall.
--
-- 20260901120000 added the entitlement gate and the accompanying code change
-- removed the free tier: an account with no live Dodo subscription now has
-- PLANS.free — zero meetings — and cannot record at all. Every profile in
-- production at that moment had `subscription_status = 'none'`, so deploying
-- the gate silently took recording away from all of them, including the owner
-- and the one account with auto-join enabled (which would have skipped every
-- calendar meeting without telling anyone).
--
-- These are internal and design-partner accounts on an invite-only product
-- with public signup still closed, which is precisely the case
-- `profiles.plan_override` exists for. Scoped by creation time rather than by
-- address: this repository is public and must not carry a list of user emails.
--
-- Anyone created after this point goes through checkout like a customer.
UPDATE public.profiles
   SET plan_override = 'pro'
 WHERE plan_override IS NULL
   AND created_at < '2026-09-01T12:00:00Z';
