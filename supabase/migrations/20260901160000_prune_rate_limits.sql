-- Sweep abandoned rate-limit keys.
--
-- `rate_limits` holds one row per key and upserts in place, so it does not grow
-- with traffic — but a key stops being touched when that IP or user goes quiet,
-- and those rows would sit there forever.
--
-- Folded into the existing prune-job-logs tick rather than given its own cron
-- job: a new job means another pg_net/job_run_details write every day, and that
-- write churn is exactly what depleted the Disk IO Budget in June. One tick,
-- three deletes.
DO $unsched$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-job-logs') THEN
    PERFORM cron.unschedule('prune-job-logs');
  END IF;
END
$unsched$;

SELECT cron.schedule(
  'prune-job-logs',
  '45 21 * * *',
  $$
  DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';
  DO $prune$
  BEGIN
    DELETE FROM net._http_response WHERE created < now() - interval '1 day';
  EXCEPTION WHEN others THEN
    NULL; -- net._http_response schema varies by pg_net version; ignore if absent
  END
  $prune$;
  -- A day is far longer than the longest rate-limit window (60 s), so this can
  -- never delete a row that is still counting.
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day';
  $$
);
