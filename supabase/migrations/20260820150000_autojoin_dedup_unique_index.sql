-- Auto-join duplicate-bot race fix.
--
-- Root cause (found 2026-08-20 by querying prod): `auto-join-meetings` deduped
-- with a plain SELECT against idx_meetings_calendar_source, which is a NON-unique
-- index. Two concurrent cron invocations both read "no existing meeting" and both
-- sent a Recall bot — 79 calendar events got 2-3 bots each, 88 wasted bots, all
-- created within 1-2 seconds of each other.
--
-- The database has to be the arbiter. This adds the unique constraint the dedup
-- SELECT was always assuming existed. `auto-join-meetings` now INSERTs the
-- meeting row FIRST (claiming the slot) and only sends a bot once the insert
-- succeeds, so a losing racer gets 23505 and skips instead of spawning a bot.

-- 1. Detach existing duplicates so the unique index can be built.
--    Non-destructive: rows are kept and stay visible to the user, they just stop
--    occupying the (user_id, calendar_event_id, source) slot. Keeper preference:
--    has a transcript > status completed > oldest.
WITH ranked AS (
  SELECT
    m.id,
    row_number() OVER (
      PARTITION BY m.user_id, m.calendar_event_id, m.source
      ORDER BY
        (EXISTS (SELECT 1 FROM public.transcripts t WHERE t.meeting_id = m.id)) DESC,
        (m.status = 'completed') DESC,
        m.created_at ASC
    ) AS rn
  FROM public.meetings m
  WHERE m.calendar_event_id IS NOT NULL
)
UPDATE public.meetings m
SET calendar_event_id = NULL
FROM ranked r
WHERE m.id = r.id
  AND r.rn > 1;

-- 2. One meeting per (user, calendar event, source).
CREATE UNIQUE INDEX IF NOT EXISTS meetings_autojoin_dedup
  ON public.meetings (user_id, calendar_event_id, source)
  WHERE calendar_event_id IS NOT NULL;

-- 3. The old non-unique index is now redundant (same leading columns).
DROP INDEX IF EXISTS idx_meetings_calendar_source;
