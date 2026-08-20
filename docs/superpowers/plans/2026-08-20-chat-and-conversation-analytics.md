# Chat Over History + Computed Conversation Analytics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add chat that answers questions across a user's own meeting history with citations, and replace GPT-estimated `meeting_metrics` with values computed from transcript segments.

**Architecture:** Chat is a single Deno edge function that reads the caller's transcripts through an RLS-scoped Supabase client, stuffs them all into a `gpt-4o-mini` prompt, and returns a cited answer — no embeddings, no new tables. Analytics is one pure function in `_shared/metrics.ts`, called from both transcription completion paths, whose output is merged over the model's `meeting_metrics` so computed values always win.

**Tech Stack:** Deno edge functions (Supabase), `openai@4.20.1` via esm.sh, React 18 + TypeScript + Vite, TanStack Query, shadcn/ui, Tailwind. Tests: `deno test` (unit), `scripts/pipeline-test/harness.py` (integration), `scripts/evals/run_evals.py` (output quality).

## Global Constraints

- TypeScript strict mode. Tailwind for all styling — no CSS modules.
- Do not modify anything in `src/components/ui/` — those are generated shadcn primitives.
- Edge functions import shared code from `supabase/functions/_shared/`.
- Deno tests import `assertEquals` from `https://deno.land/std@0.224.0/assert/mod.ts`.
- `npm run test:unit` must stay green (currently 26 tests).
- `python3 scripts/pipeline-test/harness.py` must stay 11/11 before any edge-function deploy.
- `python3 scripts/evals/run_evals.py` must stay 8/8 before deploying anything touching insights.
- `MAX_CONTEXT_TOKENS = 100000`. Token estimate is `Math.ceil(chars / 4)` — deliberately crude, used only for the ceiling guard and logging.
- Chat model: `gpt-4o-mini`. Same model already used for insights.
- 95% confidence rule: do not make a change you are not confident is correct.

---

### Task 1: Pure metrics module + unit tests

**Files:**
- Create: `supabase/functions/_shared/metrics.ts`
- Test: `supabase/functions/tests/metrics_test.ts`

