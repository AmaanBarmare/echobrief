/**
 * Unit harness: coaching benchmarks + hedge density (pure logic, no I/O).
 * Run: deno test -A supabase/functions/tests/
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  benchmarkMetrics,
  classifySpeakers,
  hedgeDensity,
} from "../_shared/coaching.ts";
import { computeConversationMetrics } from "../_shared/metrics.ts";
import type { SpeakerSegment } from "../_shared/insights.ts";

const ATTENDEES = [
  { email: "khush@oltaflock.ai", self: true },
  { email: "vineet@oltaflock.ai", organizer: true },
  { email: "mathew@ryanandcotravel.com.au" },
];

Deno.test("classifySpeakers splits workspace side from guests", () => {
  const { internal, external } = classifySpeakers(
    ["Khush Mutha", "Vineet Patel", "Mathew Ryan"],
    ATTENDEES,
  );
  assertEquals(external, ["Mathew Ryan"]);
  // Unmatched names default to internal — safer than grading a guest.
  assertEquals(internal.sort(), ["Khush Mutha", "Vineet Patel"].sort());
});

Deno.test("hedgeDensity counts hedge phrases per 100 words for chosen speakers", () => {
  const segments: SpeakerSegment[] = [
    { speaker: "Rep", text: "I think maybe we could possibly do that, like, you know", start: 0, end: 10 },
    { speaker: "Guest", text: "maybe maybe maybe", start: 10, end: 12 },
  ];
  const rep = hedgeDensity(segments, ["Rep"]);
  assertEquals(rep.total, 5); // i think, maybe, possibly, like, you know
  assertEquals(rep.words, 11);
  const everyone = hedgeDensity(segments, []);
  assertEquals(everyone.total, 8);
});

function seg(speaker: string, start: number, end: number, text = "word ".repeat(20)): SpeakerSegment {
  return { speaker, text, start, end };
}

Deno.test("benchmarkMetrics flags a rep-heavy discovery call", () => {
  // Rep speaks 700s of 1000s of speech → 70%.
  const segments = [
    seg("Khush Mutha", 0, 700),
    seg("Mathew Ryan", 700, 1000),
  ];
  const metrics = computeConversationMetrics(segments, 1100);
  const out = benchmarkMetrics(metrics, segments, ["Khush Mutha"]);
  assertEquals(out.talk_ratio?.value, 70);
  assertEquals(out.talk_ratio?.verdict, "high");
  assert(out.talk_ratio!.note.includes("under 45%"));
  assertEquals(out.longest_monologue?.verdict, "high");
});

Deno.test("benchmarkMetrics stays quiet when the rep is disciplined", () => {
  const segments = [
    seg("Khush Mutha", 0, 30),
    seg("Mathew Ryan", 30, 90),
    seg("Khush Mutha", 90, 120),
    seg("Mathew Ryan", 120, 200),
  ];
  const metrics = computeConversationMetrics(segments, 210);
  const out = benchmarkMetrics(metrics, segments, ["Khush Mutha"]);
  assertEquals(out.talk_ratio?.verdict, "good");
  // Longest stretch here is the PROSPECT's 80s — that is good discovery,
  // not a rep monologue, so it is not graded at all.
  assertEquals(out.longest_monologue, undefined);
});

Deno.test("benchmarkMetrics grades the monologue when it is the rep's", () => {
  const segments = [
    seg("Khush Mutha", 0, 96),
    seg("Mathew Ryan", 96, 150),
  ];
  const metrics = computeConversationMetrics(segments, 160);
  const out = benchmarkMetrics(metrics, segments, ["Khush Mutha"]);
  assertEquals(out.longest_monologue?.value, 96);
  assertEquals(out.longest_monologue?.verdict, "high");
});

Deno.test("benchmarkMetrics skips talk ratio for solo recordings", () => {
  const segments = [seg("Khush Mutha", 0, 600)];
  const metrics = computeConversationMetrics(segments, 700);
  const out = benchmarkMetrics(metrics, segments, ["Khush Mutha"]);
  assertEquals(out.talk_ratio, undefined);
});
