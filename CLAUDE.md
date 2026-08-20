# CLAUDE.md

## Project Overview

EchoBrief is an AI meeting intelligence platform. It consists of two main parts:
1. **React web app** (Vite + TypeScript) -- dashboard for viewing meetings, transcripts, insights, calendar, action items, settings
2. **Supabase backend** -- PostgreSQL database, Auth, Storage (audio files), and Deno Edge Functions for processing

Recording is **bot-only** via Recall.ai. There is no browser extension — it was removed from the codebase.

## Quick Commands

```bash
npm run dev              # Start Vite dev server (port 8080)
npm run build            # Production build
npm run lint             # ESLint
npm run functions:serve  # Serve Supabase Edge Functions locally (needs supabase/.env.local)
```

## Architecture

### Recording Flow
**Dashboard (bot-only):** User enters a meeting URL → `start-recall-recording` creates a Recall bot (with real-time transcription enabled via `recallai_streaming`) → bot joins and records → `recall-webhook` receives `audio_mixed.done` event → audio downloaded from Recall + Recall transcript fetched (via `media_shortcuts.transcript` download URL) for real participant names → audio routed through the **Vercel `api/split-audio` function**, which ffmpeg-splits long audio into 300 s re-encoded chunks and submits them as ONE multi-file Sarvam job in translate mode (async, webhook callback); falls back to direct single-file Sarvam submission if the splitter is unavailable → `sarvam-webhook` receives the callback. **Chunking exists because Sarvam's saaras:v3 silently returns EMPTY transcripts for long audio (duration-triggered server bug, confirmed 2026-06-09: 47 min fails, 5–6 min chunks of the same file succeed; chunks must be re-encoded — stream-copy is rejected).** For chunked jobs the webhook downloads outputs `0.json..N.json` in order and stitches them, offsetting timestamps by `chunk_index × chunk_seconds`. If Sarvam returns a usable transcript, `sarvam-webhook` maps speakers (single-participant fast path or per-segment time-overlap with nearest-neighbor fallback against Recall's speaker timeline). **If Sarvam returns a download error, an empty transcript, or the well-known `KeyError: 'timestamps'` server bug, `sarvam-webhook` automatically falls back to Whisper via `process-meeting` with `forceWhisper: true`.** GPT-4o-mini generates insights → saves to DB → optionally delivers via email.

**`bot.done` race-safety:** When `bot.done` arrives but `sarvam_job_id` is not yet written (because `audio_mixed.done` is still mid-flight), the handler queries Recall's `/audio_mixed/` endpoint directly for the actual audio status. Only `failed` / `missing` mark the meeting failed — `done`, `processing`, and `unknown` defer to the audio_mixed handler.

**`check-recall-status` / `sarvam-webhook` decoupling:** `check-recall-status` claims its trigger on the `meetings.sarvam_webhook_triggered_at` column (atomic `IS NULL` lock) before invoking `sarvam-webhook`. It does not touch `status`, so the webhook's existing `transcribing` skip-guard (which protects the Whisper-fallback path) doesn't deadlock the recovery.

### Key Files

**Web App:**
- `src/App.tsx` -- Routes, providers (Auth, Recording, Theme, Query)
- `src/contexts/AuthContext.tsx` -- Supabase auth state, signIn/signUp/signOut, password recovery flow detection
- `src/contexts/RecordingContext.tsx` -- Recording state management
- `src/pages/` -- Dashboard, Recordings, MeetingDetail, Calendar, ActionItems, Settings, Auth, Landing
- **Data fetching / caching:** `App.tsx` sets global TanStack Query defaults (`staleTime` 60s, `refetchOnWindowFocus: false`) so revisiting a page renders instantly from cache instead of re-fetching cold. `Dashboard.tsx` and `MeetingDetail.tsx` use cached queries (the dashboard runs its profile + meetings reads in parallel; realtime `postgres_changes` patches/invalidates the query cache rather than re-fetching). `Settings.tsx` intentionally stays on local `useState` — it's a form page with write-on-load side effects and user-mutated lists, a poor fit for read-caching. See README challenge #21.

