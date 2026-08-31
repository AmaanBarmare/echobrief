-- Production-quality columns (2026-08-31 fix plan):
--   meetings.languages    — duration-weighted language mix, e.g. {"en": 0.88, "hi": 0.12}.
--                           Replaces trusting the single language_detected label, which
--                           tagged a 90%-English call as "hindi".
--   meetings.boundaries   — privacy trim: {"first_external_join_ts": 199, "last_external_leave_ts": 1780,
--                           "source": "speech_estimated", "internal_only": false}. Insights, email and
--                           MCP default to the [first, last] window; pre/post chatter stays owner-only.
--   meeting_insights.facts    — pass-1 extraction output (numbers, commitments, objections … each with
--                               verbatim quote + timestamp) that pass-2 synthesis is grounded on.
--   meeting_insights.coaching — per-meeting coaching report (metric verdicts, moment flags,
--                               sentiment timeline, summary).
--   profiles.custom_vocabulary — user-maintained boost list for entity spelling correction
--                               (company/product/client names the ASR keeps mangling).

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS languages jsonb,
  ADD COLUMN IF NOT EXISTS boundaries jsonb;

ALTER TABLE public.meeting_insights
  ADD COLUMN IF NOT EXISTS facts jsonb,
  ADD COLUMN IF NOT EXISTS coaching jsonb;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS custom_vocabulary text[] NOT NULL DEFAULT '{}';
