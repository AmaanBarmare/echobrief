/**
 * Unit harness: relative date resolution (pure logic, no I/O).
 * Run: deno test -A supabase/functions/tests/
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { formatResolvedDate, resolveRelativeDate } from "../_shared/dates.ts";

// The fixture meeting: Friday 2026-08-28 09:30 IST (04:00 UTC).
const MEETING = "2026-08-28T04:00:00+00:00";

Deno.test("'Tuesday' said on a Friday resolves to the next Tuesday", () => {
  assertEquals(resolveRelativeDate("Tuesday", MEETING), { date: "2026-09-01" });
  assertEquals(resolveRelativeDate("next tuesday", MEETING), { date: "2026-09-01" });
  assertEquals(resolveRelativeDate("by Tuesday", MEETING), { date: "2026-09-01" });
});

Deno.test("same weekday means NEXT week, never today", () => {
  assertEquals(resolveRelativeDate("Friday", MEETING), { date: "2026-09-04" });
});

Deno.test("IST day boundary: late-evening UTC is already tomorrow in IST", () => {
  // 2026-08-28 20:00 UTC = 2026-08-29 01:30 IST (a Saturday).
  const lateMeeting = "2026-08-28T20:00:00+00:00";
  assertEquals(resolveRelativeDate("today", lateMeeting), { date: "2026-08-29" });
  assertEquals(resolveRelativeDate("Sunday", lateMeeting), { date: "2026-08-30" });
});

Deno.test("today / tomorrow / in N days", () => {
  assertEquals(resolveRelativeDate("today", MEETING), { date: "2026-08-28" });
  assertEquals(resolveRelativeDate("EOD", MEETING), { date: "2026-08-28" });
  assertEquals(resolveRelativeDate("tomorrow", MEETING), { date: "2026-08-29" });
  assertEquals(resolveRelativeDate("in 3 days", MEETING), { date: "2026-08-31" });
  assertEquals(resolveRelativeDate("in a week", MEETING), { date: "2026-09-04" });
});

Deno.test("'next week' resolves to a Monday–Sunday range", () => {
  assertEquals(resolveRelativeDate("next week", MEETING), {
    range: { start: "2026-08-31", end: "2026-09-06" },
  });
});

Deno.test("'end of week' is the coming Friday", () => {
  // Said on a Friday, "end of week" points at the NEXT Friday.
  assertEquals(resolveRelativeDate("end of week", MEETING), { date: "2026-09-04" });
  const wednesday = "2026-08-26T04:00:00+00:00";
  assertEquals(resolveRelativeDate("end of week", wednesday), { date: "2026-08-28" });
});

Deno.test("explicit dates parse, assume the future, reject impossible days", () => {
  assertEquals(resolveRelativeDate("Sep 3", MEETING), { date: "2026-09-03" });
  assertEquals(resolveRelativeDate("3rd of September", MEETING), { date: "2026-09-03" });
  assertEquals(resolveRelativeDate("september 3rd", MEETING), { date: "2026-09-03" });
  // Already passed this year → next year.
  assertEquals(resolveRelativeDate("Jan 5", MEETING), { date: "2027-01-05" });
  assertEquals(resolveRelativeDate("Feb 30", MEETING), null);
});

Deno.test("unresolvable phrases return null, never a guess", () => {
  assertEquals(resolveRelativeDate("soon", MEETING), null);
  assertEquals(resolveRelativeDate("when the proposal is ready", MEETING), null);
  assertEquals(resolveRelativeDate("", MEETING), null);
  assertEquals(resolveRelativeDate(null, MEETING), null);
  assertEquals(resolveRelativeDate("Tuesday", null), null);
  assertEquals(resolveRelativeDate("Tuesday", "not-a-date"), null);
});

Deno.test("formatResolvedDate renders the follow-up form", () => {
  assertEquals(formatResolvedDate("2026-09-01"), "Tue, Sep 1, 2026");
});