**Interfaces:**
- Consumes: `SpeakerSegment` from `supabase/functions/_shared/insights.ts` — `{ speaker: string; text: string; start?: number; end?: number; speaker_id?: string }`
- Produces: `computeConversationMetrics(segments: SpeakerSegment[], durationSeconds: number): ConversationMetrics`, plus exported interfaces `SpeakerStat` and `ConversationMetrics`.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/tests/metrics_test.ts`:

```ts
/**
 * Unit harness: conversation metrics (pure logic, no I/O).
 * Run: deno test -A supabase/functions/tests/
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeConversationMetrics } from "../_shared/metrics.ts";
import type { SpeakerSegment } from "../_shared/insights.ts";

function seg(speaker: string, start: number, end: number, text = "hello"): SpeakerSegment {
  return { speaker, text, start, end };
}

Deno.test("single speaker: 100% share, balance 1, one turn", () => {
  const m = computeConversationMetrics([seg("Alice", 0, 60)], 120);
  assertEquals(m.speaker_participation.length, 1);
  assertEquals(m.speaker_participation[0].speaker, "Alice");
  assertEquals(m.speaker_participation[0].seconds, 60);
  assertEquals(m.speaker_participation[0].percentage, 100);
  assertEquals(m.speaker_participation[0].turns, 1);
  assertEquals(m.total_speaking_seconds, 60);
  assertEquals(m.silence_percentage, 50);
  assertEquals(m.turn_count, 1);
  assertEquals(m.participation_balance, 1);
  assertEquals(m.longest_monologue_speaker, "Alice");
  assertEquals(m.longest_monologue_seconds, 60);
});

Deno.test("two equal speakers alternating: balance 1, four turns", () => {
  const m = computeConversationMetrics(
    [seg("Alice", 0, 10), seg("Bob", 10, 20), seg("Alice", 20, 30), seg("Bob", 30, 40)],
    40,
  );
  assertEquals(m.turn_count, 4);
  assertEquals(m.total_speaking_seconds, 40);
  assertEquals(m.silence_percentage, 0);
  assertEquals(m.participation_balance, 1);
  const alice = m.speaker_participation.find((s) => s.speaker === "Alice")!;
  assertEquals(alice.seconds, 20);
  assertEquals(alice.percentage, 50);
  assertEquals(alice.turns, 2);
});

Deno.test("consecutive same-speaker segments count as one turn and one monologue", () => {
  const m = computeConversationMetrics(
    [seg("Alice", 0, 10), seg("Alice", 10, 25), seg("Bob", 25, 30)],
    30,
  );
  assertEquals(m.turn_count, 2);
  const alice = m.speaker_participation.find((s) => s.speaker === "Alice")!;
  assertEquals(alice.turns, 1);
  assertEquals(m.longest_monologue_speaker, "Alice");
  assertEquals(m.longest_monologue_seconds, 25);
});

Deno.test("unequal split lowers balance below 1", () => {
  const m = computeConversationMetrics([seg("Alice", 0, 90), seg("Bob", 90, 100)], 100);
  assertEquals(m.participation_balance < 1, true);
  assertEquals(m.participation_balance >= 0, true);
});

Deno.test("questions counted per speaker from segment text", () => {
  const m = computeConversationMetrics(
    [
      { speaker: "Alice", text: "Are we shipping? And when?", start: 0, end: 10 },
      { speaker: "Bob", text: "Yes.", start: 10, end: 20 },
    ],
    20,
  );
  assertEquals(m.speaker_participation.find((s) => s.speaker === "Alice")!.questions, 2);
  assertEquals(m.speaker_participation.find((s) => s.speaker === "Bob")!.questions, 0);
});

Deno.test("speech ending before wall-clock yields positive silence (real 582/664 case)", () => {
  const m = computeConversationMetrics([seg("Khush Mutha", 82, 582)], 664);
  assertEquals(m.total_speaking_seconds, 500);
  assertEquals(m.silence_percentage, 25);
});

Deno.test("overlapping segments cannot push silence below zero", () => {
  const m = computeConversationMetrics([seg("Alice", 0, 100), seg("Bob", 0, 100)], 100);
  assertEquals(m.total_speaking_seconds, 200);
  assertEquals(m.silence_percentage, 0);
});

Deno.test("empty segments produce a zeroed struct, not NaN", () => {
  const m = computeConversationMetrics([], 100);
  assertEquals(m.speaker_participation, []);
  assertEquals(m.total_speaking_seconds, 0);
  assertEquals(m.turn_count, 0);
  assertEquals(m.silence_percentage, 100);
  assertEquals(m.participation_balance, 0);
  assertEquals(m.longest_monologue_speaker, null);
});

Deno.test("zero duration does not divide by zero", () => {
  const m = computeConversationMetrics([seg("Alice", 0, 10)], 0);
  assertEquals(m.silence_percentage, 0);
  assertEquals(Number.isFinite(m.silence_percentage), true);
});

Deno.test("segments are ordered by start before turn detection", () => {
  const m = computeConversationMetrics(
    [seg("Bob", 20, 30), seg("Alice", 0, 10), seg("Alice", 10, 20)],
    30,
  );
  assertEquals(m.turn_count, 2);
  assertEquals(m.longest_monologue_speaker, "Alice");
});

Deno.test("missing start/end are treated as zero-length, not NaN", () => {
  const m = computeConversationMetrics(
    [{ speaker: "Alice", text: "hi" }, seg("Bob", 0, 10)],
    10,
  );
  assertEquals(m.total_speaking_seconds, 10);
  assertEquals(m.speaker_participation.find((s) => s.speaker === "Alice")!.seconds, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit`
Expected: FAIL — `Module not found "file:///.../supabase/functions/_shared/metrics.ts"`

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/_shared/metrics.ts`:

```ts
/**
 * Conversation metrics computed from transcript segments.
 *
 * Why this exists: `meeting_metrics` used to be produced by asking GPT-4o-mini
 * to estimate talk time. On meeting 7261568f it returned duration_seconds 300
 * for a 664-second meeting whose speech spans ~500 seconds — a plausible round
 * number presented as a measurement. Every segment already carries exact
 * start/end timings, so these are computed rather than guessed.
 *
 * Pure and synchronous: no I/O, no clock, no randomness. Fully unit-tested in
 * supabase/functions/tests/metrics_test.ts.
 */
import type { SpeakerSegment } from "./insights.ts";

export interface SpeakerStat {
  speaker: string;
  seconds: number;
  /** Share of total speech (speakers sum to 100), NOT of wall-clock. */
  percentage: number;
  turns: number;
  questions: number;
}

