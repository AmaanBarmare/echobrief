/**
 * Unit harness: IST formatting. Runs under whatever TZ the runner has, which is
 * the point — the output must not depend on it.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { formatISTDate, formatISTTime, APP_TIMEZONE } from "../_shared/time.ts";

Deno.test("the app timezone is India Standard Time", () => {
  assertEquals(APP_TIMEZONE, "Asia/Kolkata");
});

Deno.test("a UTC instant is rendered as IST wall-clock, not UTC", () => {
  // The real 7261568f start: 13:15 UTC is 18:45 IST.
  assertEquals(formatISTTime("2026-08-20T13:15:00Z"), "6:45 PM");
  assertEquals(formatISTDate("2026-08-20T13:15:00Z"), "Thursday, August 20, 2026");
});

Deno.test("an evening UTC instant rolls into the next IST day", () => {
  // 20:00 UTC on the 20th is 01:30 IST on the 21st — the date must roll too.
  assertEquals(formatISTDate("2026-08-20T20:00:00Z"), "Friday, August 21, 2026");
  assertEquals(formatISTTime("2026-08-20T20:00:00Z"), "1:30 AM");
});

Deno.test("midnight IST is rendered as 12:00 AM, not 00:00", () => {
  assertEquals(formatISTTime("2026-08-20T18:30:00Z"), "12:00 AM");
});

Deno.test("an offset-bearing timestamp is respected, not re-interpreted", () => {
  assertEquals(formatISTTime("2026-08-20T13:15:00+00:00"), "6:45 PM");
  assertEquals(formatISTTime("2026-08-20T18:45:00+05:30"), "6:45 PM");
});

Deno.test("an unparseable value yields an empty string, never Invalid Date", () => {
  assertEquals(formatISTDate("not a date"), "");
  assertEquals(formatISTTime(""), "");
});

import { buildSubject } from "../send-meeting-email/template.ts";

Deno.test("subject leads with the outcome, not our own name", () => {
  assertEquals(
    buildSubject("Pricing review", { action_items: [1, 2, 3], decisions: ["x"] }),
    "Pricing review — 3 action items, 1 decision",
  );
});

Deno.test("subject counts are singular when there is one", () => {
  assertEquals(buildSubject("Standup", { action_items: [1] }), "Standup — 1 action item");
});

Deno.test("subject falls back when nothing was decided or assigned", () => {
  assertEquals(buildSubject("TEST", { action_items: [], decisions: [] }), "TEST — meeting summary");
  assertEquals(buildSubject("TEST", null), "TEST — meeting summary");
});

Deno.test("a long meeting title is truncated so the counts survive the inbox", () => {
  const subject = buildSubject("Q3 revenue planning with the extended leadership team", { decisions: ["x"] });
  assertEquals(subject.endsWith("— 1 decision"), true);
  assertEquals(subject.length <= 62, true);
});

Deno.test("a missing title does not produce an empty subject", () => {
  assertEquals(buildSubject("", {}), "Meeting — meeting summary");
});
