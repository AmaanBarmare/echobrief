# Known Errors Runbook

This is the canonical list of error patterns the pipeline can hit, with root cause and recovery steps. The `monitor-stuck-meetings` cron carries a copy of these signatures in code; when it sees a *new* signature, it emails `amaan@oltaflock.ai` so we can investigate and add it here.

**Source of truth:** this file. **Audit log:** `monitor_events` table in the DB. The cron's known-pattern list in [`supabase/functions/monitor-stuck-meetings/known-patterns.ts`](supabase/functions/monitor-stuck-meetings/known-patterns.ts) must stay in sync with this file.

---

## Sarvam errors

### `sarvam:keyerror_timestamps`
**What it looks like:** Sarvam job reports `job_state: Completed` at top level, but `successful_files_count: 0`, `failed_files_count: 1`, and `job_details[0].exception_name: "KeyError"` with `error_message: "'timestamps'"`.

**Root cause:** Sarvam server-side bug in their saaras:v3 model when audio is longer than ~7 minutes. Reproduced across 4 different config combinations (translate/transcribe modes, en-IN/unknown languages, with timestamps on/off). Cannot be dodged with config flags. Reported to Sarvam Discord 2026-04-25. **Confirmed still live 2026-06-09** via controlled replay: the same 47-min file fails at full length but transcribes perfectly as 5–6-min chunks; an 8 MB/47-min file fails while a 6.8 MB/6-min file succeeds → trigger is **duration, not file size or config**.

**Fix shipped 2026-06-10 (chunking):** `recall-pipeline` now routes audio through the Vercel `api/split-audio` function, which ffmpeg-splits long audio into 300 s re-encoded chunks (stream-copy chunks are rejected by Sarvam with "Audio contains no samples"), submits all chunks as ONE multi-file Sarvam job, and `sarvam-webhook` stitches the per-chunk outputs (offsetting timestamps by `chunk_index × chunk_seconds`). Validated end-to-end: the failing 47-min meeting produced 21k chars across 10/10 chunks.

**Recovery (if chunked path unavailable):** legacy fall-back chain still applies — direct single-file Sarvam submission, then Whisper via `process-meeting` with `forceWhisper: true`.

**Open issue:** Whisper fallback OOMs/oversizes for long audio (see `whisper:oom`, `whisper:audio_too_large`) — but it is now only reached when both the chunked and direct Sarvam paths fail.

---

### `sarvam:silent_empty_output`
**What it looks like:** Sarvam job reports `successful_files_count: 1, state: Success`, but the downloaded output JSON is fully empty: `transcript: ""` (or a single space), `diarized_transcript: null`, `language_code: null`. **No exception is raised** — this is a silent failure.

**Root cause:** Same upstream bug as `sarvam:keyerror_timestamps`. When timestamps OR diarization is disabled in an attempt to dodge the KeyError, Sarvam's pipeline returns success metadata but produces no content. Likely the language-detection step itself fails on long audio and cascades to all output fields being null.

**Recovery:** Same as `sarvam:keyerror_timestamps` — primarily PREVENTED by the 2026-06-10 chunking fix (Vercel `api/split-audio` → multi-file Sarvam job → stitched in `sarvam-webhook`). If a chunked job still returns empty, the existing `!finalTranscript` branch falls back to Whisper.

---

## Whisper errors

### `whisper:oom`
**What it looks like:** Edge function invocation of `process-meeting` with `forceWhisper: true` returns `{"code":"WORKER_RESOURCE_LIMIT","message":"Function failed due to not having enough compute resources"}`.

**Root cause:** Supabase edge functions have ~256 MB RAM. The current Whisper code does:
1. Download full audio blob from Supabase Storage (1 copy)
2. Wrap in a `File` object (potential 2nd copy)
3. OpenAI SDK encodes as multipart for upload (3rd copy)

Audio ≥ ~15 MB blows the budget.

**Recovery:** For chunked (Recall/split) meetings this path is now bypassed entirely — `sarvam-webhook` falls back to **chunk-wise Whisper via the Vercel `api/split-audio` function** (`transcribe: "whisper"` mode, shipped 2026-06-11): each 300 s chunk is ~1 MB, transcribed off-edge with 2 GB memory, so neither the edge OOM nor the 25 MB limit applies. Requires `OPENAI_API_KEY` in the Vercel env. The legacy in-edge `process-meeting` forceWhisper path remains only for non-chunked (extension/small) audio. Manual fallback: [`/tmp/recover_meeting.py`](/tmp/recover_meeting.py).

---

### `whisper:audio_too_large`
**What it looks like:** Audio file size > 25 MB. Whisper API rejects with 413 or our pre-flight check throws `Audio file too large for Whisper (...). Whisper supports up to 25 MB.`

**Root cause:** OpenAI Whisper's hard 25 MB upload limit. Affects roughly any audio > ~25 minutes at standard MP3 bitrate.

**Recovery:** For chunked (Recall/split) meetings: automatic since 2026-06-11 — `sarvam-webhook` retries via the Vercel splitter's chunk-wise Whisper mode (300 s chunks ≈ 1 MB each, far under the 25 MB limit). The monitor also routes `force_whisper` recoveries for chunked meetings to `trigger_sarvam_webhook` instead, which carries this fallback. Non-chunked uploads (extension path) still lack automatic recovery.