**Edge Functions (Deno):**
- `supabase/functions/process-meeting/` -- Orchestrates transcription (Sarvam primary, Whisper fallback) + GPT insight generation. Whisper currently OOMs in the edge function for audio > ~15 MB — see `errors.md` `whisper:oom` entry.
- `supabase/functions/sarvam-webhook/` -- Async callback from Sarvam STT. Auto-falls-back to Whisper on any download error (covers Sarvam's `KeyError: 'timestamps'` server bug on long audio).
- `supabase/functions/recall-webhook/` -- Receives Recall lifecycle events. `bot.done` queries Recall's `/audio_mixed/` endpoint to avoid race-marking good meetings as failed. Terminal classification via `classifySubCode()`: a bot kicked / not admitted *before* recording → **`cancelled`** (neutral, no audio was captured); bad/expired link → `failed`; genuine pipeline failures (`audio_mixed.failed`, etc.) → `failed`. A bot kicked *after* recording still emits `audio_mixed.done` and completes normally — that path is untouched. (README #23.)
- `supabase/functions/check-recall-status/` -- Polled by frontend; uses `sarvam_webhook_triggered_at` atomic lock to re-fire the Sarvam webhook when the callback was missed.
- `supabase/functions/monitor-stuck-meetings/` -- Cron-scheduled (every 15 min via pg_cron — see Scheduled Jobs below). Detects meetings stuck >15 min in non-terminal status, classifies via signature, attempts known recovery, logs to `monitor_events`, emails `amaan@oltaflock.ai` via Resend on failure or unknown signature. Carries a copy of known signatures in `known-patterns.ts` mirroring `errors.md`.
- `supabase/functions/_shared/insights.ts` -- Hallucination detection, GPT prompt, insight saving, delivery
- `supabase/functions/_shared/sarvam.ts` -- Sarvam API client (create job, upload, start). Uses `mode: "translate"` to output English regardless of source language, with `with_diarization: true`.
- `supabase/functions/_shared/recall-pipeline.ts` -- Shared Recall audio download + Sarvam submission logic (used by recall-webhook and check-recall-status). Fetches Recall's transcript via `media_shortcuts.transcript` download URL (the old `/bot/{id}/transcript/` endpoint is deprecated) to extract real participant names and build a speaker timeline (speaker name + time range) stored in `processing_config` for per-segment mapping in sarvam-webhook. Also exports `getAudioMixedStatus()` used by the bot.done race-safety check.
- `supabase/functions/_shared/cors.ts` -- CORS headers shared across functions

### Scheduled Jobs (pg_cron + pg_net)

Three cron jobs invoke edge functions over HTTP via `pg_net`. **Frequencies are kept deliberately low to protect the Supabase Disk IO Budget:** each tick writes a `pg_net` request + response row and a `cron.job_run_details` row, and on a small compute instance that *write* churn — not reads (the dataset is tiny and fully cached, hit rate 1.00) — is what depletes the IO budget. Root-caused 2026-06-13; see README challenge #22.

- `auto-join-meetings` — **every 5 min**. Sends a Recall bot to calendar meetings starting within the next 7 min. The look-ahead window must stay ≥ the cron interval so no meeting is missed between polls; the function's per-calendar-event dedup guard prevents duplicate bots.
- `monitor-stuck-meetings` — **every 15 min**. Stuck-meeting detection (threshold >15 min).
- `prune-job-logs` — **daily 03:15 UTC**. Trims `cron.job_run_details` (>7 d) and `net._http_response` (>1 d) so the bookkeeping tables don't accumulate.

**Do not raise these frequencies without checking the Disk IO Budget.** If finer scheduling is ever required, move it off the database to a free external scheduler (cron-job.org / GitHub Actions) calling the edge functions directly — NOT Vercel Cron (its free tier caps cron jobs at once-per-day) and NOT a paid compute upgrade.

### Database

PostgreSQL with Row-Level Security. Key tables:
- `meetings` -- metadata (title, source, status, audio_url, **`error_message`**, **`sarvam_webhook_triggered_at`**, `sarvam_job_id`, `processing_config`)
- `transcripts` -- transcript text + speaker segments (JSONB)
- `meeting_insights` -- AI output (summary, action_items, decisions, risks, timeline, metrics)
- `monitor_events` -- audit trail of every stuck-meeting detection from the monitor cron. Deduped via a generated `hour_bucket` column (one row per meeting+signature+hour). See `errors.md` for signature reference.
- `profiles` -- user settings, integration flags
- `user_oauth_tokens` -- Google OAuth tokens
- `notion_connections`, `meeting_notifications`, `action_item_completions`

All user-scoped tables enforce `auth.uid() = user_id` RLS policies. `monitor_events` is service-role-only.

Migrations are in `supabase/migrations/`. Recent additions worth knowing about:
- `20260422170000_sarvam_webhook_trigger_lock.sql` — adds `meetings.sarvam_webhook_triggered_at` (decouples check-recall-status from the `transcribing` status sentinel)
- `20260424170000_meetings_error_message.sql` — adds the `error_message` column that all failure-path UPDATEs were silently failing on for weeks
- `20260425170000_monitor_events.sql` — monitor audit trail
- `20260425170100_monitor_stuck_meetings_cron.sql` — pg_cron schedule for the monitor
- `20260613120000_reduce_cron_frequency.sql` — cuts auto-join (1→5 min) and monitor (5→15 min) cron frequency; the `net.http_post` calls these crons fired were 94.4% of all DB execution time and were depleting the Disk IO Budget (README #22)
- `20260613120100_prune_cron_pgnet_bookkeeping.sql` — daily prune of `cron.job_run_details` + `net._http_response`

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router v6, TanStack Query, Framer Motion
- **Backend:** Supabase (PostgreSQL, Auth, Storage, Edge Functions on Deno)
- **AI:** Sarvam AI (STT in translate mode — outputs English from any language), OpenAI Whisper (fallback STT), GPT-4o-mini (insights)
- **Integrations:** Google Calendar OAuth, Notion OAuth, email delivery
- **Hosting:** Vercel (frontend), Supabase (backend)

## UI Component Library

Uses shadcn/ui (Radix primitives + Tailwind). Components are in `src/components/ui/`. Do not modify these directly -- they are generated.

Custom components are in `src/components/dashboard/`, `src/components/meeting/`, and `src/components/landing/`.

## Brand

See `BRAND.md` for colors (orange/amber gradient primary, stone neutrals), typography (Outfit headings, DM Sans body), and design guidelines.

## Environment Variables

**Frontend (.env):**
- `VITE_SUPABASE_URL` -- Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` -- Supabase anon key

**Edge Functions (Supabase secrets):**
- `OPENAI_API_KEY` -- Required for Whisper + GPT
- `SARVAM_API_KEY` -- Required for Sarvam STT
- `RESEND_API_KEY` -- Required for email delivery via Resend
- `RECALL_API_KEY` -- Required for bot-based meeting recording
- `SPLIT_AUDIO_URL` -- URL of the Vercel split-audio function (`https://www.echobrief.in/api/split-audio`); if unset, recall-pipeline falls back to direct single-file Sarvam submission
- `SPLIT_AUDIO_SECRET` -- Bearer secret for the split-audio function (must match the Vercel env var of the same name)
- Google OAuth client ID/secret

**Vercel (api/ functions — set in the Vercel dashboard of the account that owns echobrief.in; deploys happen via GitHub auto-deploy on push, NOT the CLI):**
- `SARVAM_API_KEY` -- split-audio submits chunks to Sarvam directly
- `SPLIT_AUDIO_SECRET` -- shared bearer secret (same value as the Supabase secret)
- `OPENAI_API_KEY` -- split-audio's `transcribe: "whisper"` mode (chunk-wise Whisper fallback when a chunked Sarvam job returns empty); mode 500s gracefully if unset and the webhook falls through to the legacy path

## Auth Flow Notes

- Password recovery detection (`isPasswordRecovery`) lives in `AuthContext` — it is the single source of truth for whether the user is in a password reset flow. It's set synchronously from URL params on init (before Supabase clears the hash) and also via the `PASSWORD_RECOVERY` auth event. `App.tsx` uses this flag to force-render the Auth page during recovery, preventing auto-redirect to dashboard.
- Supabase's recovery token exchange auto-authenticates the user. Any routing logic must check for recovery state **before** checking for an active session, otherwise the user skips the "set new password" form.

## Rules

- **95% confidence rule:** Do not make a code change unless you are 95% confident it is correct. If unsure, explain the concern and ask before changing. This applies to every change — bug fixes, new features, refactors, all of it.

- **Test before committing or deploying:** After making any change — whether it's a frontend tweak, Edge Function update, or migration — verify it actually works before committing or deploying. For frontend changes, run `npm run build` to catch type errors and confirm the dev server renders correctly. For Edge Functions, run `npm run functions:serve` and exercise the relevant endpoint. For database migrations, apply locally and check the result. Don't assume a change works just because it looks right — confirm it. Only then commit and deploy.

- **Run the unit harness on any shared-logic change:** `npm run test:unit` (deno test, mocked fetch, <1 s, no prod contact). Covers recall-pipeline parsing/fallbacks, audio_mixed status mapping, chunk-stitch math (`_shared/stitch.ts`), and Sarvam output discovery/ordering.

- **Run the pipeline harness before deploying any edge function or migration:** `python3 scripts/pipeline-test/harness.py`. Takes ~90 seconds, hits real prod against the deployed code, creates and deletes `[harness]`-prefixed test meetings. 11/11 must pass. Add `--live` before risky pipeline deploys: runs `live_sarvam_e2e` (real fixture audio → deployed splitter → real chunked Sarvam job → stitched completion, ~3 min) which doubles as a Sarvam contract check. The harness has already caught two real prod bugs that would have hit users (the missing `error_message` column and the `transcribing` deadlock). See [`scripts/pipeline-test/`](scripts/pipeline-test/).

- **Run the output-quality evals before deploying anything that touches transcription or insights:** `python3 scripts/evals/run_evals.py`. 8 evals (4 deterministic + 4 LLM-judge) over the static dataset, including a judge-calibration case that must FAIL. Exit code gates the deploy. See [`scripts/evals/EVALS.md`](scripts/evals/EVALS.md) for the harness-vs-evals distinction and how to grow the dataset from prod meetings.

- **Update `errors.md` and `known-patterns.ts` together:** When the monitor emails a `[ECHOBRIEF NEW ERROR]`, investigate, then add the new signature to **both** `errors.md` (human runbook) and `supabase/functions/monitor-stuck-meetings/known-patterns.ts` (programmatic mirror). They drift if you only update one.

- **Don't raise pg_cron frequency without checking the Disk IO Budget:** the database doubles as the job scheduler (`pg_cron` + `pg_net`), and on a small instance the *write* churn from frequent ticks — not reads — is what depletes the Disk IO Budget (root-caused 2026-06-13: `net.http_post` was 94.4% of all DB execution time). Current cadences (auto-join 5 min, monitor 15 min) are tuned for this. Before making any cron more frequent, confirm headroom with `supabase inspect db` (`db-stats` for cache hit rate, `outliers` for top queries by total time); if finer scheduling is genuinely needed, move it to a free external scheduler instead of the DB. See README challenge #22.

## Conventions

- TypeScript strict mode
- Tailwind for all styling (no CSS modules)
- React Router v6 with `ProtectedRoute` wrapper for auth-gated pages
- TanStack Query for server state, React Context for client state (auth, recording, theme)
- Edge Functions use shared modules from `supabase/functions/_shared/`

## Operations

- **Unit harness:** [`supabase/functions/tests/`](supabase/functions/tests/) — `npm run test:unit`. 26 deno tests with mocked fetch: recall-pipeline URL-discovery/fallback chains, `getAudioMixedStatus` defer semantics, `stitchChunkResults` offsets/sorting, `downloadAllSarvamResults` numeric ordering.

- **Pipeline test harness:** [`scripts/pipeline-test/harness.py`](scripts/pipeline-test/harness.py). 11 default scenarios: happy path, chunked-stitch (timestamp offsets + ordering), speaker mapping (timeline overlap + nearest-neighbor → real names, no SPEAKER_XX), split-audio endpoint probes (401/400 contract), the bot.done/audio_mixed.done race, audio_mixed.failed, kicked-from-waiting-room, sarvam-webhook idempotency, concurrent sarvam-webhook calls, monitor recovers known / logs unknown signature. `--live` adds `live_sarvam_e2e` (real Sarvam over the fixture at `recordings/harness-fixtures/live-e2e.mp3`). Real DB, real edge functions, real Resend. Takes ~90s (+~3 min with --live).

- **Full bot drill (manual, stages A–B):** after bot-flow changes or before re-enabling auto-join — open a Meet, start a bot from the dashboard, admit it, play a few minutes of speech, verify the meeting completes with named speakers. Procedure in README's Testing section.

- **Output-quality evals:** [`scripts/evals/`](scripts/evals/). 8 evals (schema, English output, stitch integrity, speaker attribution, action-item recall/precision, summary faithfulness, decision accuracy) with gpt-4o-mini as judge. `--snapshot <meeting-id>` pulls a prod meeting into the dataset (the production→eval feedback loop). See [`scripts/evals/EVALS.md`](scripts/evals/EVALS.md).

- **Long-audio chunking:** [`api/split-audio.ts`](api/split-audio.ts) (Vercel function, ffmpeg). Splits >6-min audio into 300 s chunks for Sarvam (its saaras:v3 silently returns empty transcripts on long files — see `errors.md` `sarvam:silent_empty_output`). Deployed via GitHub auto-deploy; the Vercel account that owns echobrief.in is separate — do NOT use the local Vercel CLI for it.

- **Errors runbook:** [`errors.md`](errors.md). Canonical list of every error pattern the pipeline can hit, with root cause, recovery action, and resolution status. The monitor cron's `KNOWN_PATTERNS` set in [`supabase/functions/monitor-stuck-meetings/known-patterns.ts`](supabase/functions/monitor-stuck-meetings/known-patterns.ts) is the programmatic mirror.

- **Stuck-meeting alerts:** the monitor cron emails `amaan@oltaflock.ai` from `notifications@oltaflock.ai` (Resend). Subject prefixes: `[ECHOBRIEF]` for known-pattern recovery failures, `[ECHOBRIEF NEW ERROR]` for unrecognized signatures, `[ECHOBRIEF HARNESS TEST]` for alerts triggered by `[harness]`-prefixed test meetings (expected during harness runs — real delivery is part of the test).

- **Manual recovery script:** [`/tmp/recover_meeting.py`](/tmp/recover_meeting.py) — downloads audio from Supabase Storage, calls Whisper locally, calls GPT-4o-mini, writes transcript + insights + completed status. Used when both Sarvam and the in-edge-function Whisper fall through (typically long-audio OOM). Update the meeting ID at the top of the file before running.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
