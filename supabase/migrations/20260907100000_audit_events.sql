-- Who did what to whose data.
--
-- The question this exists to answer is "was this accessed, and by whom?" —
-- asked after an incident, in a security questionnaire, and by a SOC 2 auditor
-- under the monitoring criteria. Today it cannot be answered at all.
--
-- WHAT THIS CANNOT SEE, stated up front so nobody later mistakes it for
-- complete: the dashboard reads meetings, transcripts and insights STRAIGHT
-- from PostgREST with the user's own JWT, and the Settings data export is a
-- client-side bulk select. No edge function is involved, and Postgres cannot
-- fire a trigger on SELECT. So an owner reading their own meeting in the
-- browser leaves no row here, and cannot be made to without routing those
-- reads through an API — which is the week-8 REST API work, not this.
--
-- What it DOES cover is the set that actually matters for a breach question,
-- because it is every path by which meeting content reaches someone other than
-- the owner sitting at their dashboard:
--
--   * a share link being minted, widened, used or revoked
--   * a recording URL being handed out
--   * an API/MCP token being minted or revoked, and what it then read
--   * organisation invites, joins, role changes, removals
--   * account and meeting deletion
--
-- The actor is deliberately not always a user id: a public share link has no
-- user behind it, and "someone with this token read this meeting" is precisely
-- the row you want when a link leaks.

CREATE TABLE IF NOT EXISTS public.audit_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     timestamptz NOT NULL DEFAULT now(),

  -- WHO. actor_user_id is NULL for anonymous share-link traffic and for
  -- service-role work; actor_type says which of those it was.
  actor_type     text NOT NULL CHECK (actor_type IN ('user', 'service', 'share_token', 'api_token', 'anonymous')),
  actor_user_id  uuid,
  -- The credential used, as a sha256 digest, never the token itself. Lets you
  -- answer "what else did that leaked link touch?" without storing the link.
  actor_token_id text,

  -- WHAT. Verb-noun, past tense, e.g. 'share.created', 'recording.accessed'.
  action         text NOT NULL,
  resource_type  text,
  resource_id    uuid,
  org_id         uuid,

  -- OUTCOME. Denials matter more than successes: repeated 'denied' rows on one
  -- resource is what an attempted breach looks like.
  result         text NOT NULL DEFAULT 'ok' CHECK (result IN ('ok', 'denied', 'error')),

  ip             inet,
  user_agent     text,
  -- Never content. Ids, counts, flags.
  metadata       jsonb
);

-- No foreign keys, for the same reason as function_errors: the audit trail must
-- survive the deletion of what it describes. An audit log that a deletion can
-- erase is not an audit log — and "who deleted this account" is exactly the row
-- a cascade would take with it.

CREATE INDEX IF NOT EXISTS audit_events_created_idx
  ON public.audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx
  ON public.audit_events (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_resource_idx
  ON public.audit_events (resource_type, resource_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_action_idx
  ON public.audit_events (action, created_at DESC);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Users may read their OWN trail — "where has my data been accessed" is a trust
-- feature worth surfacing in Settings, and it is free evidence for the auditor.
-- They may never write it, and never see anyone else's.
DROP POLICY IF EXISTS audit_events_select_own ON public.audit_events;
CREATE POLICY audit_events_select_own ON public.audit_events
  FOR SELECT TO authenticated
  USING (actor_user_id = auth.uid());

-- Append-only, enforced in the database rather than by convention. The service
-- role bypasses RLS, so without these a compromised service key could rewrite
-- history; a rule cannot be bypassed that way.
--
-- The cost of the DELETE rule, accepted deliberately: this table can never be
-- pruned in the ordinary way, so retention requires dropping the rule, pruning,
-- and recreating it — i.e. a migration, in version control, reviewed. That is
-- the right amount of friction for erasing an audit trail, and the rows are
-- small and rare enough that growth is not a near-term concern.
CREATE OR REPLACE RULE audit_events_no_update AS
  ON UPDATE TO public.audit_events DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_events_no_delete AS
  ON DELETE TO public.audit_events DO INSTEAD NOTHING;

COMMENT ON TABLE public.audit_events IS
  'Append-only trail of consequential actions, written by _shared/audit.ts. '
  'Append-only is enforced by RULEs, so even the service role cannot rewrite it. '
  'Does NOT capture owner reads from the dashboard: those go browser→PostgREST '
  'under RLS with no function in the path.';
