-- Fix RLS issues flagged by Supabase advisor
-- 1. Re-enables RLS on calendars/calendar_events (idempotent, in case prior migration didn't run)
-- 2. Creates scheduled_emails table with proper RLS

-- ── calendars ────────────────────────────────────────────────────────────────
ALTER TABLE public.calendars ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'calendars' AND policyname = 'Users can view own calendars'
  ) THEN
    CREATE POLICY "Users can view own calendars" ON public.calendars FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'calendars' AND policyname = 'Users can insert own calendars'
  ) THEN
    CREATE POLICY "Users can insert own calendars" ON public.calendars FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'calendars' AND policyname = 'Users can update own calendars'
  ) THEN
    CREATE POLICY "Users can update own calendars" ON public.calendars FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'calendars' AND policyname = 'Users can delete own calendars'
  ) THEN
    CREATE POLICY "Users can delete own calendars" ON public.calendars FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── calendar_events ───────────────────────────────────────────────────────────
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'calendar_events' AND policyname = 'Users can view own calendar events'
  ) THEN
    CREATE POLICY "Users can view own calendar events" ON public.calendar_events FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'calendar_events' AND policyname = 'Users can insert own calendar events'
  ) THEN
    CREATE POLICY "Users can insert own calendar events" ON public.calendar_events FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'calendar_events' AND policyname = 'Users can update own calendar events'
  ) THEN
    CREATE POLICY "Users can update own calendar events" ON public.calendar_events FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── scheduled_emails ──────────────────────────────────────────────────────────
-- Table for onboarding email drip sequences (written by Edge Functions via service role)
CREATE TABLE IF NOT EXISTS public.scheduled_emails (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  template   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  send_at    TIMESTAMPTZ NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_emails ENABLE ROW LEVEL SECURITY;

-- Users can view their own scheduled emails (Edge Functions use service role and bypass RLS)
CREATE POLICY "Users can view own scheduled emails"
  ON public.scheduled_emails FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_user_id ON public.scheduled_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_status_send_at ON public.scheduled_emails(status, send_at);
