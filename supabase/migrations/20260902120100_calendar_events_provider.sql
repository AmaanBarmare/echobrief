-- calendar_events learns which provider an event came from, and its version.
--
-- The change-diff in _shared/calendar-diff.ts reads Google's `updated` stamp
-- out of raw_data. Microsoft's equivalent is `lastModifiedDateTime`, so with a
-- second provider the diff would have to guess which key to read. Storing the
-- stamp in its own column makes the comparison provider-neutral — and without
-- it every event would be rewritten on every tick, which is exactly the write
-- churn that made this table the second largest write source in the database.

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'google',
  ADD COLUMN IF NOT EXISTS version  text;

-- Backfill Google's stamp from the raw payload we already store, so existing
-- rows are not all considered changed on the first run after deploy.
UPDATE public.calendar_events
   SET version = raw_data->>'updated'
 WHERE version IS NULL
   AND raw_data ? 'updated';

-- The upsert target: one row per user per event.
CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_user_event_key
  ON public.calendar_events (user_id, event_id);

COMMENT ON COLUMN public.calendar_events.version IS
  'Provider version stamp (Google `updated`, Microsoft `lastModifiedDateTime`). '
  'Rows whose stamp is unchanged are not rewritten.';