export interface ConversationMetrics {
  speaker_participation: SpeakerStat[];
  total_speaking_seconds: number;
  /** Percent of meeting duration with no speech, clamped to [0, 100]. */
  silence_percentage: number;
  turn_count: number;
  longest_monologue_seconds: number;
  longest_monologue_speaker: string | null;
  /** 1 - Gini over per-speaker seconds. 1 = perfectly even. */
  participation_balance: number;
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function segSeconds(s: SpeakerSegment): number {
  const start = Number(s.start ?? 0);
  const end = Number(s.end ?? 0);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

/**
 * Gini coefficient of a value distribution. 0 = perfectly even.
 * A single value yields 0 — one participant is evenly balanced by construction.
 */
function gini(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  let weighted = 0;
  for (let i = 0; i < n; i++) weighted += (i + 1) * sorted[i];
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

export function computeConversationMetrics(
  segments: SpeakerSegment[],
  durationSeconds: number,
): ConversationMetrics {
  const empty: ConversationMetrics = {
    speaker_participation: [],
    total_speaking_seconds: 0,
    silence_percentage: 0,
    turn_count: 0,
    longest_monologue_seconds: 0,
    longest_monologue_speaker: null,
    participation_balance: 0,
  };

  if (!Array.isArray(segments) || segments.length === 0) {
    // No speech at all: the whole meeting was silence, when we know its length.
    return { ...empty, silence_percentage: durationSeconds > 0 ? 100 : 0 };
  }

  // Turn detection depends on time order; callers do not guarantee it.
  const ordered = [...segments].sort(
    (a, b) => Number(a.start ?? 0) - Number(b.start ?? 0),
  );

  const bySpeaker = new Map<string, { seconds: number; turns: number; questions: number }>();
  let totalSpeaking = 0;
  let turnCount = 0;
  let prevSpeaker: string | null = null;

  let runSpeaker: string | null = null;
  let runSeconds = 0;
  let longestSeconds = 0;
  let longestSpeaker: string | null = null;

  for (const s of ordered) {
    const speaker = s.speaker || "Unknown";
    const secs = segSeconds(s);
    totalSpeaking += secs;

    const stat = bySpeaker.get(speaker) ?? { seconds: 0, turns: 0, questions: 0 };
    stat.seconds += secs;
    stat.questions += (String(s.text ?? "").match(/\?/g) || []).length;

    if (speaker !== prevSpeaker) {
      turnCount += 1;
      stat.turns += 1;
      if (runSeconds > longestSeconds) {
        longestSeconds = runSeconds;
        longestSpeaker = runSpeaker;
      }
      runSpeaker = speaker;
      runSeconds = secs;
    } else {
      runSeconds += secs;
    }

    bySpeaker.set(speaker, stat);
    prevSpeaker = speaker;
  }

  // The final run never hits the speaker-change branch above.
  if (runSeconds > longestSeconds) {
    longestSeconds = runSeconds;
    longestSpeaker = runSpeaker;
  }

  const participation: SpeakerStat[] = [...bySpeaker.entries()]
    .map(([speaker, v]) => ({
      speaker,
      seconds: round(v.seconds),
      percentage: totalSpeaking > 0 ? round((v.seconds / totalSpeaking) * 100) : 0,
      turns: v.turns,
      questions: v.questions,
    }))
    .sort((a, b) => b.seconds - a.seconds);

  const silence = durationSeconds > 0
    ? Math.min(100, Math.max(0, ((durationSeconds - totalSpeaking) / durationSeconds) * 100))
    : 0;

  return {
    speaker_participation: participation,
    total_speaking_seconds: round(totalSpeaking),
    silence_percentage: round(silence),
    turn_count: turnCount,
    longest_monologue_seconds: round(longestSeconds),
    longest_monologue_speaker: longestSpeaker,
    participation_balance: round(1 - gini(participation.map((p) => p.seconds))),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS — `ok | 37 passed | 0 failed` (26 existing + 11 new)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/metrics.ts supabase/functions/tests/metrics_test.ts
git commit -m "Add computed conversation metrics module

Pure function deriving talk time, turns, longest monologue, questions,
silence and participation balance from transcript segments. Replaces
numbers GPT-4o-mini was previously asked to estimate."
```

---

### Task 2: Use computed metrics in both transcription paths, stop asking GPT to guess

**Files:**
- Modify: `supabase/functions/_shared/insights.ts` (prompt + fallback shapes)
- Modify: `supabase/functions/sarvam-webhook/index.ts:451-470`
- Modify: `supabase/functions/process-meeting/index.ts:190-240`

**Interfaces:**
- Consumes: `computeConversationMetrics` from Task 1.
- Produces: `meeting_insights.meeting_metrics` now containing `ConversationMetrics` fields plus GPT's `sentiment_score`.

- [ ] **Step 1: Remove the fabricated fields from the GPT prompt**

In `supabase/functions/_shared/insights.ts`, find the prompt block (around line 186) and replace:

```
  "meeting_metrics": {
    "engagement_score": 75,
    "sentiment_score": 0.5,
    "speaker_participation": [{"speaker": "Name", "percentage": 50, "duration_seconds": 300}]
  }
```

with:

```
  "meeting_metrics": {
    "sentiment_score": 0.5
  }
```

Then update the two fallback shapes so they stop advertising removed fields.

Around line 54, replace:
```ts
    meeting_metrics: { engagement_score: 0, sentiment_score: 0, speaker_participation: [] },
```
with:
```ts
    meeting_metrics: { sentiment_score: 0 },
```

Around line 236, replace:
```ts
      meeting_metrics: {},
```
with:
```ts
      meeting_metrics: { sentiment_score: 0 },
```

- [ ] **Step 2: Merge computed metrics in sarvam-webhook**

In `supabase/functions/sarvam-webhook/index.ts`, add the import next to the existing `_shared` imports:

```ts
import { computeConversationMetrics } from "../_shared/metrics.ts";
```

The duration is currently computed *after* `saveInsights`. Metrics need it *before*. Replace the block that currently reads:

```ts
      const insights = await generateInsights(
        openai,
        meeting,
        finalTranscript,
        speakerSegments,
      );
      await saveInsights(supabase, meeting.id, insights);

      const endTime = new Date();
      const startTime = new Date(meeting.start_time);
```

with:

```ts
      const endTime = new Date();
      const startTime = new Date(meeting.start_time);
      // Duration is needed before saveInsights so silence_percentage can be
      // computed against real wall-clock, so it is derived here rather than
      // after the insight write.
      const audioDurationEarly = Number(config.audio_duration_seconds) || 0;
      const lastSegmentEndEarly = speakerSegments.reduce(
        (max, seg) => Math.max(max, Number(seg.end) || 0),
        0,
      );
      const durationForMetrics = Math.round(
        audioDurationEarly ||
          lastSegmentEndEarly ||
          (endTime.getTime() - startTime.getTime()) / 1000,
      );

      const insights = await generateInsights(
        openai,
        meeting,
        finalTranscript,
        speakerSegments,
      );
      // Computed values overwrite anything the model returned for these keys.
      insights.meeting_metrics = {
        ...(insights.meeting_metrics || {}),
        ...computeConversationMetrics(speakerSegments, durationForMetrics),
      };
      await saveInsights(supabase, meeting.id, insights);
```

Then replace the now-duplicated duration block that follows with a reuse:

```ts
      const audioDuration = Number(config.audio_duration_seconds) || 0;
      const lastSegmentEnd = speakerSegments.reduce(
        (max, seg) => Math.max(max, Number(seg.end) || 0),
        0,
      );
      const durationSeconds = Math.round(
        audioDuration ||
          lastSegmentEnd ||
          (endTime.getTime() - startTime.getTime()) / 1000,
      );
```

becomes:

```ts
      const durationSeconds = durationForMetrics;
```

- [ ] **Step 3: Merge computed metrics in process-meeting**

In `supabase/functions/process-meeting/index.ts`, add to the `_shared` imports:

```ts
import { computeConversationMetrics } from "../_shared/metrics.ts";
```

Replace:

```ts
  const insights = await generateInsights(
    openai,
    meeting,
    transcript,
    speakerSegments,
  );
  await saveInsights(supabase, meetingId, insights);

  const startTime = new Date(meeting.start_time);
```

with:

```ts
  const startTime = new Date(meeting.start_time);
  const audioDuration =
    Number(meeting.processing_config?.audio_duration_seconds) || 0;
  const lastSegmentEnd = speakerSegments.reduce(
    (max, seg) => Math.max(max, Number(seg.end) || 0),
    0,
  );
  const durationSeconds = Math.round(
    audioDuration ||
      lastSegmentEnd ||
      (endTime.getTime() - startTime.getTime()) / 1000,
  );

  const insights = await generateInsights(
    openai,
    meeting,
    transcript,
    speakerSegments,
  );
  insights.meeting_metrics = {
    ...(insights.meeting_metrics || {}),
    ...computeConversationMetrics(speakerSegments, durationSeconds),
  };
  await saveInsights(supabase, meetingId, insights);
```

Then delete the duplicated duration computation that follows it (the original `const audioDuration` / `const lastSegmentEnd` / `const durationSeconds` block introduced earlier in this file), leaving the single definition above.

- [ ] **Step 4: Typecheck**

Run: `deno check supabase/functions/sarvam-webhook/index.ts supabase/functions/process-meeting/index.ts supabase/functions/_shared/metrics.ts`
Expected: no new errors. Two pre-existing errors are known and unrelated — `TS18046 'error' is of type 'unknown'` in `auto-join-meetings`, and `TS2339 Property 'words' does not exist on type 'Transcription'` in `process-meeting:75`.

- [ ] **Step 5: Run unit tests and evals**

Run: `npm run test:unit`
Expected: PASS — 37 passed.

Run: `python3 scripts/evals/run_evals.py`
Expected: `RESULT: PASS — every eval matched expectations`. The insights prompt changed, so this is the regression gate.

- [ ] **Step 6: Deploy and verify against the harness**

```bash
supabase functions deploy sarvam-webhook
supabase functions deploy process-meeting
python3 scripts/pipeline-test/harness.py
```
Expected: `RESULT: 11/11 passed`

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/insights.ts supabase/functions/sarvam-webhook/index.ts supabase/functions/process-meeting/index.ts
git commit -m "Compute meeting_metrics instead of asking GPT to estimate them

Removes speaker_participation and engagement_score from the insights
prompt. The first invented talk-time numbers; the second was an
unfalsifiable 0-100 score. sentiment_score stays, being a genuine
judgment call. Computed values are merged over the model output."
```

---

### Task 3: Render the metrics component that was never wired up

**Files:**
- Modify: `src/components/meeting/MeetingMetrics.tsx`
- Modify: `src/pages/MeetingDetail.tsx`

**Interfaces:**
- Consumes: `meeting_insights.meeting_metrics` produced by Task 2.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Extend the component's data shape**

In `src/components/meeting/MeetingMetrics.tsx`, replace the `MeetingMetricsData` interface with:

```ts
export interface SpeakerStat {
  speaker: string;
  seconds?: number;
  percentage: number;
  duration_seconds?: number;
  turns?: number;
  questions?: number;
}

export interface MeetingMetricsData {
  sentiment_score?: number; // -1 to 1
  speaker_participation?: SpeakerStat[];
  total_speaking_seconds?: number;
  silence_percentage?: number;
  turn_count?: number;
  longest_monologue_seconds?: number;
  longest_monologue_speaker?: string | null;
  participation_balance?: number; // 0..1
}
```

`engagement_score` is removed — Task 2 stopped producing it. `duration_seconds` and `seconds` are both optional so historical rows written by the old GPT path still render without crashing.

- [ ] **Step 2: Guard against the old field name**

Still in `MeetingMetrics.tsx`, wherever a speaker's seconds are read for display, use:

```ts
const speakerSeconds = (s: SpeakerStat) => s.seconds ?? s.duration_seconds ?? 0;
```

Delete the `getEngagementColor` helper and any JSX referencing `metrics.engagement_score`.

- [ ] **Step 3: Render it in MeetingDetail**

In `src/pages/MeetingDetail.tsx`, add the import alongside the other component imports:

```ts
import { MeetingMetrics } from '@/components/meeting/MeetingMetrics';
```

Render it inside the insights area, guarded so meetings without metrics show nothing rather than an empty card:

```tsx
{insights?.meeting_metrics &&
  Object.keys(insights.meeting_metrics).length > 0 && (
    <MeetingMetrics metrics={insights.meeting_metrics} />
)}
```

Place it directly after the summary block and before the action-items block, matching the existing section ordering on that page.

- [ ] **Step 4: Build and eyeball**

Run: `npm run build`
Expected: `✓ built in …` with no TypeScript errors.

Run: `npm run dev`, open a completed meeting at `/meeting/:id`, confirm the metrics card renders with real talk-time.

- [ ] **Step 5: Commit**

```bash
git add src/components/meeting/MeetingMetrics.tsx src/pages/MeetingDetail.tsx
git commit -m "Render MeetingMetrics, which was dead code

The component existed and was imported nowhere, so computed conversation
metrics never reached the user. Drops engagement_score and tolerates the
old duration_seconds field name on historical rows."
```

---

### Task 4: `chat-transcripts` edge function

**Files:**
- Create: `supabase/functions/chat-transcripts/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `getCorsHeaders`, `handleCorsPrelight` from `supabase/functions/_shared/cors.ts`.
- Produces: `POST /functions/v1/chat-transcripts` returning `{ answer, citations, context_meetings, context_tokens, truncated }`.

- [ ] **Step 1: Write the function**

Create `supabase/functions/chat-transcripts/index.ts`:

```ts
/**
 * Chat across a user's own meeting history.
 *
 * Retrieval strategy is deliberate context-stuffing, not vector search. The
 * per-user corpus is small (avg transcript ~2,126 tokens), and an embedding
 * pipeline would add another async step that can silently drift out of sync —
 * failing as "chat doesn't know about that meeting", which is indistinguishable
 * from an unhelpful model. See the design doc for the full argument.
 *
 * Security: this function uses the CALLER'S JWT rather than the service-role
 * key, so RLS scopes transcripts to their own meetings. Chat is the one feature
 * where a scoping bug leaks another user's private meeting content, so that
 * guarantee belongs in Postgres rather than in a user_id filter.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.20.1";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

const MAX_CONTEXT_TOKENS = 100_000;

interface MeetingContext {
  meeting_id: string;
  title: string;
  date: string;
  content: string;
}

/** Crude on purpose: used only for the ceiling guard and the trend log. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * The retrieval seam. Today it returns every transcript the caller can read.
 * When the token log shows the ceiling approaching, ranked retrieval replaces
 * the body of this function and nothing else changes.
 */
async function buildContext(
  supabase: ReturnType<typeof createClient>,
): Promise<{ items: MeetingContext[]; truncated: boolean; tokens: number }> {
  const { data, error } = await supabase
    .from("transcripts")
    .select("meeting_id, content, meetings(title, start_time)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`transcript query failed: ${error.message}`);

  const all: MeetingContext[] = (data ?? [])
    .filter((r: any) => String(r.content ?? "").trim())
    .map((r: any) => ({
      meeting_id: r.meeting_id,
      title: r.meetings?.title || "Untitled meeting",
      date: (r.meetings?.start_time || "").slice(0, 10),
      content: String(r.content),
    }));

  // Newest first, so truncation drops the oldest.
  const kept: MeetingContext[] = [];
  let tokens = 0;
  let truncated = false;
  for (const item of all) {
    const cost = estimateTokens(item.content) + 40;
    if (tokens + cost > MAX_CONTEXT_TOKENS) {
      truncated = true;
      break;
    }
    kept.push(item);
    tokens += cost;
  }
  return { items: kept, truncated, tokens };
}

function renderContext(items: MeetingContext[]): string {
  return items
    .map(
      (m) =>
        `### Meeting: ${m.title}  |  ${m.date}  |  id: ${m.meeting_id}\n${m.content}`,
    )
    .join("\n\n");
}

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const { question, history } = await req.json();
    if (!question || typeof question !== "string" || !question.trim()) {
      return json({ error: "question is required" }, 400);
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) return json({ error: "OPENAI_API_KEY not configured" }, 500);

    // Caller's token, NOT the service role key — RLS does the scoping.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { items, truncated, tokens } = await buildContext(supabase);
    console.log(
      `[chat-transcripts] meetings=${items.length} tokens=${tokens} truncated=${truncated}`,
    );

    if (items.length === 0) {
      return json({
        answer:
          "I could not find any transcripts in your meeting history yet. Once a meeting has been recorded and transcribed, I can answer questions about it.",
        citations: [],
        context_meetings: 0,
        context_tokens: 0,
        truncated: false,
      });
    }

    const truncationNote = truncated
      ? "\n\nNOTE: The user has more meetings than fit in context. Only the most recent are included. If the answer may lie in older meetings, say so explicitly."
      : "";

    const systemPrompt =
      `You answer questions about the user's own past meetings, using ONLY the transcripts provided below.\n\n` +
      `Rules:\n` +
      `- Answer only from the transcripts. Never infer, guess, or use outside knowledge.\n` +
      `- If the answer is not present, say so plainly. Do not speculate.\n` +
      `- Cite the meetings you used by their exact id.\n` +
      `- Be concise and specific. Quote briefly when a quote settles the question.\n\n` +
      `Respond as JSON: {"answer": string, "cited_meeting_ids": string[]}` +
      truncationNote +
      `\n\n--- TRANSCRIPTS ---\n${renderContext(items)}`;

    const priorTurns = Array.isArray(history)
      ? history
          .filter(
            (h: any) =>
              (h?.role === "user" || h?.role === "assistant") &&
              typeof h?.content === "string",
          )
          .slice(-10)
      : [];

    const openai = new OpenAI({ apiKey: openaiApiKey });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...priorTurns,
        { role: "user", content: question },
      ],
      response_format: { type: "json_object" },
    });

    let answer = "";
    let citedIds: string[] = [];
    try {
      const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
      answer = String(parsed.answer || "").trim();
      citedIds = Array.isArray(parsed.cited_meeting_ids)
        ? parsed.cited_meeting_ids.map(String)
        : [];
    } catch {
      answer = String(completion.choices[0]?.message?.content || "").trim();
    }
    if (!answer) answer = "I was not able to produce an answer for that question.";

    // Only cite meetings that were actually in context — a model can invent ids.
    const byId = new Map(items.map((m) => [m.meeting_id, m]));
    const citations = citedIds
      .filter((id) => byId.has(id))
      .map((id) => {
        const m = byId.get(id)!;
        return { meeting_id: m.meeting_id, title: m.title, date: m.date };
      });

    return json({
      answer,
      citations,
      context_meetings: items.length,
      context_tokens: tokens,
      truncated,
    });
  } catch (error) {
    console.error("[chat-transcripts] error:", error);
    return json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      500,
    );
  }
});
```

- [ ] **Step 2: Keep JWT verification ON**

In `supabase/config.toml`, add this block next to the other function entries. Note it sets `verify_jwt = true`, unlike most functions in this project — the function needs a real user identity for RLS to mean anything.

```toml
[functions.chat-transcripts]
verify_jwt = true
```

- [ ] **Step 3: Typecheck**

Run: `deno check supabase/functions/chat-transcripts/index.ts`
Expected: `Check file:///...` with no errors.

