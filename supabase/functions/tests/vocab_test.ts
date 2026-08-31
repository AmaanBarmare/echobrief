/**
 * Unit harness: vocabulary building + entity correction (pure logic, no I/O).
 * Run: deno test -A supabase/functions/tests/
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildVocabulary, correctEntities } from "../_shared/vocab.ts";

const ATTENDEES = [
  { email: "khush@oltaflock.ai", displayName: "Khush Mutha" },
  { email: "mathew@ryanandcotravel.com.au" },
];

Deno.test("buildVocabulary derives names and company terms from the calendar", () => {
  const vocab = buildVocabulary(ATTENDEES, ["Tramada", "IATA"]);
  assert(vocab.includes("Khush Mutha"));
  assert(vocab.includes("Mutha"));
  assert(vocab.includes("Khush"));
  assert(vocab.includes("Mathew"));
  assert(vocab.includes("Oltaflock"));
  assert(vocab.includes("Tramada"));
  assert(vocab.includes("IATA"));
});

Deno.test("buildVocabulary skips generic mail domains and short junk", () => {
  const vocab = buildVocabulary([{ email: "bob@gmail.com" }]);
  assertEquals(vocab.includes("Gmail"), false);
});

Deno.test("correctEntities fixes the observed AltaFlock → Oltaflock miss", () => {
  const { text, corrections } = correctEntities(
    "the collaboration between AltaFlock AI and the travel business",
    buildVocabulary(ATTENDEES),
  );
  assertEquals(text, "the collaboration between Oltaflock AI and the travel business");
  assertEquals(corrections, [{ from: "AltaFlock", to: "Oltaflock" }]);
});

Deno.test("correctEntities corrects multi-word names", () => {
  const { text, corrections } = correctEntities(
    "I spoke with Kush Muta yesterday",
    ["Khush Mutha"],
  );
  assertEquals(text, "I spoke with Khush Mutha yesterday");
  assertEquals(corrections.length, 1);
});

Deno.test("correctEntities never rewrites unrelated words", () => {
  const input = "we should block the flock of updates and travel plans";
  const { text, corrections } = correctEntities(input, buildVocabulary(ATTENDEES));
  assertEquals(text, input);
  assertEquals(corrections, []);
});

Deno.test("correctEntities leaves exact matches alone", () => {
  const input = "Oltaflock AI builds meeting intelligence";
  const { text, corrections } = correctEntities(input, ["Oltaflock"]);
  assertEquals(text, input);
  assertEquals(corrections, []);
});

Deno.test("correctEntities skips ambiguous ties instead of guessing", () => {
  // "Tramade" is distance 1 from both terms — changing it would be a guess.
  const { text, corrections } = correctEntities("we use Tramade daily", [
    "Tramada",
    "Tramide",
  ]);
  assertEquals(text, "we use Tramade daily");
  assertEquals(corrections, []);
});

Deno.test("correctEntities handles empty input and empty vocab", () => {
  assertEquals(correctEntities("", ["Oltaflock"]).text, "");
  assertEquals(correctEntities("hello", []).corrections, []);
});
