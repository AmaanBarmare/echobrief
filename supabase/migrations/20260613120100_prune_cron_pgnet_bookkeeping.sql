-- A3: Prune cron/pg_net bookkeeping tables so they stop accumulating IO.
--
-- pg_cron logs EVERY run to cron.job_run_details and never prunes it on its
-- own — with the crons firing ~300+ times/day this table grows unbounded, and
-- its own autovacuum adds write IO. pg_net keeps HTTP responses in
-- net._http_response (it self-expires them, but we trim defensively too).
--
-- A single daily job at 03:15 UTC (off-peak) deletes old rows. The net cleanup
-- is wrapped so a pg_net version whose column names differ can never break the
-- scheduled job — it simply no-ops in that case.

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'prune-job-logs',
  '15 3 * * *',
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