- [ ] **Step 4: Deploy**

Run: `supabase functions deploy chat-transcripts`
Expected: `Deployed Functions on project lekkpfpojlspbuwrtmzt: chat-transcripts`

- [ ] **Step 5: Verify scoping and behaviour against production**

Confirm an unauthenticated call is rejected:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://lekkpfpojlspbuwrtmzt.supabase.co/functions/v1/chat-transcripts" \
  -H "Content-Type: application/json" -d '{"question":"hi"}'
```
Expected: `401`

**Do NOT test scoping with the service-role key.** In Supabase the `service_role` JWT *bypasses* RLS entirely, so such a call would return every user's transcripts and look like a scoping bug that is not there — or worse, mask one. Scoping can only be verified with a real end-user session.

Verify scoping properly with two different accounts:

1. Sign in through the running dev app as user A and ask a question whose answer you know from one of A's meetings. Confirm the answer is correct and `citations` points at a meeting that genuinely contains the claim.
2. Sign in as user B (an account with different meetings) and ask a question that could only be answered from A's meetings. Confirm the answer is "not present in your meetings" and `context_meetings` reflects only B's own transcript count.

The second check is the one that matters. Test 1 passing tells you the feature works; only test 2 tells you it is scoped.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/chat-transcripts/index.ts supabase/config.toml
git commit -m "Add chat-transcripts edge function

Answers questions across the caller's own meetings by stuffing all their
transcripts into gpt-4o-mini, with structured citations. Uses the caller's
JWT so RLS enforces scoping rather than a user_id filter. Degrades loudly
past the context ceiling instead of silently answering from partial history."
```

