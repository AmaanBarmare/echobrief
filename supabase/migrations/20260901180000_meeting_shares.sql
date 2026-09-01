-- Sharing a meeting outside the account.
--
-- Nothing could leave an account: no share link, no clip, no PDF. That is a
-- product gap against every competitor, and it is also the cheapest acquisition
-- channel there is — a Fireflies summary forwarded to somebody with no account
-- is their entire growth loop.
--
-- One table serves both kinds of sharing, so adding workspaces later needs no
-- second mechanism and no change to how a meeting is read:
--   scope = 'link'  → anyone holding the URL (the token IS the credential)
--   scope = 'org'   → members of the organisation named by org_id
--
-- Meetings stay private by default. A meeting is shared only when a row here
-- says so, which is the decision that keeps privacy zones meaningful: it would
-- be strange to work this hard at excluding pre-call chatter from a summary and
-- then publish every meeting to a shared library by default.

CREATE TABLE IF NOT EXISTS public.meeting_shares (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id    uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  -- The user who created the share; also who is accountable for it existing.
  created_by    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope         text NOT NULL DEFAULT 'link' CHECK (scope IN ('link', 'org')),

  -- Link shares only. Stored exactly like api_tokens: an unsalted sha256 hex
  -- digest of a 256-bit token. The plaintext is shown once and is
  -- unrecoverable; 256 bits is not brute-forceable, so a KDF would only add
  -- latency to every page view.
  token_hash    text UNIQUE,
  token_prefix  text,

  -- Org shares only. The FK is added by the organisations migration; leaving it
  -- unconstrained here would let a share point at nothing.
  org_id        uuid,

  expires_at    timestamptz,
  revoked_at    timestamptz,
  view_count    integer NOT NULL DEFAULT 0,
  last_viewed_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),

  -- A link share is meaningless without a token, and an org share must not
  -- carry one — a stray token on an org share would be a public link nobody
  -- knew they had created.
  CONSTRAINT meeting_shares_link_has_token CHECK (
    (scope = 'link' AND token_hash IS NOT NULL AND token_prefix IS NOT NULL AND org_id IS NULL)
    OR
    (scope = 'org' AND token_hash IS NULL AND token_prefix IS NULL AND org_id IS NOT NULL)
  ),
  CONSTRAINT meeting_shares_hash_format CHECK (
    token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$'
  )
);

-- The lookup on every page view of a shared link.
CREATE INDEX IF NOT EXISTS meeting_shares_token_hash_idx
  ON public.meeting_shares (token_hash) WHERE token_hash IS NOT NULL;

-- "What have I shared, and is any of it still live?"
CREATE INDEX IF NOT EXISTS meeting_shares_meeting_idx
  ON public.meeting_shares (meeting_id) WHERE revoked_at IS NULL;

-- One org share per (meeting, org): sharing twice to the same workspace is the
-- same fact, not two.
CREATE UNIQUE INDEX IF NOT EXISTS meeting_shares_org_unique
  ON public.meeting_shares (meeting_id, org_id) WHERE scope = 'org';

ALTER TABLE public.meeting_shares ENABLE ROW LEVEL SECURITY;

-- Owners see and revoke their own shares. There is deliberately no INSERT
-- policy: only `manage-meeting-share` (service role) can mint a valid token,
-- so a browser cannot create a share for a meeting it does not own by writing
-- the row directly.
--
-- These policies reference only `created_by`, never `meetings`. That matters:
-- when the organisations migration makes `meetings` visibility depend on
-- `meeting_shares`, a policy here that read `meetings` back would close a
-- recursion loop and every query on either table would error.
DROP POLICY IF EXISTS meeting_shares_select_own ON public.meeting_shares;
CREATE POLICY meeting_shares_select_own ON public.meeting_shares
  FOR SELECT TO authenticated USING (auth.uid() = created_by);

DROP POLICY IF EXISTS meeting_shares_update_own ON public.meeting_shares;
CREATE POLICY meeting_shares_update_own ON public.meeting_shares
  FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS meeting_shares_delete_own ON public.meeting_shares;
CREATE POLICY meeting_shares_delete_own ON public.meeting_shares
  FOR DELETE TO authenticated USING (auth.uid() = created_by);

COMMENT ON TABLE public.meeting_shares IS
  'Explicit shares of a meeting. scope=link is a public URL whose token is the '
  'credential; scope=org grants read to an organisation. Meetings are private '
  'unless a live row here says otherwise.';
