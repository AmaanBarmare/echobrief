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
  // One speaker cannot be balanced or unbalanced against anyone.
  assertEquals(m.participation_balance, null);
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
  assertEquals(m.participation_balance! < 1, true);
  assertEquals(m.participation_balance! >= 0, true);
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
  // 164 s of the 664 s wall-clock carried no speech: 24.6988% -> 24.7 at 2 dp.
  assertEquals(m.silence_percentage, 24.7);
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
  assertEquals(m.participation_balance, null);
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

Deno.test("a long gap splits a monologue but not a turn", () => {
  // Real case: meeting 7261568f reported a 244.94 s "uninterrupted stretch"
  // that actually contained 36 gaps, one of them 62 s long.
  const m = computeConversationMetrics(
    [seg("Alice", 0, 20), seg("Alice", 50, 60)],
    60,
  );
  assertEquals(m.turn_count, 1);
  assertEquals(m.total_speaking_seconds, 30);
  assertEquals(m.longest_monologue_seconds, 20);
  assertEquals(m.longest_monologue_speaker, "Alice");
});

Deno.test("a short gap does not split a monologue", () => {
  const m = computeConversationMetrics(
    [seg("Alice", 0, 20), seg("Alice", 25, 35)],
    35,
  );
  assertEquals(m.longest_monologue_seconds, 30);
});

Deno.test("a monologue counts speech, never the silence inside it", () => {
  const m = computeConversationMetrics(
    [seg("Alice", 0, 10), seg("Alice", 14, 24)],
    24,
  );
  // 24 s of wall-clock, but only 20 s of speech.
  assertEquals(m.longest_monologue_seconds, 20);
});

Deno.test("the later of two equal-length monologues does not displace the first", () => {
  const m = computeConversationMetrics(
    [seg("Alice", 0, 10), seg("Bob", 10, 20)],
    20,
  );
  assertEquals(m.longest_monologue_speaker, "Alice");
  assertEquals(m.longest_monologue_seconds, 10);
});

Deno.test("participation_balance needs at least two speakers", () => {
  assertEquals(computeConversationMetrics([seg("Alice", 0, 10)], 10).participation_balance, null);
  assertEquals(
    computeConversationMetrics([seg("Alice", 0, 10), seg("Bob", 10, 20)], 20).participation_balance,
    1,
  );
});

import { mergeMeetingMetrics } from "../_shared/metrics.ts";

Deno.test("merge drops model keys that are not sentiment_score", () => {
  const computed = computeConversationMetrics([seg("Alice", 0, 30)], 60);
  const merged = mergeMeetingMetrics(
    { engagement_score: 80, sentiment_score: 0.5, speaker_participation: [{ bogus: true }] },
    computed,
  );
  assertEquals("engagement_score" in merged, false);
  assertEquals(merged.sentiment_score, 0.5);
  assertEquals(merged.speaker_participation, computed.speaker_participation);
});

Deno.test("merge tolerates a missing or non-numeric sentiment_score", () => {
  const computed = computeConversationMetrics([seg("Alice", 0, 30)], 60);
  assertEquals("sentiment_score" in mergeMeetingMetrics(null, computed), false);
  assertEquals("sentiment_score" in mergeMeetingMetrics({}, computed), false);
  assertEquals(
    "sentiment_score" in mergeMeetingMetrics({ sentiment_score: "warm" }, computed),
    false,
  );
});

Deno.test("computed values always win over model values of the same name", () => {
  const computed = computeConversationMetrics([seg("Alice", 0, 30)], 60);
  const merged = mergeMeetingMetrics({ total_speaking_seconds: 999, turn_count: 42 }, computed);
  assertEquals(merged.total_speaking_seconds, 30);
  assertEquals(merged.turn_count, 1);
});