---

### Task 5: Chat page, route and navigation

**Files:**
- Create: `src/pages/Chat.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/dashboard/Sidebar.tsx`

**Interfaces:**
- Consumes: `POST /functions/v1/chat-transcripts` from Task 4.

- [ ] **Step 1: Create the page**

Create `src/pages/Chat.tsx`:

```tsx
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Send, Loader2, MessageSquare } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface Citation {
  meeting_id: string;
  title: string;
  date: string;
}

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  truncated?: boolean;
}

export default function Chat() {
  const navigate = useNavigate();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, loading]);

  const ask = async () => {
    const question = input.trim();
    if (!question || loading) return;
    setInput('');
    setError(null);
    setTurns((t) => [...t, { role: 'user', content: question }]);
    setLoading(true);

    try {
      const history = turns.map((t) => ({ role: t.role, content: t.content }));
      const { data, error: fnError } = await supabase.functions.invoke('chat-transcripts', {
        body: { question, history },
      });
      if (fnError) throw fnError;
      setTurns((t) => [
        ...t,
        {
          role: 'assistant',
          content: data.answer,
          citations: data.citations || [],
          truncated: !!data.truncated,
        },
      ]);
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold">Ask your meetings</h1>
          <p className="text-sm text-muted-foreground">
            Questions are answered from your own meeting transcripts, with citations.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {turns.length === 0 && (
            <div className="text-center text-muted-foreground py-16">
              <MessageSquare className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Try: “What did we decide about pricing?”</p>
            </div>
          )}

          {turns.map((t, i) => (
            <div
              key={i}
              className={cn(
                'rounded-lg px-4 py-3 text-sm',
                t.role === 'user'
                  ? 'bg-primary/10 ml-auto max-w-[80%]'
                  : 'bg-muted mr-auto max-w-[90%]',
              )}
            >
              <p className="whitespace-pre-wrap">{t.content}</p>

              {t.truncated && (
                <p className="mt-2 text-xs text-warning">
                  Only your most recent meetings fit in context — older ones were not searched.
                </p>
              )}

              {t.citations && t.citations.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {t.citations.map((c) => (
                    <button
                      key={c.meeting_id}
                      onClick={() => navigate(`/meeting/${c.meeting_id}`)}
                      className="text-xs px-2 py-1 rounded-md border border-border hover:bg-background transition-colors"
                    >
                      {c.title} · {c.date}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching your meetings…
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
          className="flex gap-2 pt-4"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your meetings…"
            disabled={loading}
          />
          <Button type="submit" disabled={loading || !input.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </DashboardLayout>
  );
}
```

