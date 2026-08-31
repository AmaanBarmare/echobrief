# Edge Function Reference

All Supabase Edge Functions run on Deno at
`https://<project>.supabase.co/functions/v1/<name>`.

`verify_jwt` is declared per function in [`supabase/config.toml`](../supabase/config.toml).
**Only `chat-transcripts` and `get-recording-media` have `verify_jwt = true`** — every other function either
authenticates itself (webhook signature, shared secret, service-role bearer) or reads
the caller's token manually. Treat that as a deliberate, audited choice, not an
oversight; see [Security § function auth](security.md#edge-function-authentication).

- [Pipeline](#pipeline)
- [Recording control](#recording-control)
- [Intelligence](#intelligence)
- [Calendar and OAuth](#calendar-and-oauth)
- [Delivery](#delivery)
- [Operations](#operations)
- [Outside Supabase](#outside-supabase)

---

## Pipeline

### `recall-webhook`
**Trigger:** Recall.ai HTTP callback · **Auth:** signature verified against raw body

Receives every bot lifecycle and media event. Maps status codes to meeting status,
classifies terminal sub-codes into `cancelled` vs `failed`, and on `audio_mixed.done`
hands off to the shared Recall pipeline (transcript fetch → speaker timeline → audio
download → splitter → Sarvam).

`bot.done` race-safety: when `sarvam_job_id` is not yet written, the handler queries
Recall's `/audio_mixed/` endpoint directly. Only `failed` / `missing` mark the meeting
failed — `done`, `processing`, and `unknown` defer to the audio_mixed handler.

---

### `sarvam-webhook`
**Trigger:** Sarvam job-completion callback · **Auth:** callback `auth_token` set at job creation

The longest function in the codebase (554 lines) and the pipeline's real centre of gravity.

1. Skips meetings already `completed` (idempotency), then takes an **atomic
   in-flight claim** on `meetings.sarvam_webhook_claimed_at` for terminal
   callbacks. Sarvam re-fires the same callback every ~8 s while this handler is
   working (it answers only after download → stitch → GPT → email), and the
   status check alone cannot stop those: every retry reads the row before any of
   them writes `completed`. Claims older than 10 min are re-claimable.
2. For chunked jobs, downloads outputs `0.json … N.json` in numeric order and stitches
   them with `i × chunk_seconds` offsets, then time-sorts.
3. On empty output or any download error, falls back to chunk-wise Whisper via the
   splitter. Whole-file Whisper is used only for short meetings; long recordings
   never take that hop.
4. Maps speakers per segment against Recall's timeline, retrying the timeline fetch
   once if it is missing.
5. Runs the post-transcription passes — language mix, leaked-Devanagari translation,
   entity correction, privacy boundary zones (see
   [pipeline.md](pipeline.md#post-transcription-passes-2026-08-31)) — then two-pass
   insights, conversation metrics and the coaching report on the **meeting zone only**,
   saves (`transcripts`, `meeting_insights` incl. `facts`/`coaching`, `meetings.languages`
   / `boundaries`), and delivers. Expect ~60–90 s more per callback than before; the
   in-flight claim absorbs Sarvam's retries meanwhile.

---

### `process-meeting`
**Trigger:** invoked by other functions · **Auth:** service-role bearer

Orchestrates transcription and insight generation directly. Accepts `forceWhisper`
and transcript-reuse flags. The Sarvam path here is **async webhook-based**, so this
function cannot be used for a synchronous insight regeneration. Runs the same
post-transcription passes as `sarvam-webhook` (the transcript row is updated in place
with the translated/corrected/zoned segments).

> ⚠️ In-edge Whisper OOMs above ~15 MB of audio. See `whisper:oom` in
> [`errors.md`](../errors.md).

---

### `check-recall-status`
**Trigger:** polled by the frontend while a meeting is in flight · **Auth:** none (`verify_jwt = false`)

Syncs live bot status from Recall into the DB, and recovers meetings whose Sarvam
callback was lost. Claims the recovery with an atomic
`sarvam_webhook_triggered_at IS NULL` update — a dedicated column, **not** the
`status` field, so the webhook's `transcribing` skip-guard cannot deadlock it.

---

## Recording control

### `start-recall-recording`
**Trigger:** dashboard · **Auth:** caller JWT read manually

Creates a Recall bot with `recallai_streaming` real-time transcription enabled,
requests both `audio_mixed_mp3` (transcription) and `video_mixed_mp4` (playback), and
inserts the `meetings` row at `status = joining`. Retention is pinned to
`{ type: "timed", hours: 168 }` — Recall stores media free for 7 days and bills past
it, and nothing needs the recording that long. The recording_config must stay in sync
with `auto-join-meetings`.

### `get-recording-media`
**Trigger:** meeting page, Recording tab · **Auth:** caller JWT (`verify_jwt = true`)

Resolves a short-lived playback URL for one meeting and returns
`{ kind: "video" | "audio" | "none", url?, video_status? }`. Video comes from Recall's
`video_mixed` artifact (signed by Recall, expires in hours — resolved per view, never
persisted); if there is no video it signs the archived mp3 in the `recordings` bucket
instead. The meeting is read scoped to the caller's `user_id`, so a playback URL can
only ever be minted for one's own meeting.

> The mp4 is never downloaded into Supabase Storage — 720p costs ~750 MB–1 GB per
> hour against a 1 GB bucket cap. See `storage:bucket_full_blocks_pipeline` in
> [`errors.md`](../errors.md) for what a full bucket does to the pipeline.

### `auto-join-meetings`
**Trigger:** pg_cron, every 5 min · **Auth:** none

For every profile with `auto_join_enabled`, dispatches a bot to calendar events
starting within 7 minutes. Per-event dedup guard plus a unique index prevent duplicate
bots across overlapping polls.

---

## Intelligence

### `chat-transcripts`
**Trigger:** the `/chat` page · **Auth:** `verify_jwt = true`, caller's JWT used for retrieval

Question-answering over the caller's own meeting transcripts. Uses the **caller's
token rather than the service-role key** so Postgres RLS — not an application-level
`user_id` filter — does the scoping. Full design rationale in
[Chat & analytics](chat-and-analytics.md).

**Request**
```json
{ "question": "What did we decide about pricing?",
  "history": [{ "role": "user", "content": "..." }] }
```

**Response**
```json
{ "answer": "...",
  "citations": [{ "meeting_id": "...", "title": "...", "date": "2026-08-20" }],
  "context_meetings": 12, "context_tokens": 41230, "truncated": false }
```

### `generate-meeting-insights`
**Trigger:** manual / dashboard · **Auth:** none

Insight generation entry point for a meeting that already has a transcript.

### `generate-digest-report`
**Trigger:** scheduled and manual · **Auth:** none

Builds weekly/monthly aggregate digests across a user's meetings.

---

## Calendar and OAuth

| Function | Purpose |
|---|---|
| `google-oauth-start` | Begins the OAuth flow, persists a `google_oauth_states` row |
| `google-oauth-callback` | Exchanges the code, stores tokens in `user_oauth_tokens` |
| `google-oauth-redirect` | Redirect shim that returns the user to `return_to` |
| `get-google-client-id` | Serves the public client ID to the frontend |
| `disconnect-google` | Revokes and clears stored Google tokens |
| `sync-google-calendar` | Full sync of a single Google calendar |
| `sync-calendars` | Discovers and syncs the user's calendar list |
| `sync-calendar-events` | Event-level sync into `calendar_events` |
| `fetch-google-calendars` | Lists calendars available on the Google account |
| `fetch-calendar-events` | Reads events for the UI |
| `get-user-calendars` | Reads the user's connected calendars from the DB |

---

## Delivery

| Function | Purpose |
|---|---|
| `send-meeting-email` | The real summary email (HTML). Called by `deliverResults` once for the owner, then once per allowlisted reviewer on the invite (`recipientEmail` in the body). Claims `email_deliveries` **before** calling Resend, so one recipient gets one summary per meeting no matter how many callers race; returns `{ success: true, skipped: true, reason: "already_sent" }` to a loser. |
| `send-meeting-summary-email` | Thin summary-only variant |
| `send-email-report` | Digest/report email rendering and send |
| `send-scheduled-emails` | Drains scheduled sends |
| `queue-onboarding-emails` | Enqueues the onboarding sequence |

All email goes through **Resend**, from `hello@echobrief.in`.

> `echobrief.in` is the only verified sending domain on the Resend account.
> Any from-address on `oltaflock.ai` returns 403.

Delivery is suppressed for `[harness]`-prefixed meetings unless `HARNESS_EMAILS=true`.

---

## Operations

### `monitor-stuck-meetings`
**Trigger:** pg_cron, every 15 min · **Auth:** none

Finds meetings sitting >15 minutes in a non-terminal status, derives a signature,
and acts:

| Outcome | Action |
|---|---|
| Signature in `KNOWN_PATTERNS` | Attempt the canonical recovery (force Whisper / re-trigger Sarvam / check Recall / mark failed) |
| Recovery fails | Email `ALERT_EMAIL_TO` with subject prefix `[ECHOBRIEF]` |
| Signature unknown | Email with prefix `[ECHOBRIEF NEW ERROR]` |
| Meeting is `[harness]`-titled | Prefix `[ECHOBRIEF HARNESS TEST]`, **suppressed** unless `HARNESS_EMAILS=true` |

A `monitor_events` row is written in every case — deduped by a generated `hour_bucket`
column, so one row per meeting + signature + hour. The harness asserts on the row, not
the email.

Known signatures live in
[`known-patterns.ts`](../supabase/functions/monitor-stuck-meetings/known-patterns.ts),
which **mirrors** [`errors.md`](../errors.md). Update both or they drift.

### `prune-recordings`
**Trigger:** pg_cron, daily 03:30 UTC · **Auth:** none

Clears `audio_url` and deletes the archived mp3 for meetings older than **30 days**
that already have a non-empty transcript — dropping to **7 days** when the bucket is
near its cap. Rows are kept; only the audio goes.

> This exists because the `recordings` bucket hit the 1 GB free-tier cap on
> 2026-08-20, at which point every new upload failed silently and transcription had
> been dead since 2026-08-14. See `storage:bucket_full_blocks_pipeline` in
> [`errors.md`](../errors.md).

---

## Outside Supabase

### `api/split-audio` (Vercel)
**Trigger:** called by `recall-pipeline` and `sarvam-webhook` · **Auth:** `Authorization: Bearer ${SPLIT_AUDIO_SECRET}`

Runs on Vercel because it needs real ffmpeg and ~2 GB of memory.

**Default mode — Sarvam submission**
```jsonc
// request
{ "audioUrl": "https://…signed", "callbackUrl": "…/sarvam-webhook", "callbackToken": "…" }
// response
{ "job_id": "…", "chunk_count": 6, "chunk_seconds": 300, "duration_seconds": 1740 }
```

**Whisper mode — chunk-wise fallback**
```jsonc
// request
{ "audioUrl": "https://…signed", "transcribe": "whisper" }
// response
{ "transcript": "…", "language_code": "en",
  "segments": [{ "text": "…", "start": 0, "end": 4.2 }],
  "chunk_count": 6, "chunk_seconds": 300, "duration_seconds": 1740 }
```

Constants: 300 s chunks, ≤360 s submitted unchunked, max 20 files per Sarvam job,
upload concurrency 6, 270 s internal time budget against Vercel's 300 s ceiling.

Deployed via **GitHub auto-deploy**. The Vercel account that owns `echobrief.in` is
separate — do **not** use the local Vercel CLI for it.
