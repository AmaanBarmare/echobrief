-- One summary email per (meeting, recipient) — enforced by the database.
--
-- Root cause (found 2026-08-21 from prod logs): Sarvam fired the SAME
-- `Completed` callback three times for job 20260821_931079dc... at 17:14:27,
-- 17:14:35 and 17:14:43 — ~8 s apart, because `sarvam-webhook` does all of its
-- work (download → stitch → GPT insights → email) before answering, so the
-- first call did not respond within Sarvam's callback timeout. All three
-- invocations read `meetings.status = 'processing'` before any of them wrote
-- `completed`, so the read-then-check idempotency guard let all three through
-- and each one sent a summary email. The user got 3 identical emails for the
-- "Prachi x Khush" meeting; the same thing happened to "Daily Sync Meeting"
-- earlier the same day and to the harness's concurrent-webhook scenario.
--
-- Two independent defences are added here:
--   1. `email_deliveries` — a claim row per (meeting, recipient, kind) with a
--      UNIQUE index. `send-meeting-email` inserts the claim BEFORE calling
--      Resend; a losing racer gets 23505 and skips instead of sending. This is
--      the guarantee: no matter how many callers race, one email per recipient.
--   2. `meetings.sarvam_webhook_claimed_at` — an atomic in-flight claim so a
--      duplicate Sarvam callback bails out instead of redoing the download,
--      the GPT insight generation and the delivery. Stale claims (older than
--      10 min, i.e. a run that died mid-way) are re-claimable so a meeting is
--      never stranded.

CREATE TABLE IF NOT EXISTS public.email_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  -- Which mail this is. Automatic post-meeting summaries are 'meeting_summary';
  -- other kinds (manual report exports, digests) get their own value so they
  -- are deduped independently and a manual re-send is never blocked by the
  -- automatic one.
  kind TEXT NOT NULL DEFAULT 'meeting_summary',
  provider_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The arbiter. lower() so Khush@x and khush@x cannot both be claimed.
CREATE UNIQUE INDEX IF NOT EXISTS email_deliveries_dedup
  ON public.email_deliveries (meeting_id, lower(recipient_email), kind);

CREATE INDEX IF NOT EXISTS email_deliveries_recent
  ON public.email_deliveries (created_at DESC);

-- RLS: service-role only, like monitor_events. No user-facing access needed.
ALTER TABLE public.email_deliveries ENABLE ROW LEVEL SECURITY;

-- In-flight claim for sarvam-webhook. NULL = nobody is processing this meeting.
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS sarvam_webhook_claimed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.meetings.sarvam_webhook_claimed_at IS
  'Atomic in-flight claim taken by sarvam-webhook on a COMPLETED/FAILED callback. Duplicate callbacks (Sarvam retries every ~8s when our handler is slow to answer) skip while this is set and younger than 10 minutes.';
