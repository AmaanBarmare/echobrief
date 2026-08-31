import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hasCalendarWriteScope } from "../_shared/google-token.ts";

Deno.test("hasCalendarWriteScope recognises write grants, read-only grants and unknown", () => {
  assertEquals(hasCalendarWriteScope("https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events.readonly"), false);
  assertEquals(hasCalendarWriteScope("https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events"), true);
  assertEquals(hasCalendarWriteScope("https://www.googleapis.com/auth/calendar"), true);
  assertEquals(hasCalendarWriteScope(null), null);
  assertEquals(hasCalendarWriteScope(""), null);
});

Deno.test("hasCalendarWriteScope accepts the narrowed events.owned grant", () => {
  assertEquals(
    hasCalendarWriteScope(
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.events.owned",
    ),
    true,
  );
  assertEquals(
    hasCalendarWriteScope(
      "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.readonly",
    ),
    false,
  );
});
