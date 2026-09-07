-- A timestamp for when the recording actually ended.
--
-- The latency objective in 20260907092000 — insights within 15 minutes of the
-- recording finishing — turned out to be unmeasurable against the existing
-- columns, and the view said so with a straight face: a p95 of one second.
--
-- The reason is that `meetings.end_time` is written when insights are SAVED,
-- not when the call ended; measured against it, the pipeline appears to take
-- about a second, because the two timestamps are the same event. `start_time`
-- is the scheduled calendar start, not when the bot began recording, and
-- start_time + duration_seconds disagrees with end_time by up to two minutes in
-- both directions, so it cannot be reconstructed after the fact either.
--
-- So the zero point gets recorded at the moment it happens. recall-webhook
-- stamps this on audio_mixed.done — the authoritative signal that the call is
-- over and the mixed audio exists — and only when it is still null, so a
-- replayed webhook cannot move the clock forward and flatter the number.
--
-- Existing rows stay NULL on purpose. Backfilling them from end_time would
-- manufacture the exact fiction this column exists to remove; the SLO views
-- count how many meetings are measurable so a thin sample is visible rather
-- than hidden.

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS recording_ended_at timestamptz;

COMMENT ON COLUMN public.meetings.recording_ended_at IS
  'When the recording finished, stamped by recall-webhook on audio_mixed.done. '
  'The zero point for the insight-latency SLO. NOT end_time, which is written when '
  'insights are saved. NULL for meetings recorded before 2026-09-07.';
