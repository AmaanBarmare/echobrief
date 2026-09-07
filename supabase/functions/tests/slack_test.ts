/**
 * The Slack message builder, which is the part that can embarrass someone.
 *
 * A Slack channel is a room full of people. An email that renders badly is seen
 * by one person; a malformed Slack post is seen by the whole team and cannot be
 * unsent. So the builder is pure and tested against the shapes the pipeline
 * actually emits — action items have been plain strings in some meetings and
 * `{task, owner, due_date}` objects in others since the two-pass rewrite, and a
 * builder that assumes one of them posts "[object Object]" into a team channel.
 */
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildSummaryMessage } from "../_shared/slack.ts";

const APP = "https://www.echobrief.in";
const meeting = { id: "m-123", title: "Pricing review" };

function textOf(blocks: unknown[]): string {
  return blocks.map((b) => JSON.stringify(b)).join("\n");
}

Deno.test("slack: object-shaped action items render as text, never [object Object]", () => {
  const { blocks } = buildSummaryMessage(meeting, {
    summary_short: "We agreed the new pricing.",
    action_items: [
      { task: "Send the revised deck", owner: "Asha", due_date: "2026-09-12" },
      { task: "Update the pricing page", owner: "Vikram" },
    ],
  }, APP);
  const rendered = textOf(blocks);
  assertStringIncludes(rendered, "Send the revised deck — Asha, 2026-09-12");
  assertStringIncludes(rendered, "Update the pricing page — Vikram");
  assertEquals(rendered.includes("[object Object]"), false);
});

Deno.test("slack: string-shaped action items still render", () => {
  const { blocks } = buildSummaryMessage(meeting, {
    summary_short: "Short sync.",
    action_items: ["Book the venue", "Chase the invoice"],
  }, APP);
  const rendered = textOf(blocks);
  assertStringIncludes(rendered, "Book the venue");
  assertEquals(rendered.includes("[object Object]"), false);
});

Deno.test("slack: a meeting with no insights still produces a valid message", () => {
  // saveInsights can land a row with an empty summary; posting nothing at all
  // is better than posting a broken block, but the message must still be valid.
  const { text, blocks } = buildSummaryMessage(meeting, {}, APP);
  assertEquals(typeof text, "string");
  assertEquals(text.length > 0, true);          // never an empty notification
  assertEquals(blocks.length >= 2, true);        // header + context link
  assertStringIncludes(textOf(blocks), "/meetings/m-123");
});

Deno.test("slack: no text block exceeds Slack's 3000-character limit", () => {
  const { blocks } = buildSummaryMessage(meeting, {
    summary_short: "x".repeat(9000),
    action_items: Array.from({ length: 40 }, (_, i) => `item ${i} ` + "y".repeat(300)),
    decisions: Array.from({ length: 40 }, (_, i) => `decision ${i} ` + "z".repeat(300)),
  }, APP);
  for (const b of blocks as Array<Record<string, any>>) {
    if (b.text?.text) {
      assertEquals(
        b.text.text.length <= 3000,
        true,
        `block of type ${b.type} was ${b.text.text.length} chars — Slack rejects the whole message`,
      );
    }
  }
});

Deno.test("slack: the transcript and internal-zone fields are never posted", () => {
  // The guarantee that makes Slack safe: only fields the pipeline computes from
  // the meeting zone go out. coaching and facts are derived with the internal
  // zones in scope, and the transcript is the raw call.
  const { text, blocks } = buildSummaryMessage(meeting, {
    summary_short: "Public summary.",
    action_items: ["Do the thing"],
    coaching: { note: "SECRET-COACHING-DO-NOT-POST" },
    facts: { numbers: [{ quote: "SECRET-FACT-DO-NOT-POST" }] },
    transcript: "SECRET-TRANSCRIPT-DO-NOT-POST",
  }, APP);
  const rendered = textOf(blocks) + text;
  for (const secret of ["SECRET-COACHING", "SECRET-FACT", "SECRET-TRANSCRIPT"]) {
    assertEquals(rendered.includes(secret), false, `${secret} leaked into the Slack message`);
  }
});

Deno.test("slack: the notification preview is never empty", () => {
  // A message with blocks but no top-level text shows as a blank line in the
  // Slack sidebar, which looks like a broken integration.
  for (const insights of [{}, { summary_short: "" }, { summary_short: "Real summary" }]) {
    const { text } = buildSummaryMessage(meeting, insights, APP);
    assertEquals(text.trim().length > 0, true);
  }
});

Deno.test("slack: the meeting link points at this meeting", () => {
  const { blocks } = buildSummaryMessage({ id: "abc-def", title: "T" }, {}, "https://www.echobrief.in/");
  // Trailing slash on appUrl must not produce a double slash.
  assertStringIncludes(textOf(blocks), "https://www.echobrief.in/meetings/abc-def");
});
