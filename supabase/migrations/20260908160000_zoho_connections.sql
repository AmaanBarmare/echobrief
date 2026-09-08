-- Zoho CRM: write the meeting back to the record it belongs to.
--
-- EchoBrief already knows who was in the room — `contacts` is built from the
-- external attendees of every completed meeting. Until now that intelligence
-- died in the dashboard. This is the write-back: after a meeting, find the
-- Contact (or Lead) whose email matches an attendee, and attach ONE note with
-- the summary, decisions and action items.
--
-- Note-only by design. EchoBrief does not create Contacts, does not create
-- Tasks, and does not edit any field on a record it did not create. A CRM is
-- the system of record for a sales team; an integration that quietly invents
-- records in it gets switched off within a week.
--
-- ---------------------------------------------------------------------------
-- Why `api_domain` is a column and not a constant
-- ---------------------------------------------------------------------------
-- Zoho is multi-datacentre and the datacentres do not share anything. An account
-- created in India lives on accounts.zoho.in / www.zohoapis.in; a .com account
-- on accounts.zoho.com / www.zohoapis.com. **A token minted in one DC is
-- rejected by every other**, and the rejection looks like an ordinary auth
-- failure, so hardcoding a domain produces "your Zoho connection is broken" for
-- every customer outside the DC we happened to develop against. The domain
-- comes back with the grant and is stored next to the token that only works
-- there.

CREATE TABLE IF NOT EXISTS public.zoho_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Sealed by _shared/oauth-tokens.ts, exactly like calendar_connections and
  -- slack_connections — the column names are deliberately identical so the same
  -- sealer applies with no special case.
  access_token    text,
  refresh_token   text,
  -- Zoho access tokens last one hour; the refresh token does not expire unless
  -- revoked. The delivery path refreshes on demand, which is why the expiry is
  -- stored rather than guessed.
  token_expiry    timestamptz,
  scopes          text,

  -- The datacentre. `location` is the short code Zoho puts on the OAuth
  -- callback ('in', 'us', 'eu'); `api_domain` is the full base URL the token
  -- response returns and every request must use.
  location        text,
  api_domain      text NOT NULL,

  -- For the UI: "connected to Oltaflock AI" rather than just "connected".
  org_id          text,
  org_name        text,

  needs_reconnect boolean NOT NULL DEFAULT false,
  last_synced_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One Zoho org per user, so "connected" is the existence of the row and the
-- delivery path never has to choose between two grants.
CREATE UNIQUE INDEX IF NOT EXISTS zoho_connections_user_key
  ON public.zoho_connections (user_id);

ALTER TABLE public.zoho_connections ENABLE ROW LEVEL SECURITY;

-- Read your own connection. Writes are service-role only: every write happens
-- inside an edge function that has just verified who is asking, and a token
-- column is not something a browser should be able to UPDATE.
CREATE POLICY zoho_connections_select_own ON public.zoho_connections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Delivery ledger
-- ---------------------------------------------------------------------------
-- Same claim-before-write shape as `email_deliveries` and `slack_deliveries`,
-- for the same reason: `afterInsightsSaved` runs on every completion path
-- INCLUDING regeneration, and Sarvam has replayed a single callback three
-- times. Without this, re-running insights attaches the same note to the same
-- Contact again — and a CRM record with four identical notes on it is worse
-- than one with none, because it makes the whole integration look untrustworthy
-- to the person whose job depends on that record.
--
-- The unique key is (meeting_id, record_id): one note per meeting per CRM
-- record, while still allowing a meeting with two external attendees to write
-- to both of their records.
CREATE TABLE IF NOT EXISTS public.zoho_deliveries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Which Zoho record the note went on. `module` is 'Contacts' or 'Leads'.
  module      text NOT NULL,
  record_id   text NOT NULL,
  -- The matched email, kept so a support question ("why did this land here?")
  -- is answerable without re-running the match.
  matched_email text,
  -- Zoho's id for the note itself. Null until the write succeeds, so a
  -- claimed-but-failed row is distinguishable from a written one.
  note_id     text,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS zoho_deliveries_once
  ON public.zoho_deliveries (meeting_id, record_id);

ALTER TABLE public.zoho_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY zoho_deliveries_select_own ON public.zoho_deliveries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

COMMENT ON TABLE public.zoho_connections IS
  'One Zoho CRM org per user. Tokens are AES-256-GCM sealed; api_domain is the datacentre those tokens are valid in.';
COMMENT ON TABLE public.zoho_deliveries IS
  'Claim-before-write ledger: one note per meeting per CRM record, even when insights are regenerated.';
