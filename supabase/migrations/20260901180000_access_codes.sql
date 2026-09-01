-- Access codes — how a design partner gets the product free, for a while.
--
-- `profiles.plan_override` already grants a plan without going through
-- checkout, which is how internal accounts work. It has one problem for this
-- use: it never expires. Handing it out to early users would mean a permanent
-- free tier granted by hand, and someone would have to remember to take it
-- back. So overrides gain an expiry, and a code is the thing that sets it.
--
-- The invariant this table exists to hold: one person can redeem a given code
-- once, a code cannot be redeemed more times than it was minted for, and both
-- of those stay true when two requests arrive at the same instant. That is why
-- redemption is a SECURITY DEFINER function taking a row lock, not an
-- application-side read-then-write.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_override_expires_at timestamptz;

COMMENT ON COLUMN public.profiles.plan_override_expires_at IS
  'When plan_override stops applying. NULL means it never expires (internal accounts).';

CREATE TABLE IF NOT EXISTS public.access_codes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored upper-case; every lookup upper-cases the input, so the code is
  -- effectively case-insensitive without needing citext.
  code            text NOT NULL UNIQUE CHECK (code = upper(code) AND length(code) BETWEEN 6 AND 32),
  -- The plan the code grants. 'free' is not a plan you can grant.
  plan            text NOT NULL DEFAULT 'pro' CHECK (plan IN ('starter', 'pro', 'teams')),
  -- How long the grant lasts from the moment it is redeemed.
  duration_days   integer NOT NULL DEFAULT 90 CHECK (duration_days BETWEEN 1 AND 730),
  -- How many distinct users may redeem it. 1 = a personal code; higher = one
  -- code handed to a cohort.
  max_redemptions integer NOT NULL DEFAULT 1 CHECK (max_redemptions >= 1),
  redemptions     integer NOT NULL DEFAULT 0 CHECK (redemptions >= 0),
  -- The code itself stops working after this, whether or not it was redeemed.
  -- Distinct from duration_days: this is the offer's shelf life.
  expires_at      timestamptz,
  is_active       boolean NOT NULL DEFAULT true,
  -- Free-text: who it went to, which cohort, what we expect back.
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.access_code_redemptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_code_id uuid NOT NULL REFERENCES public.access_codes(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan           text NOT NULL,
  granted_until  timestamptz NOT NULL,
  redeemed_at    timestamptz NOT NULL DEFAULT now(),
  -- One redemption per person per code. This is the constraint that makes the
  -- race safe: a second concurrent attempt collides here rather than
  -- double-incrementing the counter.
  UNIQUE (access_code_id, user_id)
);

CREATE INDEX IF NOT EXISTS access_code_redemptions_user_idx
  ON public.access_code_redemptions (user_id, redeemed_at DESC);

-- Both tables are service-role only. RLS on with no policy = no anon/authed
-- access at all; the redeem function is SECURITY DEFINER and bypasses it.
-- Nobody gets to enumerate unredeemed codes.
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_code_redemptions ENABLE ROW LEVEL SECURITY;

/*
 * Redeem a code for a user, atomically.
 *
 * Returns { ok: true, plan, granted_until } or { ok: false, reason } — a
 * refusal is a normal result, not an exception, so the caller does not have to
 * parse error strings. The FOR UPDATE lock plus the UNIQUE(access_code_id,
 * user_id) index are what make two simultaneous redemptions of the last
 * remaining slot resolve to exactly one grant.
 *
 * An existing override is extended rather than replaced only when the new
 * grant reaches further out: redeeming a 30-day code must never shorten a
 * 90-day one already in force, and must never overwrite a NULL (permanent)
 * override on an internal account.
 */
CREATE OR REPLACE FUNCTION public.redeem_access_code(p_code text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code    public.access_codes%ROWTYPE;
  v_until   timestamptz;
  v_current timestamptz;
  v_has_override boolean;
BEGIN
  IF p_code IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_code
  FROM public.access_codes
  WHERE code = upper(btrim(p_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF NOT v_code.is_active THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'inactive');
  END IF;
  IF v_code.expires_at IS NOT NULL AND v_code.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  -- Already redeemed by this user: report the grant they have rather than
  -- refusing, so re-entering a code is harmless.
  SELECT granted_until INTO v_until
  FROM public.access_code_redemptions
  WHERE access_code_id = v_code.id AND user_id = p_user_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'already', true, 'plan', v_code.plan, 'granted_until', v_until
    );
  END IF;

  IF v_code.redemptions >= v_code.max_redemptions THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'exhausted');
  END IF;

  v_until := now() + make_interval(days => v_code.duration_days);

  INSERT INTO public.access_code_redemptions
    (access_code_id, user_id, plan, granted_until)
  VALUES (v_code.id, p_user_id, v_code.plan, v_until);

  UPDATE public.access_codes
  SET redemptions = redemptions + 1
  WHERE id = v_code.id;

  -- Never shorten or clobber an override that already reaches further.
  SELECT plan_override IS NOT NULL, plan_override_expires_at
    INTO v_has_override, v_current
  FROM public.profiles
  WHERE user_id = p_user_id;

  IF v_has_override AND v_current IS NULL THEN
    -- A permanent override (internal account) outranks any code.
    RETURN jsonb_build_object(
      'ok', true, 'plan', v_code.plan, 'granted_until', v_until, 'superseded', true
    );
  END IF;

  IF v_current IS NULL OR v_current < v_until THEN
    UPDATE public.profiles
    SET plan_override = v_code.plan,
        plan_override_expires_at = v_until
    WHERE user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'plan', v_code.plan, 'granted_until', v_until);
END;
$$;

-- Only the service role calls this; the edge function is the only entry point
-- and it authenticates the user first.
REVOKE ALL ON FUNCTION public.redeem_access_code(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_access_code(text, uuid) FROM anon, authenticated;
