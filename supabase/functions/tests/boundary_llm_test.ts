import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeLlmBoundaries } from "../_shared/boundary-llm.ts";

Deno.test("normalizeLlmBoundaries accepts a confident, ordered window with padding", () => {
  const b = normalizeLlmBoundaries({ first_ts: 250, last_ts: 1500, confident: true }, 1800);
  assertEquals(b?.source, "llm_estimated");
  assertEquals(b?.first_external_join_ts, 230);
  assertEquals(b?.last_external_leave_ts, 1520);
  assertEquals(b?.internal_only, false);
});

Deno.test("normalizeLlmBoundaries rejects unsure, inverted or out-of-range answers", () => {
  assertEquals(normalizeLlmBoundaries({ first_ts: 250, last_ts: 1500, confident: false }, 1800), null);
  assertEquals(normalizeLlmBoundaries({ first_ts: 1500, last_ts: 250, confident: true }, 1800), null);
  assertEquals(normalizeLlmBoundaries({ first_ts: 2000, last_ts: 2100, confident: true }, 1800), null);
  assertEquals(normalizeLlmBoundaries({ confident: true }, 1800), null);
});
