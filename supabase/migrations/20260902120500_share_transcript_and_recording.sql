-- Let a share carry the transcript and the recording, per share.
--
-- The original share surface was summary + decisions + action items, and that
-- stays the default. Widening it is a per-row opt-in for two reasons:
--
--   1. Links already sent must not gain reach retroactively. A column with a
--      `false` default means every token minted before today keeps showing
--      exactly what its sender was promised it would show.
--   2. The two additions are not equally safe. The transcript we serve is
--      filtered to `zone = 'meeting'`, so the pre/post-call chatter that
--      `zones.ts` works to exclude never leaves. The recording CANNOT be
--      filtered that way — the mp4 Recall hands back is the whole call,
--      including whatever was said while the bot was waiting. Sharing it is a
--      real decision, so it gets its own switch and its own warning in the UI.

ALTER TABLE public.meeting_shares
  ADD COLUMN IF NOT EXISTS include_transcript boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS include_recording  boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.meeting_shares.include_transcript IS
  'Serve the meeting-zone transcript on this share. Pre/post zones are excluded regardless.';
COMMENT ON COLUMN public.meeting_shares.include_recording IS
  'Serve a short-lived playback URL on this share. The recording is unedited — it contains the pre/post-call audio the transcript excludes.';
