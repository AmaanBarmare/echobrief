/**
 * Unit harness: chunk-stitch math (pure logic, no I/O).
 * Run: deno test -A supabase/functions/tests/
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stitchChunkResults } from "../_shared/stitch.ts";

function chunk(text: string, entries: Array<[number, number]>, lang: string | null = "hi-IN") {
  return {
    transcript: text,
    language_code: lang,
    diarized_transcript: {
      entries: entries.map(([s, e]) => ({
        speaker_id: "0",
        transcript: text,
        start_time_seconds: s,
        end_time_seconds: e,
      })),
    },
  };
}

Deno.test("offsets each chunk's timestamps by index * chunkSeconds", () => {
  const out = stitchChunkResults(
    [chunk("first", [[1, 10]]), chunk("second", [[2, 20]]), chunk("third", [[3, 30]])],
    300,
  );
  const starts = out.diarized_transcript.entries.map((e) => e.start_time_seconds);
  assertEquals(starts, [1, 302, 603]);
  assertEquals(out.transcript, "first second third");
});

Deno.test("sorts out-of-order entries within and across chunks", () => {
  const out = stitchChunkResults(
    [chunk("a", [[50, 60], [10, 20], [40, 45]])],
    300,
  );
  const starts = out.diarized_transcript.entries.map((e) => e.start_time_seconds);
  assertEquals(starts, [10, 40, 50]);
});

Deno.test("counts empty chunks and skips their text", () => {
  const out = stitchChunkResults(
    [chunk("hello", [[0, 5]]), chunk("", []), chunk("  ", []), chunk("world", [[1, 4]])],
    300,
  );
  assertEquals(out.empty_chunks, 2);
  assertEquals(out.transcript, "hello world");
});

Deno.test("language_code = first non-null chunk language", () => {
  const out = stitchChunkResults(
    [chunk("x", [[0, 1]], null), chunk("y", [[0, 1]], "en-IN"), chunk("z", [[0, 1]], "hi-IN")],
    300,
  );
  assertEquals(out.language_code, "en-IN");
});

Deno.test("all chunks empty → empty transcript, unknown language", () => {
  // Real silent-empty failures carry language_code: null (observed in prod)
  const out = stitchChunkResults([chunk("", [], null), chunk("", [], null)], 300);
  assertEquals(out.transcript, "");
  assertEquals(out.language_code, "unknown");
  assertEquals(out.empty_chunks, 2);
});

Deno.test("single chunk passes through with zero offset", () => {
  const out = stitchChunkResults([chunk("solo", [[7, 9]])], 300);
  assertEquals(out.diarized_transcript.entries[0].start_time_seconds, 7);
  assertEquals(out.transcript, "solo");
});

Deno.test("legacy start/end keys are offset too", () => {
  const out = stitchChunkResults(
    [
      { transcript: "legacy", language_code: "en", diarized_transcript: { entries: [{ start: 5, end: 8, transcript: "legacy" }] } },
      { transcript: "more", language_code: "en", diarized_transcript: { entries: [{ start: 2, end: 4, transcript: "more" }] } },
    ],
    100,
  );
  const starts = out.diarized_transcript.entries.map((e) => e.start_time_seconds);
  assertEquals(starts, [5, 102]);
});
