-- Email summary delivery preference + safer auto-join default.
--
-- 1. `email_summaries_enabled` gives `deliverResults` (supabase/functions/_shared/insights.ts)
--    something to read. Nothing in the bot pipeline ever set `processing_config.sendEmail`,
--    so no bot-recorded meeting was ever emailed even though onboarding promises it.
--    Defaults to true so summaries actually arrive; Settings -> Integrations exposes a toggle.
--
-- 2. `auto_join_enabled` was created with DEFAULT true, so every user who connected
--    Google Calendar started getting bots in meetings without ever opting in.
--    New rows now default to false (opt-in).
--
--    NOTE: existing rows are deliberately NOT backfilled — that would silently turn the
--    feature off for users who genuinely enabled it. To opt everyone out explicitly, run:
--      UPDATE public.profiles SET auto_join_enabled = false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_summaries_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ALTER COLUMN auto_join_enabled SET DEFAULT false;
