# Production Quality Implementation Plan (from echobrief-production-fixes.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement the feasible-now scope of the 2026-08-30 production-fix doc: boundary/privacy zones, speaker-formatted transcripts, language mix, entity correction, two-pass grounded insights with facts + citations, date resolution, coaching layer, UX fixes, and eval gates.

**Architecture:** All pipeline logic stays in `supabase/functions/_shared/` pure modules called from the two existing call sites (sarvam-webhook, process-meeting) around the unchanged `generateInsights` entry point. Segment-level data (zone, language) rides inside the existing `transcripts.speakers` JSONB — no per-segment table. New meeting-level data gets 4 new JSONB/array columns.

**Tech stack:** Deno edge functions, gpt-4o-mini, React/TanStack Query, Python evals.

## Reality corrections to the source doc (verified against code + prod fixture)

- STT is **Sarvam (translate mode) + Whisper fallback**, NOT ElevenLabs Scribe. ASR engine benchmarking (P0-1 items 1–2) is a vendor decision + golden-set project → **deferred** (compare_recall_vs_sarvam.py already exists as the decision tool).
- Diarization + speaker names already work (fixture has 366 segments with real names). P0-3 is a **rendering/formatting** fix.
- There is no "workspace" concept; owner's email domain (from `meetings.attendees` self/organizer) defines "internal".
- No share links exist yet; the exports that matter are the summary email and the MCP endpoint — both must default to the meeting zone.
- Recall participants carry names only (no join/leave events fetched today), so boundaries are **speech-estimated** from the Recall speaker timeline (`boundary_source: "speech_estimated"`).

## Deferred (needs human decision/labor — listed for honesty)

ASR vendor swap/benchmark; hand-corrected golden set (WER); CRM connectors + contact timeline (P2-3); rep scorecard trends dashboard; n8n/webhook automation hooks + WhatsApp recap; one-click calendar event creation; overdue-nudge digests (parked per memory); custom per-workspace templates (v2).

## Global constraints

- 95% confidence rule; `npm run test:unit` on shared-logic changes; `npm run build`; harness (12/12) + evals gate before deploy; brand check for UI; all email via email-brand.ts.
- `generateInsights(openai, meeting, transcript, speakerSegments)` signature unchanged (two call sites).
- JSON-mode whitelist discipline: every new model output goes through a normalizer (json-mode-volunteers-removed-fields).

---

### Task 1: Migration — new columns
`supabase/migrations/20260831130000_production_quality.sql`
- `meetings.languages jsonb` — e.g. `{"en":0.88,"hi":0.12}`
- `meetings.boundaries jsonb` — `{first_external_join_ts, last_external_leave_ts, source: "speech_estimated"|"none", internal_only: bool}`
- `meeting_insights.facts jsonb`, `meeting_insights.coaching jsonb`
- `profiles.custom_vocabulary text[] not null default '{}'`

### Task 2: `_shared/zones.ts` (pure) + tests
- `ownerDomain(attendees)`, `externalAttendees(attendees, ownerDomain)`
- `matchTimelineSpeakerToAttendee(name, attendee)` — token overlap vs email local-part + displayName
- `computeBoundaries(attendees, timeline)` → `{firstExternalJoin, lastExternalLeave, source, internalOnly}`; pad 45 s before first external speech, 20 s after last, clamped.
- `annotateZones(segments, boundaries)` → segments with `zone: "pre"|"meeting"|"post"`; internal-only ⇒ all `"meeting"`.
- `meetingZone(segments)` filter helper.

### Task 3: `_shared/language.ts` (pure) + tests
- `segmentLanguage(text)` → `"hi"|"en"|"mixed"|"unknown"` via Devanagari/Latin char ratio.
- `languageMix(segments)` → duration-weighted `{en: 0.88, hi: 0.12}` (2-decimal, drops <0.02 noise).
- `formatLanguageMix(mix)` → `"English 88% · Hindi 12%"`.

### Task 4: `_shared/vocab.ts` (pure) + tests — entity correction
- `buildVocabulary(meeting, customVocab)` — attendee display names, email local parts (capitalized), domain-root company names ("oltaflock.ai" → "Oltaflock"), plus profile custom_vocabulary.
- `correctEntities(text, vocab)` → `{text, corrections: [{from, to}]}` — n-gram window, Levenshtein ≤ 2 with len ≥ 5 and distance < len/3; conservative; logs every change. Applied to segment text + transcript content before insights; corrections logged to `processing_config.entity_corrections`.

### Task 5: `_shared/dates.ts` (pure) + tests
- `resolveRelativeDate(raw, meetingStartISO)` → `{date?: "YYYY-MM-DD", range?: {start,end}, label}` in IST; weekdays → next occurrence after meeting day; today/tomorrow; "next week" → range; explicit dates parsed; null if unresolvable. Never invents.
- Applied to action_items (`due_date_resolved`) and follow_ups in normalizeInsights call sites.

