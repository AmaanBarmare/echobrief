-- Reviewers who get the post-meeting summary when they are on the invite.
--
-- Two separate needs, one list:
--   1. These addresses are cleared for accounts (accounts are created by invite;
--      public signup stays closed — see src/pages/Auth.tsx SIGNUPS_ENABLED).
--   2. Whenever one of them appears in the attendee list of a recorded meeting,
--      `deliverResults` mails them the same summary the owner gets, so they can
--      review it.
--
-- Deliberately global (no user_id): this is an internal reviewer list, not a
-- per-user sharing feature. Service-role only — nothing in the browser reads or
-- writes it, and a leak of who reviews which meeting is not something RLS on a
-- user-scoped column would cover anyway.

CREATE TABLE IF NOT EXISTS public.summary_recipient_allowlist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  note       text,
  -- Set false to suspend someone without losing the row.
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT summary_recipient_allowlist_email_format
    CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' AND length(email) <= 254)
);

-- Case-insensitive: attendee emails come back from Google in whatever case the
-- inviter typed, and the match against this list has to survive that.
CREATE UNIQUE INDEX IF NOT EXISTS summary_recipient_allowlist_email_lower_key
  ON public.summary_recipient_allowlist (lower(email));

ALTER TABLE public.summary_recipient_allowlist ENABLE ROW LEVEL SECURITY;
-- No policies: service role bypasses RLS, everyone else sees nothing.

INSERT INTO public.summary_recipient_allowlist (email, note)
VALUES
  ('vineet@oltaflock.ai',           'Reviewer — Oltaflock'),
  ('adnanbarwaniwala7@gmail.com',   'Reviewer — Adnan'),
  ('admin@oltaflock.ai',            'Reviewer — admin')
ON CONFLICT DO NOTHING;
