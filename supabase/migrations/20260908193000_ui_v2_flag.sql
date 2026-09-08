-- UI v2 feature flag.
--
-- The Console redesign (echobrief-ui-v2/) ships page by page behind this flag.
-- V1 stays the default for everyone until the last page is on V2; the flag is
-- per user so only testers see the new shell. A `?ui=v2` / `?ui=v1` query
-- override lives client-side in sessionStorage and beats this column, so the
-- flag can be checked without a write.
--
-- This is the only schema change in the whole migration — everything else is
-- presentation-layer.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ui_v2 BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.ui_v2 IS
  'Renders the Console (UI v2) shell and pages. Default false; per-user opt-in during the migration. Drop this column when V1 is deleted.';

-- Seed the founders so the flag is testable the moment it lands, without a
-- second migration. Anyone else is opted in from Settings later.
UPDATE public.profiles
   SET ui_v2 = TRUE
 WHERE lower(email) IN ('khush@oltaflock.ai', 'admin@oltaflock.ai', 'vineet@oltaflock.ai');
