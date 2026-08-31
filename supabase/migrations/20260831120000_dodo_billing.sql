-- Dodo Payments billing: subscription state on profiles + webhook idempotency ledger.
--
-- billing_events is the claim table for dodo-webhook: Dodo retries delivery up to
-- 8 times with the same webhook-id, so the UNIQUE(event_id) insert is what makes
-- processing exactly-once (same pattern as email_deliveries).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS dodo_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS dodo_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_product_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_renews_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS profiles_dodo_subscription_idx
  ON public.profiles (dodo_subscription_id)
  WHERE dodo_subscription_id IS NOT NULL;

CREATE TABLE public.billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  subscription_id TEXT,
  user_id UUID,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX billing_events_subscription_idx
  ON public.billing_events (subscription_id)
  WHERE subscription_id IS NOT NULL;

-- Service-role only: RLS on, no policies (same posture as monitor_events).
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
