/**
 * Unit harness: long-meeting detection + split-audio Whisper result shaping.
 * Run: deno test -A supabase/functions/tests/
 */
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isLongMeeting,
  splitAudioResultToSarvamShape,
  transcribeViaSplitAudio,
  LONG_MEETING_SECONDS,
} from "../_shared/whisper-chunked.ts";
import { jsonResponse, mockFetch } from "./helpers.ts";

Deno.test("short meeting with no split metadata is not long", () => {
  assertEquals(isLongMeeting(null), false);
  assertEquals(isLongMeeting({}), false);
  assertEquals(isLongMeeting({ audio_duration_seconds: 300, chunk_count: 1 }), false);
});

Deno.test("duration above the unchunked Sarvam limit is long", () => {
  assertEquals(isLongMeeting({ audio_duration_seconds: LONG_MEETING_SECONDS }), false);
  assertEquals(isLongMeeting({ audio_duration_seconds: LONG_MEETING_SECONDS + 1 }), true);
  assertEquals(isLongMeeting({ audio_duration_seconds: 3209 }), true);
});

Deno.test("multi-chunk vercel-ffmpeg meetings are long even without duration", () => {
  assertEquals(
    isLongMeeting({ split_method: "vercel-ffmpeg", chunk_count: 11 }),
    true,
  );
  assertEquals(
    isLongMeeting({ split_method: "vercel-ffmpeg", chunk_count: 1 }),
    false,
  );
});

Deno.test("splitAudioResultToSarvamShape maps segments and drops empties", () => {
  const out = splitAudioResultToSarvamShape({
    transcript: " hello ",
    language_code: "english",
    segments: [
      { text: "hello", start: 1, end: 2 },
      { text: "  ", start: 3, end: 4 },
      { text: "world", start: 5, end: 6 },
    ],
    duration_seconds: 3209,
  });
  assertEquals(out.transcript, "hello");
  assertEquals(out.language_code, "english");
  assertEquals(out.diarized_transcript.entries.length, 2);
  assertEquals(out.diarized_transcript.entries[1].start_time_seconds, 5);
  assertEquals(out.duration_seconds, 3209);
});

Deno.test("transcribeViaSplitAudio posts whisper mode and shapes the result", async () => {
  Deno.env.set("SPLIT_AUDIO_URL", "https://example.test/api/split-audio");
  Deno.env.set("SPLIT_AUDIO_SECRET", "secret");
  const restore = mockFetch((url) => {
    assertEquals(url, "https://example.test/api/split-audio");
    return jsonResponse({
      transcript: "How's everything going?",
      language_code: "en",
      segments: [{ text: "How's everything going?", start: 0.5, end: 2.1 }],
    });
  });
  try {
    const supabase = {
      storage: {
        from: () => ({
          createSignedUrl: () =>
            Promise.resolve({ data: { signedUrl: "https://signed.example/audio.mp3" } }),
        }),
      },
    };
    const out = await transcribeViaSplitAudio(supabase, "recordings/u/m/recall-audio.mp3");
    assertEquals(out.transcript, "How's everything going?");
    assertEquals(out.diarized_transcript.entries[0].speaker_id, "0");
  } finally {
    restore();
    Deno.env.delete("SPLIT_AUDIO_URL");
    Deno.env.delete("SPLIT_AUDIO_SECRET");
  }
});

Deno.test("transcribeViaSplitAudio throws when splitter is not configured", async () => {
  Deno.env.delete("SPLIT_AUDIO_URL");
  Deno.env.delete("SPLIT_AUDIO_SECRET");
  await assertRejects(
    () => transcribeViaSplitAudio({}, "recordings/a.mp3"),
    Error,
    "not configured",
  );
});