- [ ] **Step 2: Add the route**

In `src/App.tsx`, add the import beside the other page imports:

```ts
import Chat from "./pages/Chat";
```

and add this route immediately after the `/action-items` route block:

```tsx
        <Route
          path="/chat"
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />
```

- [ ] **Step 3: Add the sidebar entry**

In `src/components/dashboard/Sidebar.tsx`, add `MessageSquare` to the existing `lucide-react` import, then insert into the `navItems` array between "Action items" and "Settings":

```ts
  { icon: MessageSquare, label: 'Ask', path: '/chat' },
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `✓ built in …` with no TypeScript errors.

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`, sign in, open `/chat`, and ask a question whose answer you know from a real meeting. Confirm: an answer appears, at least one citation chip renders, and clicking it navigates to that meeting.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Chat.tsx src/App.tsx src/components/dashboard/Sidebar.tsx
git commit -m "Add /chat page for asking questions across meeting history

Multi-turn within a session, citation chips linking to the source meeting,
and an explicit notice when older meetings did not fit in context."
```

---

## Final verification

- [ ] `npm run test:unit` → 37 passed
- [ ] `npm run build` → clean
- [ ] `python3 scripts/evals/run_evals.py` → PASS
- [ ] `python3 scripts/pipeline-test/harness.py` → 11/11
- [ ] Ask a chat question with a known answer; citation points at a meeting that actually contains it
- [ ] Open a completed meeting; metrics card shows talk time matching the transcript rather than a round number

## Known limitations to record, not fix

- Computed talk time is only as accurate as speaker attribution, and multi-speaker attribution is still unvalidated — the 2026-08-20 drill had one participant, which triggers the single-participant fast path and bypasses per-segment mapping. These numbers are honestly derived, not automatically correct.
- Chat context holds roughly 47 meetings per user. Watch `context_tokens` in the function logs; when it trends past ~80,000, replace the body of `buildContext()` with ranked retrieval.
- Chat conversations are not persisted; a refresh clears the thread.
