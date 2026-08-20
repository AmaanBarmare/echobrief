# Chat over meeting history + computed conversation analytics

**Date:** 2026-08-20
**Status:** Approved, not yet implemented

## Why

EchoBrief captures, transcribes and summarises meetings, then delivers a summary. That summary is a one-shot artifact — read once, then gone. Fireflies and Otter retain users through the layer above that: search and question-answering across *all* past meetings, so the product becomes more valuable the longer you use it. EchoBrief has none of that compounding value today.

Separately, `meeting_metrics` is currently produced by asking GPT-4o-mini to estimate numbers it cannot know. On meeting `7261568f` it returned `speaker_participation: [{speaker: "Khush Mutha", percentage: 100, duration_seconds: 300}]` for a 664-second meeting whose speech segments span ~500 seconds. The 300 is invented. Exact per-segment `start`/`end` timings already exist in `transcripts.speakers`, so this is fabrication where measurement is available. `MeetingMetrics.tsx` — the component that would display it — exists but is never imported, so none of it reaches the user anyway.

## Scope

**In:**
1. Chat that answers questions across a user's own meeting history, with citations.
2. Conversation metrics computed from transcript segments rather than estimated by a model.

**Out (deliberate):**
- Team/workspace-scoped chat. EchoBrief is single-user throughout (`auth.uid() = user_id` on every table). Team chat is a data-model project, not a chat feature; the retrieval layer built here is agnostic to whose meetings it receives, so nothing is wasted when teams arrive.
- Conversation persistence. Multi-turn works within a session; history is not stored. That needs a table, a history UI and a delete flow, none of which is required to learn whether the feature is used.
- Semantic/vector retrieval. See "Retrieval" below.

## Part 1 — Chat

### Retrieval: context-stuffing, deliberately

The entire corpus is 21 transcripts / 178,575 chars / ~45K tokens, and chat is scoped per user, so the heaviest single user is ~20K tokens against `gpt-4o-mini`'s 128K context. Everything fits.

Three options were weighed: stuff everything, Postgres full-text pre-filter, and pgvector semantic retrieval. **Stuffing wins here for a reason specific to this codebase**, not because it is generically better.

EchoBrief's characteristic failure is silent breakage in multi-step async pipelines. On 2026-08-20 five of them were chained and failing simultaneously, undetected for six days, because each one degraded into something that looked like success. An embedding pipeline adds exactly one more: a step that must run on every new transcript, stay in sync, and be backfilled — and whose failure presents as "chat doesn't seem to know about that meeting," which is indistinguishable from the model being unhelpful. That is the worst possible failure mode for a feature whose entire value is trust.

Stuffing has no sync to break, no backfill to go stale, and no retrieval miss: the model provably sees every meeting.

It also has a real and nearer ceiling than a first glance suggests. Average transcript is 8,504 chars ≈ 2,126 tokens, so:

| Cap | Meetings per user |
|---|---|
| 60K tokens | ~28 |
| 100K tokens | ~47 |

`MAX_CONTEXT_TOKENS` is therefore set to **100,000**, not 60,000 — `gpt-4o-mini` allows 128K, and the extra headroom nearly doubles the runway for the cost of ~$0.015 per question at full context. Even so, ~47 meetings is months, not years, for an active user. This is explicitly a first version with a scheduled replacement, not an architecture.

**The seam:** all context assembly lives in one function, `buildContext(supabase, question)`. Today it returns every transcript. Swapping in ranked retrieval later changes this function and nothing else.

**The tripwire:** every call logs the assembled context's token count, so the ceiling shows up as a trend before it becomes an outage.

### Security

The function takes the caller's JWT from the `Authorization` header and constructs the Supabase client **with that token**, so RLS scopes the transcript query. This departs from the service-role pattern used elsewhere in `supabase/functions/`, and the departure is the point: chat is the one feature where a scoping mistake exposes another user's private meeting content. That guarantee belongs in Postgres, not in a `user_id` filter a future edit might drop.

`verify_jwt` stays **true** for this function (most others set it false in `config.toml`).

### Contract

```
POST /functions/v1/chat-transcripts
Authorization: Bearer <user JWT>

Request:  { question: string, history?: [{role: "user"|"assistant", content: string}] }
Response: { answer: string,
            citations: [{ meeting_id, title, date }],
            context_meetings: number,
            context_tokens: number,
            truncated: boolean }
```

### Context format

Each transcript enters the prompt under a header identifying it, so the model can cite precisely:

```
### Meeting: <title>  |  <YYYY-MM-DD>  |  id: <uuid>
<transcript content>
```

The system prompt instructs the model to answer only from supplied transcripts, to cite the meetings it drew from, and to say plainly when the answer is not present rather than inferring. Citations are returned as structured data, not parsed out of prose.

### Degradation

