/**
 * Unit tests for the early-access feedback sequence. Pure parts only: which
 * prompt is due, and that the copy says the right thing.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  dueFeedbackPrompt,
  PROMPT_SCHEDULE,
  renderFeedbackPrompt,
} from "../_shared/feedback-prompts.ts";

Deno.test("nothing is due before day 3", () => {
  for (const days of [0, 1, 2]) {
    assertEquals(dueFeedbackPrompt({ daysElapsed: days, sent: [] }), null, `day ${days}`);
  }
  assertEquals(dueFeedbackPrompt({ daysElapsed: 3, sent: [] }), "day_3");
});

Deno.test("each prompt becomes due on its own day", () => {
  assertEquals(dueFeedbackPrompt({ daysElapsed: 13, sent: ["day_3"] }), null);
  assertEquals(dueFeedbackPrompt({ daysElapsed: 14, sent: ["day_3"] }), "day_14");
  assertEquals(
    dueFeedbackPrompt({ daysElapsed: 25, sent: ["day_3", "day_14"] }),
    "day_25",
  );
});

Deno.test("a trial that started before this shipped gets ONE mail, the latest", () => {
  // The failure this guards: three prompts all "due" at once, sent together,
  // which is the fastest route to a spam complaint.
  assertEquals(dueFeedbackPrompt({ daysElapsed: 26, sent: [] }), "day_25");
  assertEquals(dueFeedbackPrompt({ daysElapsed: 20, sent: [] }), "day_14");
});

Deno.test("an already-sent prompt is never repeated", () => {
  assertEquals(
    dueFeedbackPrompt({ daysElapsed: 40, sent: ["day_3", "day_14", "day_25"] }),
    null,
  );
  // Sent out of order (a manual send, say) still suppresses correctly.
  assertEquals(dueFeedbackPrompt({ daysElapsed: 15, sent: ["day_14"] }), "day_3");
});

Deno.test("a negative or nonsense elapsed time sends nothing", () => {
  assertEquals(dueFeedbackPrompt({ daysElapsed: -1, sent: [] }), null);
  assertEquals(dueFeedbackPrompt({ daysElapsed: NaN, sent: [] }), null);
});

Deno.test("the schedule is ordered, so 'latest due' means what it says", () => {
  const days = PROMPT_SCHEDULE.map((s) => s.afterDays);
  assertEquals([...days].sort((a, b) => a - b), days);
});

Deno.test("day 3 asks a different question of someone who never started", () => {
  const base = { daysLeft: 25, replyTo: "hello@echobrief.in", name: "Asha Rao" };
  const stalled = renderFeedbackPrompt("day_3", { ...base, meetingsRecorded: 0 });
  const active = renderFeedbackPrompt("day_3", { ...base, meetingsRecorded: 4 });

  assert(stalled.subject !== active.subject);
  assert(stalled.html.includes("haven't recorded a meeting yet"));
  assert(active.html.includes("4 meetings"));
  // Greeting uses the first name only.
  assert(active.html.includes("Hi Asha,"));
});

Deno.test("the day-25 mail says how long is left and that data is kept", () => {
  const copy = renderFeedbackPrompt("day_25", {
    meetingsRecorded: 9,
    daysLeft: 3,
    replyTo: "hello@echobrief.in",
    name: null,
  });
  assert(copy.subject.includes("3 days"));
  assert(copy.html.includes("stay where they are"));
  assert(copy.html.includes("Hi,"));
});

Deno.test("singular and plural read correctly", () => {
  const one = renderFeedbackPrompt("day_25", {
    meetingsRecorded: 1,
    daysLeft: 1,
    replyTo: "x@y.z",
    name: null,
  });
  assert(one.subject.includes("1 day"), one.subject);
  assert(!one.subject.includes("1 days"));

  const day3 = renderFeedbackPrompt("day_3", {
    meetingsRecorded: 1,
    daysLeft: 25,
    replyTo: "x@y.z",
    name: null,
  });
  assert(day3.html.includes("1 meeting "), "expected singular 'meeting'");
});

Deno.test("every prompt renders a full branded email with a reply invitation", () => {
  for (const { kind } of PROMPT_SCHEDULE) {
    const copy = renderFeedbackPrompt(kind, {
      meetingsRecorded: 2,
      daysLeft: 10,
      replyTo: "hello@echobrief.in",
      name: "Sam",
    });
    assert(copy.subject.length > 0 && copy.subject.length < 120, kind);
    assert(copy.html.startsWith("<!DOCTYPE html>"), kind);
    assert(copy.html.includes("Just reply to this email"), kind);
    assert(copy.html.includes("Early access"), kind);
  }
});
