-- Make a second factor mean something.
--
-- SecurityCard has let people enrol TOTP for weeks. Nothing ever asked for the
-- code again, and no policy cared: Supabase issues an aal1 session on a
-- password sign-in even for an enrolled account, and every RLS policy here asks
-- only whether the row belongs to the caller. So enrolment bought the
-- appearance of protection and none of the substance — a stolen password still
-- opened every meeting.
--
-- The app now shows a challenge screen (MfaChallenge), but a client-side gate
-- is a suggestion: the session it holds is a real aal1 JWT that talks to
-- PostgREST directly. The enforcement has to be here.
--
-- THE RULE, and why this shape is safe to ship: a user with no verified factor
-- is unaffected, because 'aal1' is acceptable for them. A user who HAS verified
-- a factor must present aal2. The asymmetry means this cannot lock out anyone
-- who has not opted in, and it takes effect the moment they do.
--
-- ALTER, not DROP + CREATE. The first draft of this migration invented policy
-- names ("Users can view own meetings") that do not exist here; the live ones
-- are below. DROP IF EXISTS would have quietly matched nothing and CREATE would
-- have added a SECOND permissive policy beside the original — and permissive
-- policies on the same command are ORed, so the result would have been zero
-- enforcement that looked exactly like success. Altering a policy by its real
-- name cannot fail silently: a wrong name is an error.

CREATE OR REPLACE FUNCTION public.mfa_satisfied()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
-- auth.mfa_factors is not readable by `authenticated`, so this runs as owner.
-- search_path is pinned: a SECURITY DEFINER function without one is a
-- privilege escalation waiting for a mutable search_path.
SET search_path = public, auth
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM auth.mfa_factors f
      WHERE f.user_id = auth.uid() AND f.status = 'verified'
    )
    THEN COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    ELSE true
  END;
$$;

COMMENT ON FUNCTION public.mfa_satisfied() IS
  'True when the caller has met their own MFA requirement: aal2 if they have a '
  'verified factor, always true if they have none. Used in RLS so an aal1 token '
  'cannot read meeting content once its owner has enrolled.';

GRANT EXECUTE ON FUNCTION public.mfa_satisfied() TO authenticated, anon;

-- The five SELECT policies that expose conversation content, with their quals
-- preserved exactly and the MFA condition ANDed on. Applied to the org-share
-- policies too: a colleague who has enrolled should not be able to skip their
-- own second factor by reading a meeting shared to their workspace.

ALTER POLICY "Users can view their own meetings" ON public.meetings
  USING (auth.uid() = user_id AND public.mfa_satisfied());

ALTER POLICY meetings_select_shared_to_org ON public.meetings
  USING (meeting_shared_to_my_org(id) AND public.mfa_satisfied());

ALTER POLICY "Users can view transcripts of their meetings" ON public.transcripts
  USING (
    EXISTS (
      SELECT 1 FROM public.meetings
      WHERE meetings.id = transcripts.meeting_id
        AND meetings.user_id = auth.uid()
    )
    AND public.mfa_satisfied()
  );

ALTER POLICY "Users can view insights of their meetings" ON public.meeting_insights
  USING (
    EXISTS (
      SELECT 1 FROM public.meetings
      WHERE meetings.id = meeting_insights.meeting_id
        AND meetings.user_id = auth.uid()
    )
    AND public.mfa_satisfied()
  );

ALTER POLICY meeting_insights_select_shared_to_org ON public.meeting_insights
  USING (meeting_shared_to_my_org(meeting_id) AND public.mfa_satisfied());

-- Deliberately NOT applied to profiles: a half-authenticated session still has
-- to load enough to render the challenge screen and sign out. Locking that
-- produces a broken app, not a secure one.
--
-- Nor to anything read with the service role — the pipeline, webhooks and the
-- MCP endpoint bypass RLS or mint their own scoped tokens, and none of them has
-- a human second factor to present.
