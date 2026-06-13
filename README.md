# EchoBrief

**AI meeting intelligence platform that records meetings, transcribes conversations, extracts decision-grade insights, and delivers structured follow-ups across dashboard, Slack, email, and digest workflows.**

[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Edge%20Functions-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![OpenAI](https://img.shields.io/badge/OpenAI-Whisper%20%2B%20GPT--4o--mini-412991?logo=openai&logoColor=white)](https://openai.com)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

---

## Table of Contents

- [Overview](#overview)
- [Why This Project Stands Out](#why-this-project-stands-out)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [End-to-End Flows](#end-to-end-flows)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Database Design](#database-design)
- [Edge Functions](#edge-functions)
- [Chrome Extension System Design](#chrome-extension-system-design)
- [Engineering Challenges and Problems Faced](#engineering-challenges-and-problems-faced)
- [Technical Highlights](#technical-highlights)
- [Testing: Harness and Evals](#testing-harness-and-evals)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)
- [Why This Is Strong SE1 Work](#why-this-is-strong-se1-work)
- [License](#license)

---

## Overview

EchoBrief is a full-stack meeting intelligence product built to solve a practical engineering problem: teams spend too much time in meetings, lose decisions in chat threads, forget action items, and rely on weak note-taking tools that either join as bots or produce low-signal summaries.

This system captures meeting audio in two ways:

- **Recall bot path** (primary, exposed in dashboard UI) for bot-based meeting recordings — user enters a meeting URL and a Recall bot joins to record
- **Chrome Extension path** (backend still active, UI removed from dashboard) for browser meetings using Manifest V3 tab capture and an offscreen recording document

Once a meeting is recorded, EchoBrief pushes the audio through an AI pipeline:

- **Sarvam AI** for primary asynchronous speech-to-text in translate mode (outputs English regardless of source language)
- **OpenAI Whisper** as a fallback transcription path
- **GPT-4o-mini** for structured insight generation

The result is not just a transcript. EchoBrief produces:

- executive summaries
- decisions and commitments
- action items with ownership metadata
- timeline-style meeting breakdowns
- delivery to Slack or email
- digest-style recap reports across a week or month

From an engineering perspective, this project demonstrates end-to-end product ownership across frontend, backend, browser extension architecture, database design, OAuth integrations, asynchronous pipelines, and operational edge cases.

---

## Why This Project Stands Out

Most meeting tools stop at transcription. EchoBrief goes deeper in both product and engineering execution.

- **No single-surface app**: this system spans a React SPA, a Chrome MV3 extension, Supabase Edge Functions, PostgreSQL, storage, and third-party AI/integration providers.
- **Real asynchronous workflow design**: transcription is not a synchronous request/response toy flow. Sarvam jobs are submitted asynchronously and completed later by webhook.
- **Multi-provider fault tolerance**: the pipeline automatically falls back from Sarvam to Whisper when needed.
- **Real-world integration complexity**: Google Calendar OAuth, Slack delivery, email delivery, Recall bot orchestration, multi-calendar support, and auth sync between web app and browser extension.
- **Manifest V3 constraints**: Chrome extension recording is implemented with service worker lifecycle handling, offscreen documents, alarm-based keepalive, and persisted state restoration.
- **Portfolio value for recruiters**: the codebase shows the kind of practical full-stack debugging, systems thinking, and product-minded tradeoff handling that entry-level software engineers are expected to grow into quickly.

---

## Key Features

| Area | Capabilities |
|---|---|
| **Recording** | Recall-based meeting bot recording (primary, dashboard UI), Chrome extension recording for Meet and Zoom (backend only, UI removed from dashboard), manual recording controls, active recording UI |
| **Transcription** | Sarvam batch STT in translate mode (any language → English), OpenAI Whisper fallback, speaker diarization with real name resolution (Recall transcript → per-segment time-overlap matching), timestamp handling, hallucination filtering |
| **AI Insights** | Executive summary, short summary, action items, decisions, risks, questions, timeline, engagement-style meeting metrics |
| **Calendar** | Google OAuth, multi-calendar support, calendar event syncing, meeting-link extraction, upcoming meeting views |
| **Delivery** | Slack summary delivery, meeting email delivery, scheduled email workflows, digest report generation, WhatsApp report pipeline |
| **Dashboard** | Authenticated dashboard, recordings view, meeting detail view, action item tracking, analytics chart, global search, settings (extension status banner removed — dashboard is bot-only) |
| **User Experience** | Protected routes, onboarding, live status updates, responsive interface, animated transitions |
| **Security** | Supabase Auth, Row Level Security, OAuth state tracking, service-role-only server operations, CORS and rate-limiting helpers |

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                               Client Layer                                  │
│                                                                              │
│  React Web App (Vite + TypeScript)            Chrome Extension (Manifest V3) │
│  - Landing, Auth, Dashboard                   - content.js                   │
│  - Recordings, Calendar, Settings             - background.js                │
│  - Meeting detail, Action items               - offscreen.js                 │
│  - Extension token sync                       - popup.js                     │
│                                              - web-bridge.js                │
└───────────────────────────────┬───────────────────────────────┬──────────────┘
                                │                               │
                                │ queries / auth               │ tab capture
                                ▼                               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                            Supabase Platform                                 │
│                                                                              │
│  - PostgreSQL with RLS                                                       │
│  - Auth                                                                      │
│  - Storage for recorded audio                                                │
│  - Realtime subscriptions                                                    │
│  - Edge Functions for ingest, processing, OAuth, sync, and delivery          │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       Vercel Compute (api/ functions)                        │
│                                                                              │
│  - split-audio: ffmpeg chunking for long meetings (Supabase edge functions   │
│    lack ffmpeg + enough memory). Splits >6-min audio into 300 s re-encoded   │
│    chunks and submits ONE multi-file Sarvam batch job.                       │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           External Services                                  │
│                                                                              │
│  - Sarvam AI: primary async STT + diarization (chunked batch jobs)           │
│  - OpenAI: Whisper fallback + GPT-4o-mini insight generation + eval judge    │
│  - Google Calendar API: calendar sync                                        │
│  - Slack API: message delivery                                               │
│  - Resend: email delivery                                                    │
│  - Recall AI: bot-based meeting capture                                      │
│  - Notion OAuth: workspace integration hooks                                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## End-to-End Flows

### 1. Chrome Extension Recording Flow

1. User opens Google Meet or Zoom in Chrome.
2. `content.js` detects a supported meeting page and surfaces recording UI.
3. `background.js` requests a tab capture stream via `chrome.tabCapture.getMediaStreamId`.
4. Because Manifest V3 service workers cannot use DOM recording APIs directly, recording is delegated to `offscreen.js`.
5. `offscreen.js` records audio using `MediaRecorder`, buffers chunks, and uploads on completion.
6. `upload-recording` stores the audio in Supabase Storage and creates the meeting record.
7. `process-meeting` submits the audio to Sarvam or falls back to Whisper.
8. AI insights are generated and persisted.
9. Results become visible in the dashboard and can be delivered to Slack or email.

### 2. Recall Bot Recording Flow

1. User syncs calendars and selects a meeting with a supported meeting link.
2. `start-recall-recording` creates a Recall recording bot and stores the mapping in `meetings`.
3. Recall sends lifecycle events to `recall-webhook`.
4. Once the bot finishes recording, EchoBrief downloads the audio from Recall and fetches Recall's transcript (which contains real participant names from the meeting platform).
5. Audio is archived to Supabase Storage. A speaker timeline (participant name + time ranges) is built from the Recall transcript and stored in `processing_config`.
6. The audio is routed through the **Vercel `api/split-audio` function**: ffmpeg probes the real duration; ≤6-min audio passes through untouched, longer audio is split into 300 s re-encoded chunks. All chunks are submitted as **one multi-file Sarvam batch job** (Sarvam's `saaras:v3` silently returns empty transcripts for long files — see Engineering Challenge #19). If the splitter is unreachable, the pipeline falls back to the legacy direct single-file submission.
7. `sarvam-webhook` receives the completion callback. For chunked jobs it downloads outputs `0.json..N.json` in order, offsets each chunk's timestamps by `chunk_index × chunk_seconds`, time-sorts the merged segments, and stitches one transcript. If the entire chunked job came back empty, it retries through the splitter's **chunk-wise Whisper mode** (each 300 s chunk ≈ 1 MB, so Whisper's 25 MB limit never applies — the fallback works for any meeting length).
8. The webhook maps each Sarvam transcript segment to real participant names using per-segment time-overlap matching against the Recall speaker timeline (this approach works even when Sarvam's diarization assigns all segments to one speaker ID).
9. Transcript with real speaker names is persisted, insights are generated, and downstream delivery (Slack/email) is triggered.

### 3. Insight Generation Flow

1. Transcript text and speaker segments are normalized.
2. Low-signal transcripts are filtered with hallucination heuristics.
3. GPT-4o-mini produces structured JSON outputs instead of freeform text.
4. Results are stored in `meeting_insights`.
5. Delivery functions format summaries for Slack, email, and digest reports.

---

## Tech Stack

### Frontend

| Technology | Why It Was Used |
|---|---|
| **React 18** | Component-driven SPA architecture |
| **TypeScript** | Shared type safety across UI, Supabase types, and integration layers |
| **Vite** | Fast local iteration and lightweight build tooling |
| **React Router v6** | Protected routes and product-style page organization |
| **TanStack Query** | Server-state fetching and cache management |
| **Tailwind CSS** | Fast styling and design consistency |
| **shadcn/ui + Radix UI** | Accessible, composable UI primitives |
| **Framer Motion** | Page transitions and polished interactions |
| **Recharts** | Dashboard analytics and reporting visuals |

### Backend and Platform

| Technology | Why It Was Used |
|---|---|
| **Supabase Auth** | Authentication and session management |
| **Supabase Postgres** | Relational schema, RLS, and product data model |
| **Supabase Storage** | Audio file storage |
| **Supabase Realtime** | Status updates without polling-heavy UI loops |
| **Supabase Edge Functions (Deno)** | Serverless API layer for processing, OAuth, delivery, and webhooks |

### AI and Integrations

| Technology | Why It Was Used |
|---|---|
| **Sarvam AI** | Primary transcription path with translate mode (any language → English output) and asynchronous processing |
| **OpenAI Whisper** | Reliable fallback transcription path |
| **GPT-4o-mini** | Structured insight generation from transcripts |
| **Google Calendar API** | Meeting discovery and calendar sync |
| **Slack API** | Delivery of meeting summaries to channels |
| **Resend** | Transactional email delivery |
| **Recall AI** | Bot-driven meeting recording for calendar-based automation |

### Browser Extension

| Technology | Why It Was Used |
|---|---|
| **Chrome Manifest V3** | Modern extension platform required by Chrome |
| **tabCapture API** | Native browser tab audio capture |
| **Offscreen Documents** | Workaround for MV3 service worker API limitations |
| **chrome.storage.local** | Extension-side state persistence and auth token sync |
| **chrome.alarms** | Keepalive and timeout recovery for long-running recording flows |

---

## Project Structure

```text
echobrief/
├── src/
│   ├── components/
│   │   ├── dashboard/              # Dashboard shell, meeting cards, stats, delivery selectors
│   │   ├── landing/                # Public marketing site sections
│   │   ├── meeting/                # Meeting detail tabs, metrics, timeline views
│   │   └── ui/                     # Reusable design-system style primitives
│   ├── contexts/                   # Auth, recording, calendar, theme state
│   ├── hooks/                      # Media recorder, toast, responsive helpers, action item tracking
│   ├── integrations/supabase/      # Client wiring and generated DB types
│   ├── pages/                      # Landing, auth, dashboard, recordings, meeting detail, settings, calendar
│   ├── services/                   # Recall service client
│   └── types/                      # Shared meeting/data types
├── chrome-extension/
│   ├── background.js               # MV3 service worker, state restore, keepalive, upload coordination
│   ├── content.js                  # Meet/Zoom detection and injected UI
│   ├── offscreen.js                # MediaRecorder runtime in offscreen document
│   ├── popup.js                    # Extension popup controls
│   ├── web-bridge.js               # Web app <-> extension auth/status sync
│   ├── mic-permission.*            # Permission flow for microphone mixing
│   └── manifest.json               # MV3 permissions and content scripts
├── api/
│   └── split-audio.ts              # Vercel function: ffmpeg chunking of long audio + multi-file Sarvam job submission
├── scripts/
│   ├── pipeline-test/              # Pipeline harness: 9 integration scenarios against real deployed functions
│   │   ├── harness.py              # Scenario runner (creates/deletes [harness]-prefixed test meetings)
│   │   ├── client.py               # Supabase REST + webhook client helpers
│   │   └── fixtures.py             # Real webhook payload shapes captured from prod logs
│   └── evals/                      # Output-QUALITY eval suite (8 evals, LLM-as-judge)
│       ├── run_evals.py            # Eval runner: static gate, --meeting-id live grading, --snapshot feedback loop
│       ├── scorers.py              # 4 deterministic + 4 LLM-judge scorers
│       ├── dataset/                # Eval cases incl. judge-calibration + snapshotted prod meetings
│       └── EVALS.md                # Harness-vs-evals doc, thresholds, how to grow the dataset
├── supabase/
│   ├── functions/
│   │   ├── process-meeting/        # Main AI pipeline orchestration
│   │   ├── sarvam-webhook/         # Async STT callback handler
│   │   ├── upload-recording/       # Audio ingest from extension
│   │   ├── start-recall-recording/ # Recall bot creation
│   │   ├── recall-webhook/         # Recall lifecycle + handoff to transcription
│   │   ├── google-oauth-*          # OAuth start/callback/redirect flows
│   │   ├── sync-*                  # Calendar and Notion sync entrypoints
│   │   ├── send-*                  # Slack, email, WhatsApp, scheduled delivery
│   │   ├── generate-*              # Digest and meeting insight generation
│   │   └── _shared/                # CORS, rate limit, Sarvam helpers, insight helpers, Recall pipeline (speaker timeline + audio download)
│   ├── migrations/                 # Schema evolution and feature rollout history
│   └── config.toml
├── docs/                           # Build plans and migration notes
├── public/                         # Static assets and icons
└── package.json
```

---

## Database Design

The current schema supports both the original extension-first recording flow and the newer automation flows around calendars, Recall, and digest reporting.

### Core Tables

```sql
profiles
meetings
transcripts
meeting_insights
action_item_completions
```

### Integration and Scheduling Tables

```sql
user_oauth_tokens
google_oauth_states
calendars
calendar_events
notion_connections
slack_messages
meeting_notifications
```

### Database Design Notes

- **`meetings` is the center of the product model**: it connects recording source, processing state, transcript, insights, and delivery.
- **RLS is enabled broadly**: user-scoped tables enforce data isolation at the database level.
- **Schema evolution is visible in migrations**: the repo includes migrations for Sarvam support, Recall integration, multi-calendar support, onboarding tracking, digest reports, and email delivery tracking.
- **JSONB is used selectively** for flexible fields like attendees, speaker data, action items, and processing configuration.

---

## Edge Functions

| Function | Purpose |
|---|---|
| `upload-recording` | Receives extension audio, stores it, creates meeting rows |
| `process-meeting` | Main ingest pipeline, Sarvam submitter, Whisper fallback path |
| `sarvam-webhook` | Handles async Sarvam callbacks. **For chunked jobs, downloads all chunk outputs in order, offsets timestamps by `chunk_index × chunk_seconds`, time-sorts, and stitches one transcript.** Auto-falls-back to Whisper on any Sarvam download failure (covers the known `KeyError: 'timestamps'` server bug on long audio). |
| `start-recall-recording` | Creates a Recall bot and starts bot-based meeting capture |
| `check-recall-status` | Polls Recall API for live bot status, syncs DB, and triggers the Sarvam pipeline as a fallback when webhooks are missed. Uses an atomic `sarvam_webhook_triggered_at IS NULL` lock (decoupled from `status` to avoid the `transcribing` deadlock). |
| `recall-webhook` | Receives Recall status events and hands completed audio into the AI pipeline. `bot.done` queries Recall's `/audio_mixed/` endpoint to avoid race-marking good meetings as failed. |
| `monitor-stuck-meetings` | Scheduled every 15 min via pg_cron. Detects meetings stuck >15 min in non-terminal status, classifies into a known signature, attempts canonical recovery (force Whisper / re-trigger Sarvam / check Recall / mark failed), logs every detection to `monitor_events`, and emails `amaan@oltaflock.ai` via Resend on recovery failure or unknown signature. |
| `google-oauth-start` / `google-oauth-callback` / `google-oauth-redirect` | Google Calendar OAuth flow |
| `sync-google-calendar` / `sync-calendars` / `fetch-calendar-events` | Calendar sync and event retrieval utilities |
| `send-slack-message` | Delivers summaries to Slack |
| `send-meeting-email` / `send-meeting-summary-email` / `send-email-report` | Email delivery and reporting flows |
| `generate-digest-report` | Builds weekly/monthly meeting digest reports |
| `send-whatsapp-report` | WhatsApp-style report delivery pipeline |
| `generate-meeting-insights` | Insight generation endpoint support |
| `sync-notion` / `notion-oauth-*` | Notion integration plumbing |
| `queue-onboarding-emails` / `send-scheduled-emails` | Lifecycle and scheduled communications |

One function intentionally lives **outside** Supabase: [`api/split-audio.ts`](api/split-audio.ts) runs on Vercel because audio chunking needs real ffmpeg and ~2 GB of memory — Supabase edge functions cap at ~256 MB with no ffmpeg binary (the same constraint that makes the in-edge Whisper path OOM on large files). The edge pipeline calls it over HTTPS with a shared bearer secret and falls back to direct Sarvam submission if it is unreachable.

This function layer is one of the strongest parts of the project because it shows real backend decomposition rather than a single overloaded server file.

---

## Chrome Extension System Design

The Chrome extension is not a basic popup toy. It is a multi-context browser system with:

- `content.js` running inside meeting pages
- `background.js` running as an MV3 service worker
- `offscreen.js` handling recording APIs unavailable to the service worker
- `popup.js` exposing user controls
- `web-bridge.js` syncing auth state from the web app

### Why This Is Technically Interesting

- **Manifest V3 service workers are ephemeral**. Long-running recording cannot rely on in-memory state.
- **Media recording cannot happen directly in the service worker**. An offscreen document is required.
- **State has to survive worker restarts**. Recording metadata is persisted to `chrome.storage.local`.
- **The UI must remain correct across multiple runtime contexts**. Popup, content script, and offscreen recording state all have to stay aligned.
- **Meeting detection avoids broad `tabs` permission scanning**. Detection is delegated to content scripts loaded only on relevant hosts.

---

## Engineering Challenges and Problems Faced

This section is intentionally detailed because the hardest part of this project was not generating a pretty UI. It was making a fragile, multi-runtime, multi-provider system reliable enough to feel like a real product.

### 1. Manifest V3 service worker restarts broke long-running recordings

**Problem:** recordings could outlive the background service worker, causing the extension to lose track of active state.

**Why it happened:** MV3 background scripts are not persistent. Chrome can terminate the worker even while recording is logically still in progress.

**What I changed:**

- persisted recording state in `chrome.storage.local`
- restored state during worker startup
- verified offscreen document existence during restore
- added `chrome.alarms` keepalive handling

**Why this matters:** this is a real distributed-state problem inside the browser. Solving it required treating the extension as a system of unreliable processes rather than a single app.

### 2. MediaRecorder could not run in the service worker

**Problem:** direct recording from `background.js` was not possible.

**Why it happened:** MV3 service workers do not have DOM access and cannot use APIs like `MediaRecorder` the same way a document context can.

**What I changed:**

- created an offscreen document
- forwarded stream setup from the service worker into `offscreen.js`
- used message passing for start/stop lifecycle coordination

**Why this matters:** this is the key architectural workaround that makes Chrome-native meeting capture possible without a visible recording tab.

### 3. Stop-recording race conditions caused UI and upload inconsistencies

**Problem:** a stop action could clear state too early, preventing the final completion message from reaching the right tab.

**Why it happened:** asynchronous completion messages arrived after the service worker had already nulled out key identifiers like `tabId`.

**What I changed:**

- split "mark recording stopped" from "fully reset all state"
- delayed destructive cleanup until `RECORDING_COMPLETED` or failure signals arrived
- added a safety timeout alarm to recover when completion never arrives

**Why this matters:** this is a classic async coordination bug across runtime boundaries.

### 4. UI state diverged across popup, content script, and recorder

**Problem:** the popup could say "ready" while the page UI still showed a recording state, or the page indicator could remain after stop.

**Why it happened:** multiple independent execution contexts were each rendering state derived from partial information.

**What I changed:**

- centralized recording truth in persisted extension state
- added cleanup paths for every recording-end state
- used periodic state verification to detect mismatches

**Why this matters:** debugging cross-context UI consistency is much closer to distributed systems debugging than normal component debugging.

### 5. Low-signal audio created transcript hallucinations

**Problem:** silence, noisy recordings, or weak meeting audio could still return convincing but wrong transcript text.

**Why it happened:** speech models can hallucinate repetitive filler or common phrases when input quality is poor.

**What I changed:**

- added hallucination heuristics before insight generation
- filtered repetitive transcripts and known junk output patterns
- treated empty/invalid transcripts as a separate product state instead of letting bad input contaminate downstream summaries

**Why this matters:** building AI products requires defensive engineering around model failure modes, not blind trust in API responses.

### 6. Browser-only recording and bot-based recording needed to coexist

**Problem:** the product evolved from a Chrome-extension-only recorder into a platform that also supports Recall-based recording initiated from calendar events.

**Why it happened:** extension capture is great for manual browser usage, but automated meeting workflows need bot-style joining and recording.

**What I changed:**

- added Recall integration and webhook handling
- unified both recording paths under the same `meetings -> transcript -> insights -> delivery` pipeline
- preserved one downstream processing model even though ingest mechanisms differ

**Why this matters:** this demonstrates architectural adaptability without rewriting the whole backend.

### 7. Multi-calendar support changed the original data model

**Problem:** the earlier Google-calendar-linked model was too narrow once users needed multiple calendars and more flexible event sync.

**Why it happened:** a single-calendar assumption breaks quickly in real productivity products.

**What I changed:**

- introduced `calendars` and `calendar_events` tables
- added provider metadata, active flags, sync configuration, and indexes
- updated settings and calendar pages to read from the new model

**Why this matters:** this is a good example of schema evolution driven by product requirements, not just code cleanup.

### 8. Extension auth had to work without a second login flow

**Problem:** requiring users to sign in separately inside the extension would create friction and duplication.

**Why it happened:** the web app and extension run in separate contexts with different storage and auth boundaries.

**What I changed:**

- added `web-bridge.js` and `ExtensionTokenSync`
- synced the Supabase auth token through extension storage
- let extension uploads authenticate as the signed-in web user

**Why this matters:** this creates a smoother product while showing practical understanding of auth boundary design.

### 9. Long-running workflows required async webhook-driven backend design

**Problem:** STT processing and meeting bot lifecycles do not fit a simple request/response model.

**Why it happened:** Sarvam completes later via callback, and Recall bots emit independent status changes over time.

**What I changed:**

- designed the pipeline around persistent meeting status updates
- stored provider job identifiers in the database
- used webhooks to re-enter the pipeline safely when external systems completed work

**Why this matters:** this is production-style backend design, not tutorial CRUD.

### 10. Delivering polished summaries required product thinking, not just backend completion

**Problem:** even after transcription and summarization worked, the output still needed to reach users in formats they would actually use.

**What I changed:**

- added Slack delivery
- added meeting email delivery
- added weekly/monthly digest generation
- tracked delivery flows separately from core meeting processing

**Why this matters:** good engineering is not only about model output. It is about delivering the right output in the right workflow.

### 11. A race condition in the Recall webhook created two transcription jobs per meeting

**Problem:** every completed Recall meeting was generating two separate Sarvam transcription jobs, wasting API quota and producing non-deterministic results.

**Why it happened:** Recall fires two distinct webhook events almost simultaneously when a recording finishes — `audio_mixed.done` (audio file is ready for download) and `bot.done` (bot lifecycle is complete). The handler was listening to both. Both events arrived within milliseconds of each other, both read `sarvam_job_id = null` from the database, and both triggered the full audio download → upload → Sarvam job creation pipeline in parallel before either had a chance to write the new job ID back.

**What I changed:**

- restricted `recall-webhook` to only trigger `processRecallAudio` on `audio_mixed.done` — the authoritative signal that the MP3 is actually downloadable
- `bot.done` is now treated as a status-only update and does not initiate any pipeline work
- `check-recall-status` polling already acts as a fallback for the rare case where `audio_mixed.done` is never received

**Why this matters:** this is a real race condition in a distributed webhook system. The fix required understanding the semantic difference between two events from an external API and recognizing that "database reads are not atomic with writes across concurrent executions."

### 12. A silent recording caused an infinite webhook retry loop that never resolved

**Problem:** a 23-second meeting where participants left immediately got permanently stuck on "Processing" and never completed — even though the transcription pipeline had technically already finished.

**Why it happened:** a chain of failures:

1. Sarvam completed the job successfully but wrote no output file — correct behavior when the audio contains no speech
2. The webhook handler tried to download that file, received a 400 "does not exist" response, and threw an unhandled exception, returning a 500 to the caller
3. The `check-recall-status` polling function was triggering `sarvam-webhook` every 5 seconds as a fallback, but silently ignored the 500 response and kept retrying
4. This created a permanent loop: Sarvam done, webhook crashes, poller retries, webhook crashes again — indefinitely

**What I changed:**

- added a try/catch in `sarvam-webhook` around the Sarvam file download call
- when the download returns 400 "does not exist", the handler now substitutes an empty transcript instead of throwing
- the meeting completes gracefully with a "no clear speech detected" message instead of staying stuck forever

**Why this matters:** this is the kind of edge case that only surfaces in production with real data. Sarvam was behaving correctly — it just had nothing to output. The bug was entirely in the error handling layer, and it created a silent infinite loop with no obvious signal that anything was wrong. Catching it required reading logs across three separate functions and tracing the retry path manually.

### 13. Sarvam's `KeyError: 'timestamps'` on audio over ~7 minutes silently broke the pipeline

**Problem:** meetings longer than ~7 minutes started failing transcription. The Sarvam job would mark itself `Completed` at the top level but with `successful_files_count: 0`, and `job_details[0].exception_name: "KeyError"`, `error_message: "'timestamps'"`. Downstream code threw, returned 500, and `check-recall-status` polling tried to recover it forever — leaving the meeting permanently stuck on "Processing".

**Why it happened:** server-side bug in Sarvam's `saaras:v3` model when chunked long audio is recombined for output. Reproduced across 5 different config combinations (translate vs transcribe modes, `language_code: "unknown"` vs `"en-IN"`, `with_timestamps: true` vs `false`, `with_diarization: true` vs `false`). With timestamps off Sarvam returned `successful_files_count: 1` but with completely empty content, which is arguably worse than the loud KeyError. Reported to Sarvam Discord with all 5 job IDs; awaiting their fix.

**What I changed:**

- broadened the `downloadSarvamResults` catch block in `sarvam-webhook` to fall back to Whisper on **any** download error (not just the original 400 "does not exist" path). Empty-transcript Sarvam responses already triggered the fallback.
- the meeting auto-recovers via Whisper instead of staying stuck.

**Why this matters:** third-party reliability cannot be assumed. The defensive design (loud-error → silent retry → infinite recovery loop) was actually a worse failure mode than just letting the 500 propagate and falling through to Whisper. Catching this required cross-referencing Sarvam's job-status API, our own logs, and a reproducer that submitted the same audio with five different configs to isolate the bug.

**Update (June 2026):** the Whisper fallback turned out to be a dead end for exactly the meetings that needed it (>25 min audio exceeds Whisper's 25 MB upload limit), so every long meeting still died. The bug was later definitively root-caused and *fixed at the source* with chunked transcription — see Challenge #19.

### 14. The `bot.done` / `audio_mixed.done` race silently marked good meetings as failed

**Problem:** some real meetings got marked `failed` even though Sarvam transcription was actively succeeding for them. Logs showed `[recall-webhook] Bot ... done with no audio processed — marking as failed` followed seconds later by a successful `recall-pipeline` Sarvam handoff for the same meeting.

**Why it happened:** Recall fires `bot.done` and `audio_mixed.done` within ~16 ms of each other. The two webhook events run as parallel edge function invocations. The `bot.done` handler read the meeting row before the `audio_mixed.done` handler had finished writing `sarvam_job_id`, saw it was null, and incorrectly concluded "this bot finished without producing audio" — so it overwrote `status = failed`. The `audio_mixed.done` handler then quietly completed Sarvam submission, but `status` had already been clobbered.

**What I changed:**

- `bot.done` now queries Recall's `/audio_mixed/` endpoint directly to check the actual audio status before marking failed. Only `failed` or `missing` produce a status update; `done`, `processing`, and `unknown` (transient API blip) defer to the audio_mixed handler.
- added a `getAudioMixedStatus()` helper in `_shared/recall-pipeline.ts` for this check.

**Why this matters:** webhook race conditions are essentially unreproducible in a single-invocation `supabase functions serve` environment. They only appear in production at concurrent invocation boundaries, which is also why they took two days to surface. The fix was small; the diagnostic work was the engineering.

### 15. The `transcribing` status sentinel deadlocked Sarvam recovery

**Problem:** when `check-recall-status` detected that Sarvam was done but our webhook hadn't been received, it tried to re-fire `sarvam-webhook` directly. The webhook then refused to do anything because the meeting was already in `transcribing` status — the meeting got permanently stuck.

**Why it happened:** two handlers, written on different days, were communicating through the same string column with conflicting meanings. `check-recall-status` set `status = 'transcribing'` as an optimistic lock to prevent two concurrent polls both firing the webhook. `sarvam-webhook` had `'transcribing'` in its idempotency-skip list (added earlier to protect the Whisper-fallback path from being re-entered while Whisper was running). The lock and the skip-guard collided.

**What I changed:**

- added a dedicated `meetings.sarvam_webhook_triggered_at TIMESTAMPTZ` column and migrated to it as the lock primitive.
- `check-recall-status` now claims the trigger via `.is("sarvam_webhook_triggered_at", null)` instead of touching `status`. The lock is released on webhook failure so future polls can retry.
- `sarvam-webhook`'s `'transcribing'` skip-guard is preserved unchanged (still protects the Whisper fallback path).

**Why this matters:** this is a textbook anti-pattern: handler-to-handler communication through a shared string column with no enforced semantics. Two well-intentioned authors, two valid uses of the same value, one bug. Replacing the implicit shared meaning with an explicit dedicated column is the structural fix.

### 16. The `meetings.error_message` column didn't exist, so every failure path silently no-op'd

**Problem:** when a bot was kicked from a waiting room, when audio_mixed failed, when any other failure path triggered — meetings stayed stuck in `processing` or whatever their previous state was. The frontend spun forever showing "Processing".

**Why it happened:** four edge functions wrote `error_message` to the `meetings` table on every failure. The column had been referenced in TypeScript types and frontend UI but **never added to the database schema**. PostgREST silently rejects the entire UPDATE when any column is invalid — so `status: "failed"` never persisted either, because it was being submitted in the same statement as the bad column. The Supabase JS client doesn't throw on PostgREST errors unless you check `.error`, which none of the call sites did.

**What I changed:**

- added migration `20260424170000_meetings_error_message.sql` to create the column.
- the failure paths now succeed; meetings transition to `failed` correctly with a user-readable error message.
- the pipeline test harness now covers two scenarios that exercise these failure paths (`audio_mixed_failed_marks_meeting_failed`, `bot_kicked_waiting_room`) and would have caught this bug in seconds.

**Why this matters:** the pipeline harness actually found this bug — it had been silently broken for weeks before. Without an automated test that asserts status actually changes after a failure-path UPDATE, this bug class is genuinely invisible.

### 17. Speaker mapping created phantom `SPEAKER_01` entries for solo meetings

**Problem:** in single-participant meetings, transcripts were split between the real participant name and `SPEAKER_01`. The frontend rendered two speakers when there was only one.

**Why it happened:** Sarvam's diarization in translate mode often labels everyone as `speaker_id: 0`, so we mapped speakers using Recall's per-utterance timeline as the source of truth. But Recall's speech detection has a confidence threshold — short utterances ("hmm", "this", a cough) get transcribed by Sarvam but fall outside any Recall `speech_on`/`speech_off` window. Those segments had no Recall name to map to, so they fell back to the synthetic `SPEAKER_XX` label.

**What I changed:**

- added a single-participant fast path: when `recall_participants.length === 1`, every Sarvam segment is attributed to that one participant regardless of timeline overlap.
- for multi-participant meetings, added a nearest-neighbor fallback (closest Recall timeline entry by midpoint distance) so we never produce phantom acoustic labels when any Recall name is available.

**Why this matters:** the assumption that "no overlap means we don't know who spoke" was wrong when context obviously identifies the speaker. A small product-aware adjustment to the mapping logic eliminates an entire class of incorrect speaker attribution.

### 18. Speaker diarization returned generic labels instead of real participant names

**Problem:** meeting transcripts showed "SPEAKER_00" and "SPEAKER_01" instead of actual participant names like "Amaan" or "Priya", making transcripts hard to follow.

**Why it happened:** the pipeline was designed so Recall only provided audio to Sarvam, and Sarvam's diarization only returns acoustic speaker IDs (0, 1, 2). There was no mechanism to map those IDs back to real names, even though Recall had access to participant information from the meeting platform.

**What I changed:**

- enabled Recall's real-time transcription (`recallai_streaming` in `recording_config.transcript.provider`) so the bot produces a transcript with real participant names from the meeting platform
- added `getRecallTranscript()` in `recall-pipeline.ts` that fetches the transcript via `media_shortcuts.transcript.data.download_url` (the legacy `/bot/{id}/transcript/` endpoint was deprecated by Recall)
- built a speaker timeline (name + time range pairs) from the Recall transcript and stored it in `processing_config` alongside the Sarvam job
- in `sarvam-webhook`, implemented **per-segment** time-overlap matching: each Sarvam segment is individually matched to the Recall utterance with the most temporal overlap, assigning the real speaker name directly. This approach works even when Sarvam's translate mode assigns all segments to a single speaker ID (a known limitation of translate mode diarization)
- the mapping is deterministic (no GPT guessing) and falls back gracefully to acoustic labels if Recall transcript is unavailable (e.g., chrome extension recordings)

**Why this matters:** this is a cross-system data correlation problem. Two independent transcription sources (Recall for names, Sarvam for translated English text) had to be aligned using timestamp overlap as the join key. The per-segment approach was necessary because Sarvam's translate mode often collapses all segments to one speaker ID, making per-ID mapping useless. The solution requires no changes to the frontend since it already renders `seg.speaker` directly.

### 19. Sarvam silently returned empty transcripts for every long meeting — root-caused by controlled experiment, fixed with chunked transcription

**Problem:** every meeting longer than ~25 minutes that reached Sarvam failed identically: Sarvam reported `job_state: Completed`, `state: Success`, no exception — but the output JSON was completely empty (`transcript: ""`, `language_code: null`, `diarized_transcript: null`). The auto-fallback to Whisper then rejected the same files for exceeding Whisper's hard 25 MB upload limit. Net effect: **no working transcription path existed for any long meeting.** All 7 production meetings that ever reached Sarvam died this way.

**Why it happened (proved by controlled experiments, not guesswork):**

- Replaying an archived failing 47-min/43 MB file against live Sarvam reproduced the empty output — with `language_probability: null`, showing Sarvam's internal language-detection stage dies silently on long audio and cascades nulls into every output field while still reporting success.
- Config was ruled out: translate+auto-detect, translate+`en-IN`, translate+`hi-IN`, and transcribe mode **all returned empty** on the full file. The bug cannot be dodged with `job_parameters`.
- File size was ruled out with a controlled pair: the same recording re-encoded to **8 MB at 47 min failed**, while a **6.8 MB at 6 min clip succeeded** — near-identical bytes, opposite outcomes. The trigger is **duration**, not size, memory, or config.
- 5–6 minute clips of the same audio transcribed perfectly (`hi-IN` at 1.0 confidence), bounding the breakage between 6 and 47 minutes — despite Sarvam's docs claiming "up to 1 hour".

**What I changed:**

- Built [`api/split-audio.ts`](api/split-audio.ts) — a Vercel function (Supabase edge functions have no ffmpeg and ~256 MB memory) that downloads the audio from a signed Storage URL, probes real duration with ffmpeg, splits >6-min audio into 300 s **re-encoded** chunks (stream-copied segments are rejected by Sarvam with "Audio contains no samples"), and submits all chunks as **one multi-file Sarvam batch job** with the meeting's webhook callback. Validated first that multi-file jobs name outputs `0.json..N.json` in input order before building on that assumption.
- `recall-pipeline.ts` routes audio through the splitter (shared bearer secret over HTTPS) and falls back to the legacy direct single-file path if the splitter is unreachable — the pipeline can degrade but never get worse than before.
- `sarvam-webhook` stitches chunked results: downloads every output in order, offsets each chunk's diarized timestamps by `chunk_index × chunk_seconds`, time-sorts, and merges into one transcript so all downstream logic (speaker mapping, insights, delivery) runs unchanged.
- End-to-end proof: the original failed 47-min production meeting was re-run through the deployed pipeline and completed — 21,161 chars across 10/10 chunks, 331 segments spanning the full 2,823 s, with real GPT insights (action items with owners, decisions, risks).

**Why this matters:** the headline skill here is the diagnostic method — isolating one variable at a time (config, size, duration) with controlled experiments against a black-box third-party API, then designing around the confirmed constraint instead of the assumed one. The fix also respects platform limits honestly: instead of fighting Supabase's memory ceiling, the ffmpeg workload moved to compute that fits it (Vercel, 2 GB/300 s), connected by an authenticated boundary with a fallback.

### 20. Built an output-quality eval suite — which caught a real bug on its first production run

**Problem:** the pipeline harness (below) verifies *plumbing* — statuses transition, webhooks are idempotent, races don't corrupt state — but nothing verified *output quality*. A meeting could "complete" with a garbage transcript, a hallucinated action item, or an unfaithful summary, and every test would stay green. (This is exactly the gap between integration testing and eval-driven AI development.)

**What I built** ([`scripts/evals/`](scripts/evals/)):

- **8 evals** over (transcript, insights) pairs — 4 deterministic: schema validity, English output (translate mode actually produced English), stitch integrity (segments time-ordered, within meeting duration), speaker attribution (no phantom `SPEAKER_XX` when real names exist); and 4 LLM-judge (gpt-4o-mini, temperature 0, strict JSON): action-item recall vs a gold reference (gate ≥ 0.7), action-item precision/hallucination (ANY invented item fails, gate = 1.0), summary faithfulness (every claim grounded in the transcript, gate ≥ 0.9), decision accuracy (gate ≥ 0.7).
- **Judge calibration built into the dataset:** one case contains a deliberately planted fake action item and a fabricated summary claim, marked `"expect": {"action_item_precision": "fail"}`. The suite passes only when the judge *catches* the plants — if that case ever "passes", the judge has gone lenient and the suite fails loudly.
- **A production→eval feedback loop:** `run_evals.py --snapshot <meeting-id>` pulls any real meeting's transcript+insights into the dataset as a permanent regression case; `--meeting-id` grades a live meeting on demand.

**What happened on its first live run:** grading the recovered 47-minute meeting, `stitch_integrity` failed — 4 of 331 segments were out of time order. Root cause: Sarvam's diarization emits slightly out-of-order entries when speakers overlap. The fix (time-sorting merged segments in `sarvam-webhook`) shipped the same hour, the stored transcript was repaired, and the meeting now grades 8/8 — with the judge confirming **zero hallucinated action items and a fully faithful summary** against the real transcript.

**Why this matters:** evals and monitoring answer different questions — monitoring catches failures *in* production after users see them; evals catch quality regressions *before* deploy. The suite proved the distinction immediately by finding a defect that no status check, no harness scenario, and no human eyeball had noticed. Every future change to chunking, prompts, or providers now has to pass the same gate.

### 21. The dashboard re-fetched everything on every visit — a missing client cache, not a slow database

**Problem:** the dashboard showed a long "Loading meetings…" spinner *every single time* it was opened, even when nothing had changed. The instinct was that the database (Supabase/Postgres) was too slow and needed replacing with something "lighter."

**Why it happened:** the data pages used raw `useState`/`useEffect` and re-fetched from scratch on every mount — with no cache, nothing was reused between visits. The dashboard also ran its reads as a **waterfall** (profile → meetings → insights, each awaiting the last) when the profile and meetings queries are independent, and `ProtectedRoute` gated the whole render on an auth `getSession()` round-trip first. TanStack Query was already installed and wired into `App.tsx` but went unused on these pages. The database itself was never the bottleneck (see #22 — every read was already served from RAM).

**What I changed:**

- Set global TanStack Query defaults in [`App.tsx`](src/App.tsx) (`staleTime` 60s, `refetchOnWindowFocus: false`) so revisiting a page renders **instantly from cache** and revalidates in the background instead of re-fetching cold.
- Converted [`Dashboard.tsx`](src/pages/Dashboard.tsx) to cached queries and **parallelized** the independent profile + meetings reads (was sequential). Realtime `postgres_changes` updates now patch the query cache in place via `setQueryData`, so the live meeting list still updates without a refetch.
- Consolidated [`MeetingDetail.tsx`](src/pages/MeetingDetail.tsx)'s nine separate `select('*')` reads into one cached composite query, so navigating dashboard → meeting → back is instant; realtime status changes invalidate that query (faithful to the old refetch-on-completion behavior).
- **Deliberately left `Settings` on local state.** It's a form page with editable fields, write-on-load side effects, and lists mutated by user actions — a poor fit for read-caching, with near-zero payoff. Forcing it into the cache would have added regression risk for no benefit.

**Why this matters:** the fix was to stop doing repeated work, not to swap the engine — a different database would have rebuilt everything and left the same waterfall and the same spinner. Knowing *which* layer owns a latency problem (client cache vs. query shape vs. engine) is the actual skill, and so is the judgment to **not** cache the one page where caching would hurt.

### 22. Recurring "Disk IO Budget" alerts were caused by cron write-churn — not the slow reads everyone assumes

**Problem:** Supabase kept emailing "your project is depleting its Disk IO Budget." The obvious hypothesis — the same one behind the slow dashboard (#21) — was "too many uncached reads are hammering the disk."

**Why it happened (measurement disproved the hypothesis):** `supabase inspect db` showed a **table/index cache hit rate of 1.00** with only ~3 MB of actual table data (175 MB database total, but 96 MB of that was WAL) — meaning every read was already served from RAM and **nothing meaningful was being read from disk.** `pg_stat_statements` then named the real cost: a single query — `net.http_post(...)` fired by `pg_cron` — was **94.4% of all database execution time across 110,868 calls.** The database was being used as a per-minute HTTP scheduler: each tick wrote a `pg_net` request + response row and a `cron.job_run_details` row, generating constant WAL/`fsync` **write** IO 24/7. (The 471k sequential scans on the 4-row `user_oauth_tokens` table were the same per-minute crons, not a missing index — Postgres deliberately seq-scans tiny tables.)

**What I changed** (migrations [`20260613120000`](supabase/migrations/20260613120000_reduce_cron_frequency.sql), [`20260613120100`](supabase/migrations/20260613120100_prune_cron_pgnet_bookkeeping.sql)):

- `auto-join-meetings` cron **every 1 min → every 5 min** — ~80% fewer of the calls that dominated DB time. To keep the feature correct at the wider cadence, the edge function's look-ahead window was widened **2 → 7 min** so no meeting is missed between polls; its existing per-calendar-event dedup guard prevents duplicate bots.
- `monitor-stuck-meetings` **every 5 min → every 15 min** (its stuck threshold is already >15 min, so finer polling bought nothing).
- A daily `prune-job-logs` cron that trims `cron.job_run_details` and `net._http_response`, which `pg_cron`/`pg_net` accumulate indefinitely.
- Documented the escalation if alerts persist: move scheduling **off** the database to a free external scheduler (cron-job.org / GitHub Actions) calling the edge functions directly — explicitly *not* Vercel Cron (its free tier caps cron jobs at once-per-day) and *not* a paid compute upgrade.

**Why this matters:** measure before you fix. The intuitive "add caching" remedy would have done nothing here, because the bottleneck was writes the database inflicted on itself as a scheduler — not reads. The root cause was confirmed with `supabase inspect db` and `pg_stat_statements`, not assumed; the same "it's probably caching" instinct that was *right* for the dashboard (#21) was *wrong* for the disk IO, and only data told them apart.

### Dual Ingest Architecture

EchoBrief supports both:

- **browser-native capture** through the extension
- **bot-driven capture** through Recall

That is a meaningful architecture decision because it decouples the downstream intelligence layer from the recording source.

### Multi-Provider AI Pipeline

The system is designed with graceful degradation:

- Sarvam is the primary transcription path
- Whisper is the fallback path
- GPT-4o-mini only runs after transcript validation

This reduces brittleness and makes the system more realistic than single-provider demos.

### Structured Insight Generation

Summaries are not stored as one blob of generated text. The system aims for structured outputs that can power:

- meeting detail tabs
- action item tracking
- digest reports
- Slack/email formatting

That makes the AI output application-ready rather than merely readable.

### Backend Modularity

The Edge Function layer is decomposed by responsibility:

- ingest
- processing
- webhooks
- sync
- delivery
- OAuth

This is a cleaner design than a monolithic API file and makes the project easier to extend.

### Schema Evolution

The migration history shows the product growing over time:

- baseline meeting and transcript support
- Sarvam migration
- storage improvements
- Recall integration
- multi-calendar support
- onboarding and delivery tracking
- digest reporting
- atomic webhook trigger lock + missing `error_message` column (April 2026 reliability sprint)
- `monitor_events` audit table + pg_cron scheduled stuck-meeting monitor

This is useful signal to recruiters because it shows iterative engineering, not one-shot scaffolding.

### Operational Reliability

After hitting a streak of timing-related production bugs in the webhook pipeline (covered in Engineering Challenges #11 and #14–17), the project added two pieces of operational infrastructure that turn flakiness from "users notice" into "automatically detected and recovered":

**Pipeline test harness** ([`scripts/pipeline-test/harness.py`](scripts/pipeline-test/harness.py))

A self-contained Python script that exercises the real deployed edge functions against the real database in ~90 seconds. It creates `[harness]`-prefixed test meetings, fires real signed webhooks at `recall-webhook`, `sarvam-webhook`, and `check-recall-status`, polls for expected end-state, and cleans up — even on failure. It runs **11 scenarios** covering the happy path, chunked stitching, speaker mapping, the webhook races, failure persistence, idempotency/concurrency, splitter liveness, and the monitor's own recovery + alerting (plus a 12th live-provider scenario behind `--live`).

Run before every deploy. The harness has already caught two real prod bugs that would have hit users (the `error_message` column being missing, the `transcribing` deadlock). The full per-scenario breakdown lives in [Testing: Harness and Evals](#testing-harness-and-evals) — this section is just the operational summary.

**Stuck-meeting monitor** (`supabase/functions/monitor-stuck-meetings/`)

Scheduled via `pg_cron` to run every 15 minutes. For every meeting in a non-terminal status older than 15 minutes, it:

1. Classifies the failure into a signature (e.g. `stuck:processing:sarvam_keyerror`, `stuck:transcribing:whisper_died`)
2. Looks up the canonical recovery action in `KNOWN_PATTERNS` (mirrors [`errors.md`](errors.md))
3. Attempts the recovery (`force_whisper`, `trigger_sarvam_webhook`, `check_recall_status`, `mark_failed`)
4. Logs the detection to `monitor_events` with hourly dedup
5. Emails `amaan@oltaflock.ai` via Resend if recovery fails OR the signature is unrecognized (subject prefix `[ECHOBRIEF NEW ERROR]`)

The pairing of a curated runbook (`errors.md`) with a programmatic mirror (`known-patterns.ts`) means every error pattern has both a human-readable diagnosis and an automated recovery path. New error patterns surface as `[ECHOBRIEF NEW ERROR]` emails so the runbook stays in sync with reality.

---

## Testing: Harness and Evals

EchoBrief tests its AI pipeline as a four-tier pyramid — each tier answers a different question at a different cost:

| Tier | Tool | Question it answers | Cost / when |
|---|---|---|---|
| **0. Unit harness** (logic) | `deno test -A supabase/functions/tests/` | *Is the pure logic correct?* Recall API parsing & fallback chains, audio_mixed status mapping, chunk-stitch math (offsets/sort), Sarvam output discovery & numeric ordering. 26 tests, mocked fetch, zero prod contact. | Free, <1 s. Run on every change. |
| **1. Integration harness** (plumbing) | [`scripts/pipeline-test/harness.py`](scripts/pipeline-test/harness.py) | *Does the deployed pipeline run correctly?* Statuses transition, webhooks idempotent, races don't corrupt, speaker mapping resolves real names, the splitter endpoint is alive & configured, the monitor recovers. | ~90 s against real prod. Before every deploy. 11/11 must pass. |
| **2. Live-provider E2E** | `harness.py --live` | *Do the REAL providers still work end-to-end?* Real fixture audio → deployed Vercel splitter → real chunked Sarvam job → real callback → stitched transcript + insights. Doubles as a Sarvam contract check (catches upstream regressions like the silent long-audio bug). | ~3 min, costs pennies. Before risky deploys; periodically. |
| **3. Full bot drill** (manual) | runbook below | *Does the entire product work, bot included?* Stages A–B (bot creation, joining, recording) need a real meeting. | ~5 min of human time. After bot-flow changes. |
| **Output-quality evals** | [`scripts/evals/run_evals.py`](scripts/evals/run_evals.py) | *Is the output any good?* No hallucinated action items, faithful summary, English output, ordered segments, real speaker names. | Before deploying anything touching transcription/prompts. |

The distinction matters: a meeting can flow through every status correctly and still produce a hallucinated summary — the harness stays green, only an eval catches it. Conversely, an idempotency race never shows up in output quality — only the harness catches it. Monitoring (the pg_cron stuck-meeting monitor above) is the final leg: it catches what slips past everything, *in* production, after the fact.

### Tier 0: the unit harness

Pure-logic tests with mocked `fetch` — no deployment, no database, no providers. They cover the previously-untested "stage D" of the pipeline (Recall data extraction) and the chunk-stitch math, extracted into [`_shared/stitch.ts`](supabase/functions/_shared/stitch.ts) precisely so it could be tested:

- `getRecallTranscript`: media_shortcuts URL → recording_id query fallback → graceful null on failure/empty
- `getAudioMixedStatus`: done/processing/failed pass through; missing results, HTTP errors, weird codes, thrown fetches all map to safe defer values (`missing`/`unknown`) — the race-safety contract
- `stitchChunkResults`: per-chunk timestamp offsets, time-sorting of overlapping-speech entries, empty-chunk counting, legacy key handling
- `downloadAllSarvamResults`: output-name discovery and **numeric** sort (`2.json` before `10.json` — chunk order depends on it), error propagation

```bash
npm run test:unit        # deno test -A supabase/functions/tests/
```

### Tier 1: the integration harness — 11 scenarios against real infrastructure

Nothing is mocked. Each scenario inserts a synthetic `[harness]`-prefixed meeting into the production database, fires real signed webhook payloads (captured from prod logs, templated in [`fixtures.py`](scripts/pipeline-test/fixtures.py)) at the real deployed edge functions, polls for the expected end state, and always cleans up its rows — pass or fail.

```bash
python3 scripts/pipeline-test/harness.py                       # 11 default scenarios (~90 s)
python3 scripts/pipeline-test/harness.py --live                # + live_sarvam_e2e (real Sarvam, ~3 min)
python3 scripts/pipeline-test/harness.py --only chunked_happy_path   # one scenario
python3 scripts/pipeline-test/harness.py --cleanup-only        # delete stray [harness] rows
```

All 11 default scenarios, in plain words:

| Scenario | What it checks |
|---|---|
| `happy_path_sarvam` | A normal finished transcription turns into a completed meeting with the transcript and insights actually saved. |
| `chunked_happy_path` | A multi-chunk job is stitched back in the right order, with each chunk's timestamps shifted into real meeting time. |
| `speaker_mapping_happy_path` | Diarized segments get real names (Priya/Rahul) by matching speaking times, and a segment outside every window falls back to the nearest speaker — never a generic `SPEAKER_01`. |
| `split_audio_endpoint_probes` | The deployed Vercel splitter is alive and configured: it answers `401` with no auth and `400` on an empty body (a `500` here means its env vars are missing). |
| `bot_done_defers_on_unknown_audio` | When Recall fires its two "done" events at the same moment, a good meeting is never wrongly marked failed. |
| `audio_mixed_failed_marks_meeting_failed` | A real audio failure actually saves `failed` to the database (the bug where a missing column silently swallowed the update). |
| `bot_kicked_waiting_room` | A bot kicked from the waiting room ends as `failed`, not stuck forever. |
| `duplicate_sarvam_webhook_idempotency` | A replayed Sarvam callback is skipped, not re-processed into a duplicate transcript. |
| `concurrent_sarvam_webhooks` | Two callbacks arriving at once don't both process and double-insert. |
| `monitor_recovers_known_pattern` | The monitor recognizes a known stuck-signature and runs its canonical recovery. |
| `monitor_logs_unknown_pattern` | The monitor flags a never-seen signature and emails an alert — a real Resend send, under the `[ECHOBRIEF HARNESS TEST]` subject. |

(Behind `--live`, a 12th scenario `live_sarvam_e2e` runs — described in Tier 2 above.)

### Tier 2: the live-provider E2E (`--live`)

`live_sarvam_e2e` runs the real E→F→G chain: a 6.5-minute Hindi fixture stored at `recordings/harness-fixtures/live-e2e.mp3` goes through the deployed splitter, becomes a real 2-chunk Sarvam batch job with the real webhook callback, and must come back `completed` with >100 chars, `stt_provider=sarvam`, insights present, and an accurate `duration_seconds`. If Sarvam ships another silent regression, this is the test that screams.

### Tier 3: the full bot drill (manual runbook)

The only stages no automation covers are bot creation and joining (A–B) — they need a real meeting. After changing bot-flow code or before re-enabling auto-join:

1. Open a Google Meet yourself (instant meeting is fine).
2. In the EchoBrief dashboard, paste the Meet URL and start a bot recording.
3. Admit the bot when it knocks; play 2–3 minutes of any video with clear speech.
4. End the meeting. Within ~5 minutes the meeting should reach **Completed** with a transcript, named speakers (you), and insights.
5. If it sticks, the monitor will classify and email within 15–20 min — check `monitor_events` for the signature.

**Debugging a failing scenario:** every failure message states the expected vs actual end state (e.g. `meeting never reached completed; final status='processing'`). The triage order that works: (1) re-run just that scenario with `--only`; (2) check the edge function logs in the Supabase dashboard for the function the scenario fires at; (3) check `monitor_events` / meeting row state via the REST API; (4) if the failure is a *new* pipeline behavior (not a regression), update the scenario's expectation **and** document the behavior change in `errors.md`. The two monitor scenarios send a real Resend email by design (subject `[ECHOBRIEF HARNESS TEST]`) — that email is the test passing, not an incident.

One design detail worth noting: the chunked scenario injects ordered chunk results through an explicit `__harness_inline` test seam in `sarvam-webhook` rather than creating a real Sarvam job (slow, costly, non-deterministic). Production callbacks never set the flag, so prod always downloads outputs by name — the seam tests the stitch logic without weakening the production path.

### The evals: 8 graders, a calibrated judge, and a feedback loop

Run modes:

```bash
python3 scripts/evals/run_evals.py                    # static dataset gate (exit code gates deploys)
python3 scripts/evals/run_evals.py --skip-llm         # deterministic evals only (free, no OpenAI)
python3 scripts/evals/run_evals.py --meeting-id <id>  # grade a live production meeting
python3 scripts/evals/run_evals.py --snapshot <id>    # pull a prod meeting into the dataset as a regression case
```

**Deterministic evals** (pure python, free):

1. `schema_validity` — insights have a non-empty summary and list-typed action_items/decisions
2. `english_output` — translate mode actually produced English (ASCII ratio ≥ 0.95)
3. `stitch_integrity` — segments time-ordered, non-negative, non-empty, last timestamp within meeting duration + slack
4. `speaker_attribution` — zero phantom `SPEAKER_XX` labels when real participant names are known

**LLM-judge evals** (gpt-4o-mini, temperature 0, strict JSON responses):

5. `action_item_recall` — gold action items semantically covered by generated ones (gate ≥ 0.7)
6. `action_item_precision` — every generated action item grounded in the transcript; **a single hallucinated item fails the eval** (gate = 1.0)
7. `summary_faithfulness` — the summary is split into claims and each claim checked against the transcript (gate ≥ 0.9)
8. `decision_accuracy` — gold decisions covered (gate ≥ 0.7)

**Judge calibration:** LLM judges drift lenient, so the dataset includes a poisoned case — a transcript whose paired insights contain a deliberately invented action item ("hire two backend contractors", never discussed) and a fabricated summary claim ("agreed to double the marketing budget"). The case declares `"expect": {"action_item_precision": "fail", "summary_faithfulness": "fail"}`, and the suite passes **only when the judge catches both plants**. If the poisoned case ever starts passing, the judge broke — fix the judge, not the case.

**Fixing a failing eval:** first decide which of three things failed — (a) the *pipeline* genuinely regressed → fix the pipeline (this is the eval doing its job); (b) the *judge* mis-graded → tighten the judge prompt and re-verify against the calibration case; (c) the *gold reference* is wrong or stale → fix the dataset case. Never "fix" an eval failure by deleting the case or lowering a gate without understanding which of the three it was.

**The feedback loop (production → eval):** when a prod meeting produces a bad output, `--snapshot <meeting-id>` freezes its transcript+insights into `dataset/` as a permanent case; adding hand-written `gold.action_items`/`gold.decisions` activates the recall/accuracy graders on it. That failure mode can then never silently regress — the same discipline as adding a regression test for every bug, applied to AI output quality.

**Proof it works:** on its very first live run, the suite caught a real production defect — Sarvam's diarization emits out-of-order segments on overlapping speech (4 of 331 segments in the recovered 47-minute meeting), which `stitch_integrity` flagged and no human or status check had noticed (Engineering Challenge #20). The fix shipped the same hour and is now permanently regression-guarded by both a harness scenario and an eval.

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Chrome
- Supabase project
- Supabase CLI for local function work

### Install

```bash
git clone https://github.com/your-username/echobrief.git
cd echobrief
npm install
```

### Frontend Environment

Create `.env` in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_SUPABASE_PROJECT_ID=your-project-id
```

### Edge Function Environment

Create `supabase/.env.local`:

```env
OPENAI_API_KEY=sk-...
SARVAM_API_KEY=...
SARVAM_WEBHOOK_SECRET=...
RESEND_API_KEY=...
SLACK_BOT_TOKEN=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
RECALL_API_KEY=...
SPLIT_AUDIO_URL=https://www.echobrief.in/api/split-audio
SPLIT_AUDIO_SECRET=...
```

### Vercel Function Environment

`api/split-audio.ts` deploys automatically with the frontend (GitHub → Vercel). In the Vercel project dashboard, set for Production:

```env
SARVAM_API_KEY=...          # split-audio submits chunks to Sarvam directly
SPLIT_AUDIO_SECRET=...      # must equal the Supabase secret of the same name
OPENAI_API_KEY=...          # chunk-wise Whisper fallback (transcribe: "whisper" mode)
```

### Run the Web App

```bash
npm run dev
```

### Run Edge Functions Locally

```bash
supabase start
supabase db push
npm run functions:serve
```

### Load the Chrome Extension

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click `Load unpacked`
4. Select the `chrome-extension/` directory
5. Sign in on the web app so auth token sync can initialize

---

## Environment Variables

| Variable | Used For |
|---|---|
| `VITE_SUPABASE_URL` | Frontend Supabase client |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend auth and database access |
| `VITE_SUPABASE_PROJECT_ID` | Project identification in frontend flows |
| `OPENAI_API_KEY` | Whisper transcription fallback and GPT-4o-mini insights |
| `SARVAM_API_KEY` | Primary transcription provider |
| `SARVAM_WEBHOOK_SECRET` | Sarvam callback validation |
| `RESEND_API_KEY` | Email delivery |
| `SLACK_BOT_TOKEN` | Slack delivery |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `RECALL_API_KEY` | Recall bot orchestration |
| `SUPABASE_URL` | Edge Function server-side Supabase access |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side privileged database/storage operations |
| `SPLIT_AUDIO_URL` | Supabase secret: URL of the Vercel split-audio function (unset → legacy direct Sarvam path) |
| `SPLIT_AUDIO_SECRET` | Shared bearer secret between edge functions and split-audio (set in BOTH Supabase secrets and Vercel env) |

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build production frontend |
| `npm run build:dev` | Development-mode build |
| `npm run preview` | Preview built frontend |
| `npm run lint` | Run ESLint |
| `npm run functions:serve` | Serve Supabase Edge Functions locally |
| `npm run extension:zip` | Package Chrome extension into a zip file |
| `python3 scripts/pipeline-test/harness.py` | Run the 9-scenario pipeline harness against deployed functions (pre-deploy gate) |
| `python3 scripts/evals/run_evals.py` | Run the 8-eval output-quality suite on the static dataset (pre-deploy gate) |
| `python3 scripts/evals/run_evals.py --meeting-id <id>` | Grade a live production meeting's transcript + insights |
| `python3 scripts/evals/run_evals.py --snapshot <id>` | Snapshot a prod meeting into the eval dataset as a regression case |

---

## Why This Is Strong SE1 Work

For a Software Engineer 1 candidate, this project shows much more than the ability to build pages or call an AI API.

- It demonstrates **full-stack ownership** across frontend, backend, browser extension, and database layers.
- It shows **debugging maturity** through concrete handling of race conditions, state recovery, lifecycle issues, and provider failures — including root-causing a black-box third-party bug with controlled single-variable experiments (Challenge #19).
- It includes **system integration work** with real OAuth, webhooks, third-party APIs, and async pipelines.
- It practices **eval-driven AI development**: an integration harness for plumbing, an LLM-judged eval suite with calibration for output quality, and a production→eval feedback loop that turns every bad output into a permanent regression case.
- It reflects **product-minded engineering** by connecting technical implementation to user workflows like summaries, digests, calendar-driven automation, and delivery channels.
- It gives reviewers clear evidence of **scaling beyond tutorial projects** into architecture, reliability, and iteration.

If I were reviewing this as an engineering manager or recruiter, the strongest signal would be that the project solves messy real-world problems rather than only polished happy-path demos.

---

## License

This project is for portfolio and demonstration purposes.