If assembled context exceeds `MAX_CONTEXT_TOKENS` (100,000), drop oldest meetings until it fits, set `truncated: true`, and state in the response that older meetings were excluded. Answering from partial history without saying so would reproduce exactly the class of bug this codebase just spent a day removing.

### Frontend

New page `src/pages/Chat.tsx`, routed at `/chat` behind `ProtectedRoute`, with a sidebar entry. Follows existing page conventions: TanStack Query for the mutation, existing shadcn primitives, Tailwind only. Citations render as clickable chips linking to `/meeting/:id`.

## Part 2 — Conversation analytics

### New module: `supabase/functions/_shared/metrics.ts`

One exported pure function:

```ts
export interface SpeakerStat {
  speaker: string;
  seconds: number;
  percentage: number;   // of total speech, not of wall-clock
  turns: number;
  questions: number;
}

export interface ConversationMetrics {
  speaker_participation: SpeakerStat[];
  total_speaking_seconds: number;
  silence_percentage: number;      // of meeting duration
  turn_count: number;
  longest_monologue_seconds: number;
  longest_monologue_speaker: string | null;
  participation_balance: number;   // 0..1, 1 = perfectly even
}

export function computeConversationMetrics(
  segments: SpeakerSegment[],
  durationSeconds: number,
): ConversationMetrics;
```

Definitions, stated explicitly so they cannot be interpreted two ways:

- **seconds** — sum of `(end - start)` over that speaker's segments. Overlapping segments are summed as-is; no overlap subtraction.
- **percentage** — share of *total speech*, so speakers sum to 100 regardless of silence.
- **turns** — count of maximal consecutive runs by that speaker, in time order.
- **questions** — count of `?` characters in that speaker's segment text.
- **silence_percentage** — `100 * (durationSeconds - total_speaking_seconds) / durationSeconds`, clamped to `[0, 100]`. Clamping matters: segments can exceed wall-clock when they overlap, and can fall short of it (meeting `7261568f`: speech ends at 582s of 664s).
- **participation_balance** — `1 - G`, where `G` is the Gini coefficient of the per-speaker `seconds` distribution. `G = 0` (perfectly even) gives balance 1; a single speaker also gives `G = 0` and therefore balance 1, since one participant is evenly balanced by construction.
- `durationSeconds <= 0` or empty segments → all-zero struct, `longest_monologue_speaker: null`. No division by zero.

### Integration

Called in `sarvam-webhook/index.ts` and `process-meeting/index.ts` immediately after `speakerSegments` is built and before `generateInsights`, then merged over the model's `meeting_metrics` so computed values always win.

### GPT prompt changes in `_shared/insights.ts`

- **Remove `speaker_participation`** from the requested JSON. This is the field that invented `duration_seconds: 300`. Exact timings exist; asking a model to estimate them is strictly worse.
- **Remove `engagement_score`.** An unfalsifiable 0–100 number — nobody can say whether 50 was correct — which makes it decoration presented as measurement. Replaced by computed `participation_balance`.
- **Keep `sentiment_score`.** Genuinely a judgment a model can make, and honest about being subjective.

### Frontend

Wire `MeetingMetrics.tsx` into `MeetingDetail.tsx` — it is currently dead code, imported nowhere. Extend `MeetingMetricsData` for the new fields (turns, longest monologue, questions, balance) and drop `engagement_score`.

## Testing

- **`supabase/functions/tests/metrics_test.ts`** — new, alongside the existing 26 Deno tests. `computeConversationMetrics` is pure and deterministic, so it is tested properly rather than smoke-tested. Required cases: single speaker; two alternating speakers; overlapping segments; speech ending before wall-clock (the real 582/664 case); segments exceeding duration; empty segments; `durationSeconds = 0`; monologue detection across consecutive same-speaker runs.
- **Pipeline harness** — must stay 11/11. `happy_path_sarvam` and `speaker_mapping_happy_path` exercise the modified webhook path.
- **Evals** — must stay 8/8. The insights prompt changes, so this gates against regression in summary quality.
- **Chat** — no automated eval in v1. Verified manually against known meeting content, checking that citations point at meetings that actually contain the claim.

## Risks

- **Computed metrics inherit attribution error.** Talk-time is exactly as accurate as speaker mapping, and multi-speaker attribution remains unvalidated (the 2026-08-20 drill had one participant, which triggers the single-participant fast path and bypasses per-segment mapping entirely). These numbers will be *honestly derived* rather than fabricated — a real improvement — but not automatically correct. A 2+ speaker drill is still outstanding.
- **The ceiling is ~47 meetings per user and arrives sooner than it feels like it should.** For an active weekly user that is under a year, and for a daily user a few months. Logging every call's token count makes it visible as a trend, but that is a monitoring dependency, not a structural fix. Expect to build retrieval — `buildContext()` exists so that when the log says it is time, the change is one function.
- **No conversation persistence** means a page refresh loses the thread. Accepted for v1.