### Task 6: Two-pass insights (insights.ts rework, signature stable)
- Pass 1 `extractFacts(openai, meeting, labeledTranscript)` → facts: numbers, entities, pain_points, objections, buying_signals, commitments, explicit_asks (each with quote + ts), meeting_type classification. Normalizer whitelist.
- Pass 2 synth prompt consumes ONLY facts (+ metadata + vocab canonical spellings); rules: key_points must include every number + explicit ask; lead with prospect's stated need if objections contradict framing; source_ts arrays on outputs.
- Pass 3 `validateInsights(openai, facts, insights)` → flags unsupported claims `unverified` (stored on facts.validation).
- `generateInsights` orchestrates all passes; fallback to legacy single-shot on extraction failure. facts returned as `insights.facts`; saveInsights persists facts + coaching columns.

### Task 7: `_shared/coaching.ts` + LLM moment detection
- Deterministic verdicts from ConversationMetrics: talk_ratio (rep = owner-side speakers) vs 45% target, longest monologue vs 60 s, question counts.
- LLM pass (facts + transcript) → flags: pitched_before_discovery_complete, objection_ignored, numbers_mismatch, next_step_secured/strength; per-2-min external-participant sentiment timeline; coaching summary paragraph. Whitelist normalizer, evidence ts required.

### Task 8: Call sites (sarvam-webhook, process-meeting)
Annotate zones + languages → persist (meetings.languages/boundaries, zone on stored segments) → meeting-zone segments feed insights + metrics (zone duration for silence) → save facts/coaching. Full segments still stored.

### Task 9: MCP surface
- `get_transcript` text format = `[mm:ss] Speaker: …` paragraphs; default meeting zone only, `include_internal` flag; segments format gains zone.
- New `get_meeting_facts` tool.
- `list_meetings` defaults to excluding cancelled unless `status` passed.
- Update MCP unit + contract tests.

### Task 10: Frontend
- MeetingDetail transcript tab: paragraph-merged `[mm:ss] Speaker:` blocks (3 s merge, break >10 s/speaker change), INTERNAL zone banner + owner toggle, language mix chip, deep links `?t=` to Recording tab from timeline/insights/action items.
- Facts ("Numbers & asks") + Coaching sections; sentiment sparkline replacing scalar (scalar stays in API).
- Dashboard/Recordings list: content-first ordering, cancelled collapsed group.
- ActionItems: resolved due dates.
- Settings: custom vocabulary editor.

### Task 11: Evals
- `--snapshot f09a4803` fixture case + golds from source doc (numbers, commitments, framing).
- New evals: numbers_recall (≥0.95 gate on labeled cases), entity_spelling (deterministic — no known-bad variants), summary framing check via existing faithfulness judge; boundary sanity (deterministic on fixture: insights exclude pre-meeting Hindi).

### Task 12: Deploy + verify
- `npm run test:unit`, `npm run build`, `npm run test:mcp`; deploy edge functions + migration; harness 12/12; evals gate; re-process fixture meeting; docs (CLAUDE.md, docs/pipeline.md, Docs.tsx) updated.

---

## Batch 2 (same day) — the previously deferred items that were feasible

Shipped on `feat/production-quality-2` after the user asked for the flagged items too:

| Doc item | Delivered as |
|---|---|
| P0-2 fallback boundary detection | `_shared/boundary-llm.ts` — LLM window estimate when guests never match the Recall timeline (`source: llm_estimated`) |
| P0-3 speaker_confidence + manual re-label | `speaker_confidence` on mapped segments; `rename-speaker` function + inline rename in the transcript, propagated to insights/metrics/facts/coaching/timeline and kept via `processing_config.speaker_overrides` |
| P0-1 vocabulary seed | Owner profile seeded with the doc's terms; Settings editor already shipped |
| P1-2 automation hooks | `profiles.webhook_url/secret`, `webhook_events`, `_shared/webhooks.ts` — `meeting.insights_ready` / `insights_regenerated`, Standard-Webhooks signed; Settings card with delivery log |
| P1-2 one-click actions | `create-followup-event` (Google Calendar at the resolved date, invites opt-in) and `draft-followup-email` (facts-grounded), both on the meeting page |
| P2-1 rep scorecard | `/coaching` page — weekly talk ratio, hedge density, next-step rate, objection-handled rate over the last 90 days |
| P2-3 CRM v1 | `contacts` + `meeting_contacts` auto-populated from external attendees; `/contacts` page with meeting timeline; `account-brief` rolling brief |
| P2-4 latency indicator | Processing step indicator on the meeting page |
| Regeneration | `regenerate-insights` function + `scripts/regenerate_insights.py` backfill; shared sequence extracted to `_shared/post-transcription.ts` |

Remaining deferred: ASR vendor benchmark/swap, hand-corrected WER golden set, HubSpot/Sheets connectors, WhatsApp recap, overdue digests (parked by decision), custom templates, manual meeting-type override.
