/**
 * Unit harness: the transcript hallucination detector.
 * Run: deno test -A supabase/functions/tests/hallucination_test.ts
 *
 * The detector exists to throw away degenerate STT output — Whisper's
 * "you you you…" or one sentence looped for an hour. On 2026-08-31 it also
 * threw away a real 60-minute coaching call: 10,363 words with 1,531 distinct
 * ones is a unique-word ratio of 0.148, and the rule flagged anything under
 * 0.2. Vocabulary grows sub-linearly with length (Heaps' law — the same
 * transcript's first 1,000 words had a ratio of 0.35, its first 5,000 words
 * 0.185), so every dense 30+ minute meeting was one vocabulary roll away from
 * "no usable transcript".
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isLikelyHallucination } from "../_shared/insights.ts";

// Deterministic PRNG so the synthetic transcript is identical on every run.
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Synthetic conversation with the shape of the real one: a small set of very
 * frequent function/filler words plus a long tail of content words that each
 * appear once. ~10k words, ~1.5k distinct → ratio ≈ 0.15, like the real call.
 */
function longConversation(): string {
  const common = [
    "you", "like", "to", "the", "i", "and", "that", "a", "so", "um",
    "we", "it", "is", "of", "in", "yeah", "know", "what", "think", "for",
  ];
  const rnd = lcg(42);
  const words: string[] = [];
  let rare = 0;
  for (let i = 0; i < 10_000; i++) {
    if (rnd() < 0.15) words.push(`topic${rare++}`);
    else words.push(common[Math.floor(rnd() * common.length)]);
  }
  return words.join(" ");
}

Deno.test("a long real conversation is kept even though its unique-word ratio is under 0.2", () => {
  const text = longConversation();
  const words = text.split(/\s+/);
  const ratio = new Set(words).size / words.length;
  assertEquals(ratio < 0.2, true, `fixture must reproduce the long-transcript ratio, got ${ratio}`);
  assertEquals(isLikelyHallucination(text), false);
});

Deno.test("degenerate loops are still caught at any length", () => {
  assertEquals(isLikelyHallucination("you ".repeat(500)), true);
  assertEquals(isLikelyHallucination("Thank you. Thank you. Thank you."), true);
  assertEquals(isLikelyHallucination("okay okay okay okay okay okay"), true);
  // One sentence repeated for ~25 minutes of "speech": 15 distinct words, 4,500 tokens.
  const loop = "so what we are going to do next is take a look at the numbers and decide. ";
  assertEquals(isLikelyHallucination(loop.repeat(300)), true);
});

Deno.test("empty output and ordinary short speech", () => {
  assertEquals(isLikelyHallucination(""), true);
  assertEquals(isLikelyHallucination("   "), true);
  assertEquals(
    isLikelyHallucination("We agreed to ship the pricing page on Friday and revisit the tiers next month."),
    false,
  );
  assertEquals(isLikelyHallucination("Okay so um yeah I think that works for us, let's do it."), false);
});
