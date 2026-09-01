-- The early-access feedback sequence, and the ledger that stops it repeating.
--
-- A code trades 28 days of the product for feedback. Nothing collected the
-- feedback half, so it was a handshake. `send-feedback-prompts` runs daily and
-- asks one question at day 3, day 14 and day 25 of a trial.
--
-- This table is the claim, not a log: the function inserts the row BEFORE
-- calling Resend, exactly as `send-meeting-email` does with `email_deliveries`.
-- A second cron tick (or a manual invoke) collides on the unique index and
-- skips, rather than mailing a design partner twice. If the send then fails,
-- the function deletes its own claim so the next tick retries.

CREATE TABLE IF NOT EXISTS public.feedback_prompts (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Mirrors PromptKind in _shared/feedback-prompts.ts.
  kind    text NOT NULL CHECK (kind IN ('day_3', 'day_14', 'day_25')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  -- One of each prompt per person, ever. This is the whole point of the table.
  UNIQUE (user_id, kind)
);

CREATE INDEX IF NOT EXISTS feedback_prompts_user_idx
  ON public.feedback_prompts (user_id);

-- Service-role only: RLS on, no policy. Nobody reads their own nag history.
ALTER TABLE public.feedback_prompts ENABLE ROW LEVEL SECURITY;

-- Daily at 04:15 UTC (09:45 IST) — after the 03:15/03:30 prune jobs so the
-- three write-heavy ticks don't land together. Per CLAUDE.md this is a daily
-- job precisely because the Disk IO Budget is depleted by cron WRITE churn:
-- every tick costs a pg_net request row, a response row and a
-- cron.job_run_details row. Daily is the right cadence for a sequence measured
-- in days — do NOT make this hourly.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'service_role_key'
  ) THEN
    RAISE EXCEPTION
      'Vault secret ''service_role_key'' is missing. Create it first: '
      'select vault.create_secret(''<service role jwt>'', ''service_role_key'');';
  END IF;
END
$check$;

DO $unsched$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-feedback-prompts') THEN
    PERFORM cron.unschedule('send-feedback-prompts');
  END IF;
END
$unsched$;

SELECT cron.schedule(
  'send-feedback-prompts',
  '15 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://lekkpfpojlspbuwrtmzt.supabase.co/functions/v1/send-feedback-prompts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
