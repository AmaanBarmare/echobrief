-- Waitlist for the landing page.
--
-- Signups are closed (auth config `disable_signup: true`, and the Auth page's
-- SIGNUPS_ENABLED flag), so every landing CTA now collects a lead here instead
-- of pointing at an account that cannot be created.
--
-- RLS shape: anon may INSERT and nothing else. There is deliberately no SELECT
-- policy, so the list is readable only via the service role. supabase-js sends
-- `Prefer: return=minimal` for a bare .insert(), so the write succeeds without
-- needing read access to the row it just created.

CREATE TABLE IF NOT EXISTS public.waitlist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  full_name  text NOT NULL,
  company    text,
  -- Which CTA they came from ('hero', 'navbar', 'pricing:Pro', ...) so we can
  -- see which pitch actually converts.
  source     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  invited_at timestamptz,
  CONSTRAINT waitlist_email_format
    CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' AND length(email) <= 254),
  CONSTRAINT waitlist_full_name_len  CHECK (length(btrim(full_name)) BETWEEN 1 AND 120),
  CONSTRAINT waitlist_company_len    CHECK (company IS NULL OR length(company) <= 160),
  CONSTRAINT waitlist_source_len     CHECK (source  IS NULL OR length(source)  <= 60)
);

-- Case-insensitive dedup: one row per address, however they typed it.
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_lower_key
  ON public.waitlist (lower(email));

CREATE INDEX IF NOT EXISTS waitlist_created_at_idx
  ON public.waitlist (created_at DESC);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone can join the waitlist" ON public.waitlist;
CREATE POLICY "anyone can join the waitlist"
  ON public.waitlist FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
