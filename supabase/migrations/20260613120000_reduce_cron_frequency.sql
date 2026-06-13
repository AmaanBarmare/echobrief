-- A1: Reduce pg_cron frequency to cut Disk IO Budget consumption.
--
-- Root cause (confirmed via `supabase inspect db outliers`): the single most
-- expensive query on the database — 94.4% of all execution time, 110k+ calls —
-- is `net.http_post(...)` fired by pg_cron. Each tick writes a request row + a
-- response row (pg_net) plus a cron.job_run_details row, generating constant
-- WAL/fsync write IO 24/7. The dataset itself is tiny and fully cached
-- (table/index hit rate 1.00), so reads are NOT the problem — write churn is.
--
-- auto-join-meetings ran every minute (1440 calls/day). Dropping it to every
-- 5 minutes (288/day) removes ~80% of that churn. The auto-join look-ahead
-- window is widened from 2 -> 7 minutes in the edge function (same commit) so
-- no meeting is missed between the wider polls; the function's existing
-- per-calendar-event dedup guard prevents duplicate bots.
--
-- monitor-stuck-meetings ran every 5 minutes; its stuck threshold is already
-- ">15 min", so 15-minute polling loses nothing.
--
-- cron.schedule() with an existing job name UPDATES that job in place.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- auto-join-meetings: every 1 min -> every 5 min
SELECT cron.schedule(
  'auto-join-meetings',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lekkpfpojlspbuwrtmzt.supabase.co/functions/v1/auto-join-meetings',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- monitor-stuck-meetings: every 5 min -> every 15 min
SELECT cron.schedule(
  'monitor-stuck-meetings',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lekkpfpojlspbuwrtmzt.supabase.co/functions/v1/monitor-stuck-meetings',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
