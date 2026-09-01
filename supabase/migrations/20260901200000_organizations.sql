-- Team workspaces.
--
-- The pricing page sold a ₹7,999 Team tier against a database where every
-- policy was `auth.uid() = user_id` — no organisation, no roles, no sharing.
-- The tier was pulled back to "talk to us" in the audit fixes; this is the
-- schema that lets it come back.
--
-- Three decisions are baked in here:
--
-- 1. MEETINGS ARE PRIVATE BY DEFAULT. Joining a workspace does not expose your
--    meetings to it. A meeting reaches colleagues only through an explicit
--    `meeting_shares` row with scope='org' — the same primitive as a public
--    link. Anything else would make the privacy-zone work pointless: there is
--    no sense in carefully excluding pre-call chatter from a summary and then
--    publishing every 1:1 to a shared library.
--
-- 2. ONE WORKSPACE PER USER, enforced by a unique index on org_members.user_id.
--    Multi-workspace membership makes pooled quota ambiguous (whose hours did
--    that meeting spend?) and doubles the UI. It can be relaxed later by
--    dropping one index; it cannot easily be added later.
--
-- 3. EVERY MEMBERSHIP QUESTION GOES THROUGH A SECURITY DEFINER FUNCTION. A
--    policy on org_members that asks "am I a member of this org?" by selecting
--    from org_members is infinite recursion, and Postgres reports it as a
--    confusing error at query time rather than at definition time. The helpers
--    below run as owner and bypass RLS, which is the only way to ask the
--    question once.

CREATE TABLE IF NOT EXISTS public.organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_name_length CHECK (length(btrim(name)) BETWEEN 1 AND 80)
);

CREATE TABLE IF NOT EXISTS public.org_members (
  org_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

-- Decision 2 above. Also what makes "the caller's org" a single value.
CREATE UNIQUE INDEX IF NOT EXISTS org_members_one_org_per_user
  ON public.org_members (user_id);

CREATE TABLE IF NOT EXISTS public.org_invites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Stored lowercased; the unique index below relies on it.
  email      text NOT NULL,
  role       text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Same shape and reasoning as share tokens: sha256 of 256 random bits, shown
  -- once in the invite email and unrecoverable afterwards.
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_invites_email_format
    CHECK (email = lower(email)
           AND email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
           AND length(email) <= 254),
  CONSTRAINT org_invites_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

-- One live invite per address per org. A second invite to the same person is
-- a resend, not a new fact.
CREATE UNIQUE INDEX IF NOT EXISTS org_invites_pending_unique
  ON public.org_invites (org_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS org_invites_token_idx ON public.org_invites (token_hash);

-- The FK that 20260901180000 could not declare, because organizations did not
-- exist yet. Without it an org share could point at nothing.
ALTER TABLE public.meeting_shares
  DROP CONSTRAINT IF EXISTS meeting_shares_org_id_fkey;
ALTER TABLE public.meeting_shares
  ADD CONSTRAINT meeting_shares_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Membership helpers. SECURITY DEFINER so they bypass RLS: every one of these
-- is called FROM a policy, and a policy that re-enters the table it protects
-- recurses.
--
-- `SET search_path = public` on each: a SECURITY DEFINER function without a
-- pinned search_path can be hijacked by a caller-controlled path.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.my_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT org_id FROM public.org_members WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.my_org_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.org_members WHERE user_id = auth.uid();
$$;

/** True when the caller may administer the given org. */
CREATE OR REPLACE FUNCTION public.is_org_admin(p_org uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
     WHERE org_id = p_org AND user_id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

/**
 * True when this meeting has been explicitly shared to an org the caller
 * belongs to. The one bridge between a meeting and a colleague.
 */
CREATE OR REPLACE FUNCTION public.meeting_shared_to_my_org(p_meeting uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.meeting_shares s
      JOIN public.org_members m ON m.org_id = s.org_id
     WHERE s.meeting_id = p_meeting
       AND s.scope = 'org'
       AND s.revoked_at IS NULL
       AND (s.expires_at IS NULL OR s.expires_at > now())
       AND m.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.my_org_id() FROM public;
REVOKE ALL ON FUNCTION public.my_org_role() FROM public;
REVOKE ALL ON FUNCTION public.is_org_admin(uuid) FROM public;
REVOKE ALL ON FUNCTION public.meeting_shared_to_my_org(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.my_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_org_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.meeting_shared_to_my_org(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_invites   ENABLE ROW LEVEL SECURITY;

-- Members can see their own workspace. Creating, renaming and deleting go
-- through `manage-organization` with the service role, so there is no INSERT
-- or UPDATE policy: a browser must not be able to add itself to an org.
DROP POLICY IF EXISTS organizations_select_own ON public.organizations;
CREATE POLICY organizations_select_own ON public.organizations
  FOR SELECT TO authenticated USING (id = public.my_org_id());

-- Members can see who else is in their workspace. Note this uses the helper,
-- not a self-select — the recursion trap named at the top of this file.
DROP POLICY IF EXISTS org_members_select_same_org ON public.org_members;
CREATE POLICY org_members_select_same_org ON public.org_members
  FOR SELECT TO authenticated USING (org_id = public.my_org_id());

-- Admins can see pending invites for their workspace. Accepting one happens in
-- `accept-org-invite` against a token, not by reading this table.
DROP POLICY IF EXISTS org_invites_select_admin ON public.org_invites;
CREATE POLICY org_invites_select_admin ON public.org_invites
  FOR SELECT TO authenticated USING (public.is_org_admin(org_id));

-- The whole point: a meeting explicitly shared to my workspace becomes
-- readable. Everything else stays `auth.uid() = user_id`.
DROP POLICY IF EXISTS meetings_select_shared_to_org ON public.meetings;
CREATE POLICY meetings_select_shared_to_org ON public.meetings
  FOR SELECT TO authenticated USING (public.meeting_shared_to_my_org(id));

DROP POLICY IF EXISTS meeting_insights_select_shared_to_org ON public.meeting_insights;
CREATE POLICY meeting_insights_select_shared_to_org ON public.meeting_insights
  FOR SELECT TO authenticated USING (public.meeting_shared_to_my_org(meeting_id));

-- Deliberately NOT extended to `transcripts`. An org share grants the same
-- surface as a public link — summary, decisions, action items — because the
-- transcript carries the pre/post-meeting zones that `zones.ts` exists to keep
-- out of what other people read, and RLS cannot filter elements inside a JSONB
-- array. Sharing a transcript with colleagues needs its own opt-in and its own
-- zone-stripping read path.

COMMENT ON TABLE public.organizations IS
  'A team workspace. Membership is one org per user; meetings are private '
  'until explicitly shared to the org via meeting_shares(scope=org).';
