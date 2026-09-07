-- Re-enable the plan-aware retention cron.
--
-- It was paused the day it shipped (2026-09-01): a dry run showed 65 meetings
-- past the 90-day window, 9 of them still holding a transcript and 10 holding
-- insights. Deleting real meeting content is not a decision to make on a cron
-- tick, so the job was switched off until that set had been reviewed.
--
-- Reviewed 2026-09-07. The set is still there — 73 meetings now sit past the
-- 90-day line, 9 with transcripts and 10 with insights — but every one of them
-- carries retention_exempt = true from the grandfather clause in
-- 20260901170000, which was written for precisely this: content recorded
-- before we had a retention policy is not retroactively subject to one.
--
-- So the pause was protecting against something the schema already prevented.
-- A dry run against production today reports `expiring: 0` for every plan.
-- Counted at the time of this migration:
--
--     191 meetings total
--     182 retention_exempt = true   (recorded before the policy)
--       9 retention_exempt = false  (recorded under it, none yet expired)
--
-- Re-enabling therefore deletes nothing today, and from here on the retention
-- window customers are sold is the retention window they get. The alternative
-- — leaving it off — means the pricing page promises a 30/90-day policy that
-- nothing enforces, which is the failure mode this project has already audited
-- itself for once.

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'prune-content'),
  active := true
);

DO $$
DECLARE
  is_active boolean;
BEGIN
  SELECT active INTO is_active FROM cron.job WHERE jobname = 'prune-content';
  IF is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'prune-content did not come back active — check that the job exists';
  END IF;
END;
$$;
