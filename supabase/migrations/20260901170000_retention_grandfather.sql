-- Grandfather everything that predates the retention policy.
--
-- prune-content shipped paused because its first dry run reported 65 meetings
-- already past the 90-day window — real calls from April to June, 9 of them
-- still holding a transcript. Those were recorded under no retention promise at
-- all, and deleting them to satisfy a policy written afterwards is not a
-- decision a cron tick gets to make.
--
-- An explicit exemption flag rather than back-stamping `content_pruned_at`:
-- that column means "we deleted this content", and setting it on rows whose
-- content is intact would make the UI lie to the owner about what happened.
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS retention_exempt boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.meetings.retention_exempt IS
  'Skipped by prune-content. Set on meetings recorded before the retention '
  'policy existed; not set on anything recorded after.';

UPDATE public.meetings
   SET retention_exempt = true
 WHERE created_at < '2026-09-01T12:00:00Z';

-- The prune scan reads (user, created_at) among rows still eligible.
DROP INDEX IF EXISTS public.meetings_retention_scan_idx;
CREATE INDEX IF NOT EXISTS meetings_retention_scan_idx
  ON public.meetings (user_id, created_at)
  WHERE content_pruned_at IS NULL AND retention_exempt = false;
