-- Teams becomes self-serve, priced per seat.
--
-- Until now `teams` existed in `_shared/entitlements.ts` with a flat 100-hour
-- allowance and no way to buy it: it was reachable only through
-- `profiles.plan_override`, set by hand. The pricing page showed ₹0 and a
-- contact form.
--
-- Per-seat pricing needs one fact the database did not hold: how many seats
-- were actually paid for. Dodo carries it as the subscription `quantity`, and
-- it is written here by `dodo-webhook` so that entitlement decisions never have
-- to call Dodo on the hot path of starting a recording.
--
-- Why it lives on `profiles` rather than on `organizations`: a workspace bills
-- on its OWNER's plan (`resolveBillingGroup`), and every other billing column —
-- subscription_status, dodo_subscription_id, subscription_product_id — is
-- already there. Splitting the seat count away from the subscription it belongs
-- to would create two places to disagree about what was bought.
--
-- NULL means "not a seat-priced subscription", which is every Starter and Pro
-- account. Only `teams` reads it, and `seatsForProfile` treats NULL as 1 so a
-- misconfigured Teams account degrades to a single seat rather than to
-- unlimited.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_quantity integer;

COMMENT ON COLUMN public.profiles.subscription_quantity IS
  'Paid seats on a per-seat (Teams) subscription, from the Dodo subscription quantity. NULL for flat-priced plans.';
