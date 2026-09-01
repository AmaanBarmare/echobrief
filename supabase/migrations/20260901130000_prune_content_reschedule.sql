-- Move prune-content off 03:45 UTC.
--
-- 20260901120100 picked 03:45 believing prune-job-logs ran at 03:15 and
-- prune-recordings at 03:30 (the times CLAUDE.md lists). The live schedule is
-- different — 20260821070000 moved those jobs to IST-anchored slots, so the
-- real UTC times are prune-job-logs 21:45, prune-recordings 22:00, and
-- prune-oauth 03:45. prune-content therefore landed exactly on prune-oauth.
--
-- prune-oauth is pure SQL so the collision is cheap, but overlapping ticks are
-- avoidable and the comment in the previous migration was simply wrong. 04:15
-- UTC (09:45 IST) is clear of all four.
DO $unsched$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-content') THEN
    PERFORM cron.unschedule('prune-content');
  END IF;
END
$unsched$;

SELECT cron.schedule(
  'prune-content',
  '15 4 * * *',
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
