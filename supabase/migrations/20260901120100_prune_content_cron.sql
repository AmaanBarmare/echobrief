-- Plan-aware retention: the column, and the cron that enforces it.
--
-- Free/Starter/Pro promise 14/30/90-day retention on the pricing page. Until
-- now `prune-recordings` deleted archived mp3s at a flat 30 days and nothing
-- ever deleted a transcript, an insight row, facts or a coaching report.
--
-- `prune-content` deletes the derived content and keeps the meeting row,
-- stamped here, so the history list still shows the meeting and the UI can say
-- why it is empty.

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS content_pruned_at timestamptz;

COMMENT ON COLUMN public.meetings.content_pruned_at IS
  'Set by prune-content when the transcript, insights and audio were removed '
  'under the account plan''s retention window. NULL means content is intact.';

-- The prune scan is "expired and not yet pruned", per plan cohort.
CREATE INDEX IF NOT EXISTS meetings_retention_scan_idx
  ON public.meetings (user_id, created_at)
  WHERE content_pruned_at IS NULL;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Same Vault pattern as 20260831190000: the service-role JWT is read at tick
-- time, never stored in cron.job. Fail loudly rather than scheduling a job that
-- sends 'Bearer ' || NULL and 401s forever without anyone noticing.
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
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-content') THEN
    PERFORM cron.unschedule('prune-content');
  END IF;
END
$unsched$;

-- 03:45 UTC daily. Deliberately clear of prune-job-logs (03:15) and
-- prune-recordings (03:30): each tick writes a pg_net request + response row
-- and a cron.job_run_details row, and on this instance that write churn is what
-- depletes the Disk IO Budget. One tick a day, not overlapping the others.
SELECT cron.schedule(
  'prune-content',
  '45 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://lekkpfpojlspbuwrtmzt.supabase.co/functions/v1/prune-content',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
