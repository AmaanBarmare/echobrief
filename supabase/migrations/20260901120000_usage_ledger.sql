-- Usage ledger — the record that plan limits are enforced against.
--
-- Before this, nothing read `profiles.subscription_status` as a gate: Dodo wrote
-- it and the Settings card displayed it, and that was the whole lifecycle. A
-- free account could spawn unlimited Recall bots (billed per hour), unlimited
-- Sarvam minutes and unlimited GPT passes, and the meeting-hour caps printed on
-- the pricing page existed only on the pricing page.
--
-- Why a ledger rather than counting `meetings` rows: a user can delete a
-- meeting, and deriving quota from the meetings table would hand every account
-- a reset button. Hence `meeting_id ... ON DELETE SET NULL` below — the usage
-- row deliberately survives the meeting it describes.

CREATE TABLE IF NOT EXISTS public.usage_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- SET NULL, never CASCADE: deleting a meeting must not delete the evidence
  -- that it was recorded, or quota becomes self-service.
  meeting_id  uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
  kind        text NOT NULL CHECK (kind IN ('meeting_started', 'meeting_recorded')),
  -- 0 for 'meeting_started' (duration is unknown until the bot leaves);
  -- the real recorded duration for 'meeting_recorded'.
  seconds     integer NOT NULL DEFAULT 0 CHECK (seconds >= 0),
  -- The plan in force when the event happened, so a later upgrade or
  -- downgrade never rewrites history.
  plan        text NOT NULL DEFAULT 'free',
  -- True when this event was allowed past the plan's included allowance and
  -- into its overage band. What a metered invoice would be built from.
  is_overage  boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotency: the pipeline can retry, and Sarvam re-fires callbacks. One row
-- per meeting per kind, so a replay collides (23505) instead of double-billing.
CREATE UNIQUE INDEX IF NOT EXISTS usage_events_meeting_kind_key
  ON public.usage_events (meeting_id, kind)
  WHERE meeting_id IS NOT NULL;

-- The only read shape that matters: this user, this billing period.
CREATE INDEX IF NOT EXISTS usage_events_user_occurred_idx
  ON public.usage_events (user_id, occurred_at DESC);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

-- Users may read their own usage (the Settings usage meter). Nobody but the
-- service role writes it — an INSERT policy would let a client forge its own
-- quota, and the service role bypasses RLS entirely.
DROP POLICY IF EXISTS "users read own usage" ON public.usage_events;
CREATE POLICY "users read own usage"
  ON public.usage_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.usage_events IS
  'Append-only usage ledger. Enforced by _shared/entitlements.ts at the two '
  'entry points that spend money: start-recall-recording and auto-join-meetings.';

-- Manual plan assignment, for design partners and internal accounts that must
-- not go through Dodo checkout. `planForProfile` checks this before the
-- subscription status, so it is also the escape hatch if billing misfires.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_override text
    CHECK (plan_override IS NULL OR plan_override IN ('free', 'starter', 'pro', 'teams'));

COMMENT ON COLUMN public.profiles.plan_override IS
  'Overrides the Dodo-derived plan. NULL for normal accounts.';
