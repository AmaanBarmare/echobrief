# Engineering Notes

> Twenty-four problems this system actually hit, and what was done about each. This
> is the long-form record — the short version lives in [`errors.md`](../errors.md),
> which is the operational runbook.

**Scope note.** Challenges 1-4, 6, and 8 come from the **retired v1 Chrome extension
recording path**. That path no longer ships - recording is bot-only - but it was a
genuine multi-context browser system (`content.js` in meeting pages, an MV3 service
worker, an offscreen document for `MediaRecorder`, a popup, and an auth bridge to the
web app), and the reliability work it forced is why the current backend looks the way
it does. Challenges 5, 7, and 9-24 apply to the system as it runs today.

## Index

1. [Manifest V3 service worker restarts broke long-running recordings](#1-manifest-v3-service-worker-restarts-broke-long-running-recordings)
2. [MediaRecorder could not run in the service worker](#2-mediarecorder-could-not-run-in-the-service-worker)
3. [Stop-recording race conditions caused UI and upload inconsistencies](#3-stop-recording-race-conditions-caused-ui-and-upload-inconsistencies)
4. [UI state diverged across popup, content script, and recorder](#4-ui-state-diverged-across-popup-content-script-and-recorder)
5. [Low-signal audio created transcript hallucinations](#5-low-signal-audio-created-transcript-hallucinations)
6. [Browser-only recording and bot-based recording needed to coexist](#6-browser-only-recording-and-bot-based-recording-needed-to-coexist)
7. [Multi-calendar support changed the original data model](#7-multi-calendar-support-changed-the-original-data-model)
8. [Extension auth had to work without a second login flow](#8-extension-auth-had-to-work-without-a-second-login-flow)
9. [Long-running workflows required async webhook-driven backend design](#9-long-running-workflows-required-async-webhook-driven-backend-design)
10. [Delivering polished summaries required product thinking, not just backend completion](#10-delivering-polished-summaries-required-product-thinking-not-just-backend-completion)
11. [A race condition in the Recall webhook created two transcription jobs per meeting](#11-a-race-condition-in-the-recall-webhook-created-two-transcription-jobs-per-meeting)
12. [A silent recording caused an infinite webhook retry loop that never resolved](#12-a-silent-recording-caused-an-infinite-webhook-retry-loop-that-never-resolved)
13. [Sarvam's `KeyError: 'timestamps'` on audio over ~7 minutes silently broke the pipeline](#13-sarvams-keyerror-timestamps-on-audio-over-7-minutes-silently-broke-the-pipeline)
14. [The `bot.done` / `audio_mixed.done` race silently marked good meetings as failed](#14-the-botdone--audio_mixeddone-race-silently-marked-good-meetings-as-failed)
15. [The `transcribing` status sentinel deadlocked Sarvam recovery](#15-the-transcribing-status-sentinel-deadlocked-sarvam-recovery)
16. [The `meetings.error_message` column didn't exist, so every failure path silently no-op'd](#16-the-meetingserror_message-column-didnt-exist-so-every-failure-path-silently-no-opd)
17. [Speaker mapping created phantom `SPEAKER_01` entries for solo meetings](#17-speaker-mapping-created-phantom-speaker_01-entries-for-solo-meetings)
18. [Speaker diarization returned generic labels instead of real participant names](#18-speaker-diarization-returned-generic-labels-instead-of-real-participant-names)
19. [Sarvam silently returned empty transcripts for every long meeting — root-caused by controlled experiment, fixed with chunked transcription](#19-sarvam-silently-returned-empty-transcripts-for-every-long-meeting--root-caused-by-controlled-experiment-fixed-with-chunked-transcription)
20. [Built an output-quality eval suite — which caught a real bug on its first production run](#20-built-an-output-quality-eval-suite--which-caught-a-real-bug-on-its-first-production-run)
21. [The dashboard re-fetched everything on every visit — a missing client cache, not a slow database](#21-the-dashboard-re-fetched-everything-on-every-visit--a-missing-client-cache-not-a-slow-database)
22. [Recurring "Disk IO Budget" alerts were caused by cron write-churn — not the slow reads everyone assumes](#22-recurring-disk-io-budget-alerts-were-caused-by-cron-write-churn--not-the-slow-reads-everyone-assumes)
23. [Kicked-out bots looked identical to real failures — split into `cancelled` vs `failed`](#23-kicked-out-bots-looked-identical-to-real-failures--split-into-cancelled-vs-failed)
24. [One meeting, three identical summary emails — a slow webhook and a read-then-check guard](#24-one-meeting-three-identical-summary-emails--a-slow-webhook-and-a-read-then-check-guard)
25. [The Disk IO alert came back, and this time the database was innocent — it was swap on the root volume](#25-the-disk-io-alert-came-back-and-this-time-the-database-was-innocent--it-was-swap-on-the-root-volume)

---

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

**How it ended:** the browser path was eventually retired entirely. Because both ingests already fed one downstream pipeline, deleting the extension touched ingest and UI only — `meetings -> transcript -> insights -> delivery` needed no changes. That is the payoff of having unified the pipeline instead of forking it.

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

**Problem:** meeting transcripts showed "SPEAKER_00" and "SPEAKER_01" instead of actual participant names like "Ravi" or "Priya", making transcripts hard to follow.

**Why it happened:** the pipeline was designed so Recall only provided audio to Sarvam, and Sarvam's diarization only returns acoustic speaker IDs (0, 1, 2). There was no mechanism to map those IDs back to real names, even though Recall had access to participant information from the meeting platform.

**What I changed:**

- enabled Recall's real-time transcription (`recallai_streaming` in `recording_config.transcript.provider`) so the bot produces a transcript with real participant names from the meeting platform
- added `getRecallTranscript()` in `recall-pipeline.ts` that fetches the transcript via `media_shortcuts.transcript.data.download_url` (the legacy `/bot/{id}/transcript/` endpoint was deprecated by Recall)
- built a speaker timeline (name + time range pairs) from the Recall transcript and stored it in `processing_config` alongside the Sarvam job
- in `sarvam-webhook`, implemented **per-segment** time-overlap matching: each Sarvam segment is individually matched to the Recall utterance with the most temporal overlap, assigning the real speaker name directly. This approach works even when Sarvam's translate mode assigns all segments to a single speaker ID (a known limitation of translate mode diarization)
- the mapping is deterministic (no GPT guessing) and falls back gracefully to acoustic labels if the Recall transcript is unavailable

**Why this matters:** this is a cross-system data correlation problem. Two independent transcription sources (Recall for names, Sarvam for translated English text) had to be aligned using timestamp overlap as the join key. The per-segment approach was necessary because Sarvam's translate mode often collapses all segments to one speaker ID, making per-ID mapping useless. The solution requires no changes to the frontend since it already renders `seg.speaker` directly.

### 19. Sarvam silently returned empty transcripts for every long meeting — root-caused by controlled experiment, fixed with chunked transcription

**Problem:** every meeting longer than ~25 minutes that reached Sarvam failed identically: Sarvam reported `job_state: Completed`, `state: Success`, no exception — but the output JSON was completely empty (`transcript: ""`, `language_code: null`, `diarized_transcript: null`). The auto-fallback to Whisper then rejected the same files for exceeding Whisper's hard 25 MB upload limit. Net effect: **no working transcription path existed for any long meeting.** All 7 production meetings that ever reached Sarvam died this way.

**Why it happened (proved by controlled experiments, not guesswork):**

- Replaying an archived failing 47-min/43 MB file against live Sarvam reproduced the empty output — with `language_probability: null`, showing Sarvam's internal language-detection stage dies silently on long audio and cascades nulls into every output field while still reporting success.
- Config was ruled out: translate+auto-detect, translate+`en-IN`, translate+`hi-IN`, and transcribe mode **all returned empty** on the full file. The bug cannot be dodged with `job_parameters`.
- File size was ruled out with a controlled pair: the same recording re-encoded to **8 MB at 47 min failed**, while a **6.8 MB at 6 min clip succeeded** — near-identical bytes, opposite outcomes. The trigger is **duration**, not size, memory, or config.
- 5–6 minute clips of the same audio transcribed perfectly (`hi-IN` at 1.0 confidence), bounding the breakage between 6 and 47 minutes — despite Sarvam's docs claiming "up to 1 hour".

**What I changed:**

- Built [`api/split-audio.ts`](../api/split-audio.ts) — a Vercel function (Supabase edge functions have no ffmpeg and ~256 MB memory) that downloads the audio from a signed Storage URL, probes real duration with ffmpeg, splits >6-min audio into 300 s **re-encoded** chunks (stream-copied segments are rejected by Sarvam with "Audio contains no samples"), and submits all chunks as **one multi-file Sarvam batch job** with the meeting's webhook callback. Validated first that multi-file jobs name outputs `0.json..N.json` in input order before building on that assumption.
- `recall-pipeline.ts` routes audio through the splitter (shared bearer secret over HTTPS) and falls back to the legacy direct single-file path if the splitter is unreachable — the pipeline can degrade but never get worse than before.
- `sarvam-webhook` stitches chunked results: downloads every output in order, offsets each chunk's diarized timestamps by `chunk_index × chunk_seconds`, time-sorts, and merges into one transcript so all downstream logic (speaker mapping, insights, delivery) runs unchanged.
- End-to-end proof: the original failed 47-min production meeting was re-run through the deployed pipeline and completed — 21,161 chars across 10/10 chunks, 331 segments spanning the full 2,823 s, with real GPT insights (action items with owners, decisions, risks).

**Why this matters:** the headline skill here is the diagnostic method — isolating one variable at a time (config, size, duration) with controlled experiments against a black-box third-party API, then designing around the confirmed constraint instead of the assumed one. The fix also respects platform limits honestly: instead of fighting Supabase's memory ceiling, the ffmpeg workload moved to compute that fits it (Vercel, 2 GB/300 s), connected by an authenticated boundary with a fallback.

### 20. Built an output-quality eval suite — which caught a real bug on its first production run

**Problem:** the pipeline harness (below) verifies *plumbing* — statuses transition, webhooks are idempotent, races don't corrupt state — but nothing verified *output quality*. A meeting could "complete" with a garbage transcript, a hallucinated action item, or an unfaithful summary, and every test would stay green. (This is exactly the gap between integration testing and eval-driven AI development.)

**What I built** ([`scripts/evals/`](../scripts/evals/)):

- **8 evals** over (transcript, insights) pairs — 4 deterministic: schema validity, English output (translate mode actually produced English), stitch integrity (segments time-ordered, within meeting duration), speaker attribution (no phantom `SPEAKER_XX` when real names exist); and 4 LLM-judge (gpt-4o-mini, temperature 0, strict JSON): action-item recall vs a gold reference (gate ≥ 0.7), action-item precision/hallucination (ANY invented item fails, gate = 1.0), summary faithfulness (every claim grounded in the transcript, gate ≥ 0.9), decision accuracy (gate ≥ 0.7).
- **Judge calibration built into the dataset:** one case contains a deliberately planted fake action item and a fabricated summary claim, marked `"expect": {"action_item_precision": "fail"}`. The suite passes only when the judge *catches* the plants — if that case ever "passes", the judge has gone lenient and the suite fails loudly.
- **A production→eval feedback loop:** `run_evals.py --snapshot <meeting-id>` pulls any real meeting's transcript+insights into the dataset as a permanent regression case; `--meeting-id` grades a live meeting on demand.

**What happened on its first live run:** grading the recovered 47-minute meeting, `stitch_integrity` failed — 4 of 331 segments were out of time order. Root cause: Sarvam's diarization emits slightly out-of-order entries when speakers overlap. The fix (time-sorting merged segments in `sarvam-webhook`) shipped the same hour, the stored transcript was repaired, and the meeting now grades 8/8 — with the judge confirming **zero hallucinated action items and a fully faithful summary** against the real transcript.

**Why this matters:** evals and monitoring answer different questions — monitoring catches failures *in* production after users see them; evals catch quality regressions *before* deploy. The suite proved the distinction immediately by finding a defect that no status check, no harness scenario, and no human eyeball had noticed. Every future change to chunking, prompts, or providers now has to pass the same gate.

### 21. The dashboard re-fetched everything on every visit — a missing client cache, not a slow database

**Problem:** the dashboard showed a long "Loading meetings…" spinner *every single time* it was opened, even when nothing had changed. The instinct was that the database (Supabase/Postgres) was too slow and needed replacing with something "lighter."

**Why it happened:** the data pages used raw `useState`/`useEffect` and re-fetched from scratch on every mount — with no cache, nothing was reused between visits. The dashboard also ran its reads as a **waterfall** (profile → meetings → insights, each awaiting the last) when the profile and meetings queries are independent, and `ProtectedRoute` gated the whole render on an auth `getSession()` round-trip first. TanStack Query was already installed and wired into `App.tsx` but went unused on these pages. The database itself was never the bottleneck (see #22 — every read was already served from RAM).

**What I changed:**

- Set global TanStack Query defaults in [`App.tsx`](../src/App.tsx) (`staleTime` 60s, `refetchOnWindowFocus: false`) so revisiting a page renders **instantly from cache** and revalidates in the background instead of re-fetching cold.
- Converted [`Dashboard.tsx`](../src/pages/Dashboard.tsx) to cached queries and **parallelized** the independent profile + meetings reads (was sequential). Realtime `postgres_changes` updates now patch the query cache in place via `setQueryData`, so the live meeting list still updates without a refetch.
- Consolidated [`MeetingDetail.tsx`](../src/pages/MeetingDetail.tsx)'s nine separate `select('*')` reads into one cached composite query, so navigating dashboard → meeting → back is instant; realtime status changes invalidate that query (faithful to the old refetch-on-completion behavior).
- **Deliberately left `Settings` on local state.** It's a form page with editable fields, write-on-load side effects, and lists mutated by user actions — a poor fit for read-caching, with near-zero payoff. Forcing it into the cache would have added regression risk for no benefit.

**Why this matters:** the fix was to stop doing repeated work, not to swap the engine — a different database would have rebuilt everything and left the same waterfall and the same spinner. Knowing *which* layer owns a latency problem (client cache vs. query shape vs. engine) is the actual skill, and so is the judgment to **not** cache the one page where caching would hurt.

### 22. Recurring "Disk IO Budget" alerts were caused by cron write-churn — not the slow reads everyone assumes

**Problem:** Supabase kept emailing "your project is depleting its Disk IO Budget." The obvious hypothesis — the same one behind the slow dashboard (#21) — was "too many uncached reads are hammering the disk."

**Why it happened (measurement disproved the hypothesis):** `supabase inspect db` showed a **table/index cache hit rate of 1.00** with only ~3 MB of actual table data (175 MB database total, but 96 MB of that was WAL) — meaning every read was already served from RAM and **nothing meaningful was being read from disk.** `pg_stat_statements` then named the real cost: a single query — `net.http_post(...)` fired by `pg_cron` — was **94.4% of all database execution time across 110,868 calls.** The database was being used as a per-minute HTTP scheduler: each tick wrote a `pg_net` request + response row and a `cron.job_run_details` row, generating constant WAL/`fsync` **write** IO 24/7. (The 471k sequential scans on the 4-row `user_oauth_tokens` table were the same per-minute crons, not a missing index — Postgres deliberately seq-scans tiny tables.)

**What I changed** (migrations [`20260613120000`](../supabase/migrations/20260613120000_reduce_cron_frequency.sql), [`20260613120100`](../supabase/migrations/20260613120100_prune_cron_pgnet_bookkeeping.sql)):

- `auto-join-meetings` cron **every 1 min → every 5 min** — ~80% fewer of the calls that dominated DB time. To keep the feature correct at the wider cadence, the edge function's look-ahead window was widened **2 → 7 min** so no meeting is missed between polls; its existing per-calendar-event dedup guard prevents duplicate bots.
- `monitor-stuck-meetings` **every 5 min → every 15 min** (its stuck threshold is already >15 min, so finer polling bought nothing).
- A daily `prune-job-logs` cron that trims `cron.job_run_details` and `net._http_response`, which `pg_cron`/`pg_net` accumulate indefinitely.
- Documented the escalation if alerts persist: move scheduling **off** the database to a free external scheduler (cron-job.org / GitHub Actions) calling the edge functions directly — explicitly *not* Vercel Cron (its free tier caps cron jobs at once-per-day) and *not* a paid compute upgrade.

> **Superseded as the binding constraint (2026-09-07).** The alert returned, and re-measuring showed cron/`pg_net` was no longer the cost — the whole `pgdata` volume was idle. See [#25](#25-the-disk-io-alert-came-back-and-this-time-the-database-was-innocent--it-was-swap-on-the-root-volume). The cadences below are still correct and should not be raised; they are simply no longer what dominates.

**Why this matters:** measure before you fix. The intuitive "add caching" remedy would have done nothing here, because the bottleneck was writes the database inflicted on itself as a scheduler — not reads. The root cause was confirmed with `supabase inspect db` and `pg_stat_statements`, not assumed; the same "it's probably caching" instinct that was *right* for the dashboard (#21) was *wrong* for the disk IO, and only data told them apart.

### 23. Kicked-out bots looked identical to real failures — split into `cancelled` vs `failed`

**Problem:** the dashboard was full of red **Failed** meetings, but many weren't failures at all — they were meetings where the bot was kicked from the waiting room or never admitted, so nothing was ever recorded. Lumping "the host removed the bot" together with "the transcription pipeline broke" made the product look like it was constantly failing and buried the genuine failures worth attention.

**Why it happened:** `recall-webhook` already knew *why* each bot ended — Recall sends a `sub_code` like `timeout_exceeded_waiting_room`, and the webhook even had friendly per-reason messages — but every terminal failure branch wrote the same `status: 'failed'`.

**What I changed:**

- Split the terminal sub-codes in [recall-webhook](../supabase/functions/recall-webhook/index.ts) into `CANCELLED_SUB_CODES` (kicked / not admitted / never recorded → neutral **`cancelled`**) vs `FAILURE_SUB_CODES` (bad/expired link → **`failed`**, since the user must fix it). A `classifySubCode()` helper routes the `fatal`, `call_ended`, and `bot.done`-no-audio branches; genuine pipeline failures (`audio_mixed.failed`, transcription/insight errors) stay `failed`.
- **Deliberately did not touch the recording/completion path.** A bot kicked *after* it has recorded still emits `audio_mixed.done` and completes into a normal summary — the common case, and it must not regress (the `happy_path` + `bot_done_defers` harness scenarios still pass).
- Made `cancelled` terminal in the monitor's `TERMINAL_STATUSES` (so it isn't treated as "stuck") and added it to the frontend status renderers. Per product choice the `Cancelled` badge is the **same red** as `Failed` — only the label differs. No migration needed (`meetings.status` is free-text); the `bot_kicked_waiting_room` harness scenario now asserts `cancelled`.

**Why this matters:** the webhook already had the information to tell "the host removed the bot" from "our pipeline broke" — it was just discarding it at the last step. Surfacing that one distinction turns a wall of scary red "Failed" badges into an honest signal, without changing anything about how recordings are actually processed.

### 24. One meeting, three identical summary emails — a slow webhook and a read-then-check guard

**Problem:** a user finished a 15-minute meeting and received **three identical summary emails** within 11 seconds of each other. The same thing had happened earlier that day to another meeting, and to the harness's own concurrent-webhook scenario — it just hadn't been read as a bug because the summaries themselves were correct.

**Why it happened (from the logs, not from guessing):** Sarvam fired the *same* `Completed` callback three times for one job — 17:14:27, 17:14:35, 17:14:43, about **8 seconds apart**. The reason is on our side: `sarvam-webhook` does all of its work before it answers — download 4 chunk outputs, stitch, map speakers, call GPT-4o-mini, save, email — and that first invocation took **21 seconds** to return 200. Sarvam gave up waiting and retried, twice.

Each retry then walked straight past the idempotency guard, because the guard was a **read-then-check**:

```ts
if (meeting.status === "completed" || …) return skip;   // read at T+0
…21 s of work…
await supabase.from("meetings").update({ status: "completed" });  // written at T+21
```

All three invocations read `status: 'processing'` *before* any of them wrote `completed`. A check against state that a racer hasn't written yet cannot exclude that racer. Each one generated its own insights (3× GPT spend) and each one called `deliverResults` → three emails. The `meeting_insights` insert survived only because it happened to interleave favourably; nothing about it was safe either.

**What I changed** (migration [`20260821180000`](../supabase/migrations/20260821180000_email_delivery_dedup.sql)):

- **The guarantee — `email_deliveries`.** A claim row per `(meeting_id, lower(recipient_email), kind)` behind a UNIQUE index. `send-meeting-email` INSERTs it *before* calling Resend; a losing racer gets `23505` and returns `{ skipped: true, reason: "already_sent" }`. The database arbitrates, so it does not matter how many callers race, how they were triggered, or whether they run in different function instances. The claim is released if the send then fails, so a genuine retry can still deliver, and unexpected DB errors **fail open** — a missing claim table must never silently swallow the product's main output.
- **The waste — an atomic in-flight claim.** `sarvam-webhook` now claims `meetings.sarvam_webhook_claimed_at` with a conditional UPDATE (`IS NULL OR older than 10 min`) on terminal callbacks, so duplicate callbacks bail out in milliseconds instead of re-running the whole pipeline. The staleness window means an invocation that dies mid-way never strands the meeting, and the claim is released explicitly on error.
- **Tests that would have caught it.** `concurrent_sarvam_webhooks` now asserts that exactly one of two simultaneous callbacks processes and the other is skipped; a new `summary_email_deduped_per_recipient` scenario proves the email guard without sending any mail. Six unit tests cover the claim helper, including the fail-open path.

**Why this matters:** the same mistake shows up all over this codebase's history — the duplicate-bot dispatch (#11, fixed with a unique index), and now duplicate emails. Any "check, then act" guard is only as good as the gap between the two steps, and under a retrying webhook that gap is where every duplicate lives. The fix isn't a better check; it's making the database refuse the second write. Note also that the *retries themselves* are a symptom worth remembering: a webhook handler that does 21 seconds of work before answering is telling its caller to try again.

### 25. The Disk IO alert came back, and this time the database was innocent — it was swap on the root volume

**Problem:** Supabase emailed "your project is depleting its Disk IO Budget" again. [#22](#22-recurring-disk-io-budget-alerts-were-caused-by-cron-write-churn--not-the-slow-reads-everyone-assumes) had already answered this question once — cron write-churn — so the obvious move was to cut cron frequency further. That would have been wrong, and the cadences are already tuned as low as the product tolerates.

**Why it happened (every Postgres-side hypothesis was disproved):**

- The whole database is **~14 MB**. `cron.job_run_details` (4.4 MB) and `net._http_response` (2.6 MB) were being pruned correctly — 3,055 and 96 live rows.
- Cron was running at exactly its tuned cadence: 288 `auto-join-meetings` + 96 `monitor-stuck-meetings` runs in 24 h, zero failures.
- Postgres cache hit ratio was **effectively 1.00** (`blks_hit` 2.1e9 vs `blks_read` 3,344).
- A `pg_stat_statements` delta over a 114 s window showed the entire database doing **1.9% of one core and 2 blocks written**. The top consumer was Realtime's WAL decoder, at 1.2 s of exec time.

The database was idle while the budget drained. The reason no Postgres view could see the cost is that **the IO was not on the Postgres volume.** The instance has two block devices, and the project's Prometheus endpoint (`/customer/v1/privileged/metrics`) splits them:

```
device            read        write     IOPS    busy
nvme0n1       10.54MB/s      0.85MB/s      422    8.1%   <- root/OS volume
nvme1n1        0.24MB/s      0.22MB/s        5    0.1%   <- pgdata
```

`pgdata` was **4% of the traffic.** The root volume was doing the rest, continuously, with an idle database — because the instance is **swapping**: 1.06 MB/s in, 0.86 MB/s out, sustained. It is a free-tier **Nano: 431 MB of RAM against 1,392 MB of committed address space, a 3.2x oversubscription**, with 4.5 MB free. Cumulatively the numbers line up exactly: 7.5 TB swapped out against 7.79 TB written to the root volume over 165 days of uptime — the root volume's write traffic *is* swap.

Against Nano's baseline of **5 MB/s and 250 IOPS**, the measured **11.85 MB/s and 427 IOPS** is 2.4x throughput and 1.7x IOPS — sustained, at idle. The budget cannot do anything but deplete.

**Two false starts worth recording, because both looked like findings:**

1. A first `pg_stat_statements` diff reported a runaway — 992 inserts/sec into `net._http_response`, 1,188% of one core. `pg_stat_statements` returns the **same `queryid` more than once** (one row per `userid`/`dbid`/`toplevel`), and keying the snapshot dict on `queryid` alone diffed one row against a *different* row. The real delta was **1 call in 120 s**. The key must be `(userid, dbid, toplevel, queryid)`.
2. Sampling the metrics endpoint every 30 s produced a clean alternating pattern of zero and double-rate samples. The endpoint is scraped about every 60 s, so any window shorter than ~75 s aliases. The rate looked like it was oscillating; it was constant.

**What I changed:** added [`scripts/disk-io-probe.sh`](../scripts/disk-io-probe.sh), which takes a two-point delta off the metrics endpoint and prints per-device throughput and IOPS, swap rate, memory oversubscription, and the tier baselines to compare against. It encodes both traps above — the 75 s minimum window, and the fact that the per-device split is the whole point.

**What I did *not* change:** anything about cron, queries, or indexes. There is no query-side fix for this, and cutting cron further would have cost product behaviour for a rounding error.

**What actually fixed it: restarting the instance.** The first conclusion drawn here was that Nano is structurally too small and the only remaining choice was a billing one — Pro plus a compute add-on. That was wrong, and it was wrong in the direction that costs money.

While preparing to test it, the instance stopped responding altogether: PostgREST returned **HTTP 522 after 90 s** and the metrics endpoint hung, while the Management API still reported `ACTIVE_HEALTHY`. This is the failure mode the alert email actually warns about — budget exhausted, throttled to baseline, then unresponsive. A restart (`POST /v1/projects/<ref>/restart`, ~5 min, no in-flight meetings, 7/7 cron jobs came back active) resolved it:

| minutes after boot | combined | IOPS | swap in/out |
|---|---|---|---|
| ~1 (boot storm) | 61.61 MB/s | 3,487 | 8.85 / 8.05 MB/s |
| ~10 | 17.41 MB/s | 631 | 1.27 / 1.27 MB/s |
| ~22 | 5.15 MB/s | 183 | 0.33 / 0.35 MB/s |
| ~33 | **1.82 MB/s** | **66** | 0.07 / 0.14 MB/s |
| ~46 (settled) | **2.30 MB/s** | **98** | 0.23 / 0.06 MB/s |

From **11.85 MB/s (2.4x baseline) to a settled ~2 MB/s (under 0.5x baseline)** — a 5-6x reduction, with swap effectively stopped and the `pgdata` volume at 0 IOPS. So the cost was **accumulated state across 165 days of uptime**, not a compute tier that is too small for the workload.

The caveat is that committed address space is still **3.0x RAM**, so the headroom that was just reclaimed is thin and this will recur. The cheap remedy is a periodic restart, not a plan upgrade; the tier only becomes the answer if the interval between recurrences gets short enough to matter. Measure the interval before buying anything.

**So the remedy order is: restart first, measure, and only then consider compute.** A restart is free, takes five minutes, and is decisive — which makes recommending a $40/mo upgrade before trying it a straightforwardly bad call.

**Why this matters:** the diagnosis here was right and the *recommendation* built on it was still wrong — "the database is not the cause" does not imply "only money can fix it," and the cheapest intervention went untried because the measurement felt conclusive. Correct root cause, unearned conclusion. Beyond that: #22 was correct when it was written and is now the wrong answer to the same alert — a documented root cause is a snapshot, not a standing explanation, and the second time the same symptom appears is exactly when the old note is most likely to be believed without re-measuring. The deeper trap is that both obvious instruments, `pg_stat_statements` and table sizes, are blind to the layer that was actually burning the budget: they can only report on the volume Postgres owns, and they will confidently report "idle" while the machine underneath thrashes. When every instrument says the system is doing nothing and the bill says otherwise, the instrument is pointed at the wrong thing.
