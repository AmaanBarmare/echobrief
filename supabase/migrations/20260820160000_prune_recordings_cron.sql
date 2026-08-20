-- Daily prune of archived meeting audio.
--
-- The `recordings` bucket hit 1073 MB against the 1 GB free-tier cap on
-- 2026-08-20, which silently broke the whole transcription pipeline: with the
-- storage upload failing, recall-pipeline could not sign a URL for the splitter,
-- so long audio fell through to whole-file Sarvam (empty transcript above ~6 min)
-- and then whole-file Whisper (rejects >25 MB). Nothing alerted, because the
-- meetings were being written as 'completed'. See errors.md
-- `storage:bucket_full_blocks_pipeline`.
--
-- Runs at 03:30 UTC, 15 min after prune-job-logs so the two don't overlap.
-- Daily is deliberate: per CLAUDE.md, pg_cron + pg_net tick churn is what
-- depletes the Disk IO Budget on this instance, so this must stay infrequent.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'prune-recordings',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://lekkpfpojlspbuwrtmzt.supabase.co/functions/v1/prune-recordings',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
