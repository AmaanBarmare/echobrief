import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { summaryLanguageRule } from "../_shared/insights.ts";

Deno.test("summaryLanguageRule: English adds nothing to the prompt", () => {
  assertEquals(summaryLanguageRule("en"), "");
});

Deno.test("summaryLanguageRule: undefined adds nothing (every pre-existing caller)", () => {
  assertEquals(summaryLanguageRule(undefined), "");
});

Deno.test("summaryLanguageRule: Hindi names only the prose fields", () => {
  const rule = summaryLanguageRule("hi");
  for (const field of ["summary_short", "summary_detailed", "key_points", "strategic_insights"]) {
    assertStringIncludes(rule, field);
  }
  assertStringIncludes(rule, "HINDI");
  assertStringIncludes(rule, "Devanagari");
});

Deno.test("summaryLanguageRule: Hindi never asks to translate action items or decisions", () => {
  const rule = summaryLanguageRule("hi");
  // These assemble deterministically from verbatim quoted facts. If the prompt
  // ever starts naming them, a quoted commitment stops being a quote.
  assertEquals(rule.includes("action_items"), false);
  assertEquals(rule.includes("decisions"), false);
});

Deno.test("summaryLanguageRule: Hindi pins names and numerals so entity correction still lines up", () => {
  const rule = summaryLanguageRule("hi");
  assertStringIncludes(rule, "numerals");
  assertStringIncludes(rule, "do not transliterate");
});
