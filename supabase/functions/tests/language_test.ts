/**
 * Unit harness: language detection + mix (pure logic, no I/O).
 * Run: deno test -A supabase/functions/tests/
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  formatLanguageMix,
  languageMix,
  segmentLanguage,
} from "../_shared/language.ts";

Deno.test("segmentLanguage classifies by script", () => {
  assertEquals(segmentLanguage("So then we found our way into travel."), "en");
  assertEquals(segmentLanguage("अच्छा भाई ये बन्दा वस अच्छी"), "hi");
  assertEquals(segmentLanguage("uske baad मैंने बोला okay done fine"), "mixed");
  assertEquals(segmentLanguage("… 123 !!"), "unknown");
  assertEquals(segmentLanguage(""), "unknown");
});

Deno.test("languageMix weights by segment duration", () => {
  const mix = languageMix([
    { speaker: "A", text: "अच्छा भाई ये बन्दा", start: 0, end: 12 },
    { speaker: "B", text: "we worked with a couple of companies", start: 12, end: 100 },
  ]);
  assertEquals(mix, { hi: 0.12, en: 0.88 });
});

Deno.test("languageMix drops sub-2% noise and handles empty input", () => {
  const mix = languageMix([
    { speaker: "A", text: "hello there my friend", start: 0, end: 99 },
    { speaker: "B", text: "हाँ", start: 99, end: 100 },
  ]);
  assertEquals(mix, { en: 0.99 });
  assertEquals(languageMix([]), {});
});

Deno.test("languageMix falls back to word count when timings are missing", () => {
  const mix = languageMix([
    { speaker: "A", text: "one two three four five six seven eight nine ten" },
    { speaker: "B", text: "अच्छा भाई ये बन्दा वस अच्छी तो गत लेंगे हो" },
  ]);
  assertEquals(mix, { en: 0.5, hi: 0.5 });
});

Deno.test("formatLanguageMix renders sorted human-readable shares", () => {
  assertEquals(formatLanguageMix({ hi: 0.12, en: 0.88 }), "English 88% · Hindi 12%");
  assertEquals(formatLanguageMix({}), "");
  assertEquals(formatLanguageMix(null), "");
});