---

## Recall webhook errors

### `recall:race_bot_done_before_audio_mixed`
**What it looks like:** Meeting status flips to `failed` shortly after `bot.done` fires, even though `audio_mixed.done` is also processing in parallel. Old log: `[recall-webhook] Bot {id} done with no audio processed — marking as failed`.

**Root cause:** `recall-webhook` received `bot.done` and `audio_mixed.done` within ~16 ms of each other. The `bot.done` handler read the meeting row before the `audio_mixed.done` handler had finished writing `sarvam_job_id`, saw `sarvam_job_id = null`, and incorrectly marked the meeting failed.

**Fix shipped 2026-04-23:** `bot.done` handler now queries Recall's `/audio_mixed/` endpoint directly to check audio status. Only marks failed if Recall confirms `failed` or `missing`. `processing` / `done` / `unknown` → defers.

**Recovery if it happens again:** Manually flip status from `failed` back to `processing`, clear `error_message`, then re-trigger via `check-recall-status`.

---

### `recall:transcribing_deadlock`
**What it looks like:** Meeting status stuck at `transcribing` indefinitely. `check-recall-status` logs show `Sarvam job ... is COMPLETED but webhook was not received — triggering now`, then `sarvam-webhook` returns "Meeting already transcribing, skipping".

**Root cause:** `check-recall-status` was using `status = 'transcribing'` as an optimistic lock before calling `sarvam-webhook`. But `sarvam-webhook` had `'transcribing'` in its idempotency-skip list (to protect the Whisper-fallback path), so it refused to process. Two handlers communicating through the same string field with different meanings.

**Fix shipped 2026-04-23:** Added `meetings.sarvam_webhook_triggered_at` column. `check-recall-status` now uses an atomic `IS NULL` claim on that column instead of touching `status`. Lock is released on webhook failure so future polls can retry.

**Recovery if it happens again:** Manually `UPDATE meetings SET status = 'processing', sarvam_webhook_triggered_at = NULL` then call `sarvam-webhook` directly with the `sarvam_job_id`.

---

### `recall:bot_kicked_silent_failure`
**What it looks like:** Meeting status stuck in `processing` after the bot was clearly kicked from the waiting room. Recall events show `bot.call_ended` with `sub_code: timeout_exceeded_waiting_room` but nothing in our DB updates.

**Root cause:** `recall-webhook` (and other functions) wrote `error_message` to the `meetings` table on every failure path, but **the `error_message` column did not exist**. PostgREST silently rejects the entire UPDATE when any column is invalid — so the status update to `failed` never happened. The meeting stayed `processing` forever.

**Fix shipped 2026-04-25:** Added migration `20260424170000_meetings_error_message.sql`. The column now exists and writes succeed.

**Recovery if it happens again:** This shouldn't recur. If it does, check whether another column referenced in the failing UPDATE was added by code without a matching migration.

---

## Speaker mapping errors

### `speakers:phantom_speaker_when_one_participant`
**What it looks like:** A meeting with one participant shows `SPEAKER_01` segments interleaved with the real participant's name. Frontend renders two speakers when there was only one.

**Root cause:** Sarvam's diarization in translate mode often labels everyone as `speaker_id: 0`. Our per-segment mapping uses Recall's speaker timeline (which entries have a `participant.speech_on` event), but Recall's speech detection has a confidence threshold — short utterances ("hmm", "this", a cough) are transcribed by Sarvam but fall outside any Recall timeline window, so they get the `SPEAKER_XX` fallback.

**Fix shipped 2026-04-24:** When `recall_participants.length === 1`, short-circuit the timeline overlap logic and attribute every Sarvam segment to that single participant. For multi-participant meetings, added a nearest-neighbor fallback (closest Recall timeline entry by midpoint distance) so we never fall back to `SPEAKER_XX` if any Recall name is available.

---

## Database schema errors

### `db:missing_error_message_column`
**What it looks like:** Any UPDATE to `meetings` that includes `error_message` returns PostgREST error `PGRST204: Could not find the 'error_message' column`. Code paths writing it silently fail because they don't check the result.

**Root cause:** Code shipped writing to a column that was never added via migration.

**Fix shipped 2026-04-25:** `ALTER TABLE meetings ADD COLUMN error_message TEXT`.

**Lesson:** When edits add a new column reference in code, the harness `audio_mixed_failed_marks_meeting_failed` and `bot_kicked_waiting_room` scenarios will catch it.

---

## How this file is maintained

1. The `monitor-stuck-meetings` cron carries a `KNOWN_SIGNATURES` set in code. When it detects a stuck meeting whose signature is **not** in that set, it sends an email to `amaan@oltaflock.ai` with subject `[ECHOBRIEF NEW ERROR] <signature>`.
2. When you receive such an email, investigate the meeting, then:
   - Add the new error to this file with the same structure (signature / what it looks like / root cause / recovery).
   - Add the signature to `KNOWN_SIGNATURES` in [`supabase/functions/monitor-stuck-meetings/known-patterns.ts`](supabase/functions/monitor-stuck-meetings/known-patterns.ts).
   - Add a recovery handler (or `none` if manual-only) and redeploy.
3. The full audit trail of every error the cron has ever seen lives in the `monitor_events` table. `errors.md` is the curated runbook; `monitor_events` is the raw history.
