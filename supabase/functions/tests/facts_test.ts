/**
 * Unit harness: facts normalization + date resolution wiring (pure logic).
 * Run: deno test -A supabase/functions/tests/
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeFacts } from "../_shared/facts.ts";
import { resolveActionItemDates } from "../_shared/insights.ts";

Deno.test("normalizeFacts whitelists and drops empty rows", () => {
  const facts = normalizeFacts({
    meeting_type: "sales_discovery",
    numbers: [
      { metric: "annual TTV", value: "$5M", speaker: "Mathew Ryan", quote: "roughly $5 million TTV a year", ts: 812 },
      { metric: "", value: "$1" }, // dropped: no metric
      "garbage",
    ],
    commitments: [
      { who: "Khush Mutha", what: "send personalized proposal", due: "Tuesday", quote: "I'll send it Tuesday", ts: 1620 },
      { who: null, what: "" }, // dropped
    ],
    objections: [
      { statement: "does not want cold online leads", quote: "I don't need more customers", ts: 1104, addressed: "yes-ish" },
    ],
    engagement_score: 80, // volunteered field must not survive
  } as Record<string, unknown>);

  assertEquals(facts.meeting_type, "sales_discovery");
  assertEquals(facts.numbers.length, 1);
  assertEquals(facts.numbers[0].value, "$5M");
  assertEquals(facts.commitments.length, 1);
  assertEquals(facts.commitments[0].due, "Tuesday");
  // Non-boolean "addressed" coerces to false, never truthy garbage.
  assertEquals(facts.objections[0].addressed, false);
  assertEquals("engagement_score" in facts, false);
});

Deno.test("normalizeFacts defaults unknown meeting types to other", () => {
  assertEquals(normalizeFacts({ meeting_type: "party" }).meeting_type, "other");
  assertEquals(normalizeFacts({}).topics, []);
});

Deno.test("resolveActionItemDates resolves 'Tuesday' against the meeting date", () => {
  const insights: Record<string, unknown> = {
    action_items: [
      { task: "send proposal", due_date: "Tuesday" },
      { task: "no due date" },
      { task: "vague", due_date: "when ready" },
      { task: "ranged", due_date: "next week" },
    ],
  };
  resolveActionItemDates(insights, "2026-08-28T04:00:00+00:00");
  const items = insights.action_items as Record<string, unknown>[];
  assertEquals(items[0].due_date_resolved, "2026-09-01");
  assertEquals(items[0].due_date, "Tuesday"); // raw kept
  assertEquals("due_date_resolved" in items[1], false);
  assertEquals("due_date_resolved" in items[2], false);
  assertEquals(items[3].due_date_range, { start: "2026-08-31", end: "2026-09-06" });
});
