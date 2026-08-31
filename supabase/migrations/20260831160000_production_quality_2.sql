-- Production-quality plan, part 2 (2026-08-31): contacts, automation webhooks,
-- follow-up email drafts.
--
--   contacts / meeting_contacts — external attendees become contacts (name,
--     email, company from domain); meetings attach to the contact timeline, and
--     a rolling account_brief is generated for repeat contacts.
--   webhook_events — audit log of every meeting.insights_ready delivery to the
--     user's automation endpoint (profiles.webhook_url, signed with
--     profiles.webhook_secret using Standard-Webhooks headers).
--   meeting_insights.followup_draft — cached LLM follow-up email draft.

CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  name text,
  company text,
  domain text,
  meeting_count integer NOT NULL DEFAULT 0,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  account_brief jsonb,
  account_brief_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, email)
);
CREATE INDEX IF NOT EXISTS contacts_user_last_seen_idx ON public.contacts (user_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.meeting_contacts (
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meeting_id, contact_id)
);
CREATE INDEX IF NOT EXISTS meeting_contacts_contact_idx ON public.meeting_contacts (contact_id);

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  meeting_id uuid REFERENCES public.meetings(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status_code integer,
  error text,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_events_user_created_idx ON public.webhook_events (user_id, created_at DESC);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS webhook_url text,
  ADD COLUMN IF NOT EXISTS webhook_secret text;

ALTER TABLE public.meeting_insights
  ADD COLUMN IF NOT EXISTS followup_draft jsonb;

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Users read (and may rename) their own contacts; rows are written by the
-- pipeline with the service role.
CREATE POLICY "Users can view their own contacts" ON public.contacts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own contacts" ON public.contacts
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own contacts" ON public.contacts
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own meeting contacts" ON public.meeting_contacts
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own webhook events" ON public.webhook_events
  FOR SELECT USING (auth.uid() = user_id);
