-- Disk IO Budget guard: raw counter samples taken by the monitor cron.
--
-- Rates need two points. Rather than block a monitor invocation for 75+ seconds
-- to take both, each 15-minute tick appends its raw since-boot counters here and
-- diffs against the previous row. The ~15 minute gap is far wider than the ~60 s
-- metrics scrape interval, so it cannot alias — sampling at 30 s produces a
-- perfect alternation of zero and double-rate readings that reads convincingly
-- as a bursty workload and is not one.
--
-- Append-only on purpose. A singleton row would be cheaper, but the open
-- question after the 2026-09-08 incident is the RECURRENCE INTERVAL — how long
-- after a restart the instance climbs back above baseline — and that is only
-- answerable from history. 96 rows/day, pruned to 14 days, is ~1,300 rows; the
-- cron bookkeeping this same tick writes is an order of magnitude more.
--
-- See docs/engineering-notes.md #25.

CREATE TABLE IF NOT EXISTS public.instance_io_samples (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Raw since-boot counters, exactly as scraped. Stored raw rather than as a
  -- computed rate so a later change to how rates are derived can be applied
  -- retroactively to samples already collected.
  counters    JSONB NOT NULL,
  -- Rates for the window ending at this sample, or NULL for the first sample
  -- after a reboot (counters reset, so the delta is not a rate).
  rates       JSONB,
  above_baseline BOOLEAN NOT NULL DEFAULT false,
  alerted     BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS instance_io_samples_recent
  ON public.instance_io_samples (captured_at DESC);

-- Service role only. Nothing user-facing reads instance telemetry, and it is
-- not tenant-scoped, so there is no policy to write: RLS on with zero policies
-- denies every anon/authenticated request while the service role bypasses it.
ALTER TABLE public.instance_io_samples ENABLE ROW LEVEL SECURITY;

-- Keep the retention sweep next to the other bookkeeping prune so there is one
-- place that trims monitor exhaust, and no new cron job.

-- Re-register prune-job-logs with the io-sample sweep appended. The body is
-- restated in full (pg_cron has no "append to command"), so this must stay in
-- sync with 20260613120100 and 20260901160000 — check `select command from
-- cron.job where jobname='prune-job-logs'` before editing.
SELECT cron.schedule(
  'prune-job-logs',
  '45 21 * * *',
  $cron$
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
  -- Two weeks is enough to see a recurrence interval without the table itself
  -- becoming write churn worth worrying about.
  DELETE FROM public.instance_io_samples WHERE captured_at < now() - interval '14 days';
  $cron$
);

DO $$
DECLARE
  cmd text;
BEGIN
  SELECT command INTO cmd FROM cron.job WHERE jobname = 'prune-job-logs';
  IF cmd IS NULL OR cmd NOT LIKE '%instance_io_samples%' THEN
    RAISE EXCEPTION 'prune-job-logs was not re-registered with the io-sample sweep';
  END IF;
  IF cmd NOT LIKE '%rate_limits%' OR cmd NOT LIKE '%job_run_details%' THEN
    RAISE EXCEPTION 'prune-job-logs lost an existing sweep — the restated body drifted';
  END IF;
END;
$$;
