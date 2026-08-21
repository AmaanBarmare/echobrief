-- Daily maintenance crons now fire at their intended IST hour.
--
-- pg_cron schedules are interpreted in UTC. Both daily jobs were written as
-- 03:15 and 03:30 "overnight" — but in UTC that lands at 08:45 and 09:00 IST,
-- the middle of the Indian working morning. prune-recordings deletes storage
-- objects, so it was doing its heaviest work exactly when people use the
-- product.
--
-- IST is UTC+5:30 with no daylight saving, so the conversion is a fixed shift
-- back: 03:15 IST = 21:45 UTC, 03:30 IST = 22:00 UTC (of the previous day).
-- The 15-minute gap between the two jobs is preserved.
--
-- The interval jobs (auto-join */5, monitor */15) are timezone-independent and
-- deliberately untouched — see README challenge #22 on the Disk IO Budget
-- before changing their frequency.
--
-- cron.schedule() with an existing job name UPDATES that job in place. The
-- command bodies below are copied verbatim from the migrations that created
-- them (20260613120100 and 20260820160000); only the schedule changes.

SELECT cron.schedule(
  'prune-job-logs',
  '45 21 * * *',  -- 03:15 IST
  $$
  DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days';
  DO $prune$
  BEGIN
    DELETE FROM net._http_response WHERE created < now() - interval '1 day';
  EXCEPTION WHEN others THEN
    NULL; -- net._http_response schema varies by pg_net version; ignore if absent
  END
  $prune$;
  $$
);

SELECT cron.schedule(
  'prune-recordings',
  '0 22 * * *',   -- 03:30 IST
  $$
  SELECT net.http_post(
    url := 'https://lekkpfpojlspbuwrtmzt.supabase.co/functions/v1/prune-recordings',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
