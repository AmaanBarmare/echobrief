import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { harnessEmailsEnabled, isHarnessMeeting } from "../_shared/insights.ts";

Deno.test("isHarnessMeeting: only the [harness] prefix counts", () => {
  assertEquals(isHarnessMeeting("[harness] happy_path_sarvam abc123"), true);
  assertEquals(isHarnessMeeting("Weekly sync"), false);
  assertEquals(isHarnessMeeting("re: [harness] happy_path"), false);
  assertEquals(isHarnessMeeting(null), false);
  assertEquals(isHarnessMeeting(undefined), false);
});

Deno.test("harnessEmailsEnabled: opt-in, exact 'true' only", () => {
  const prev = Deno.env.get("HARNESS_EMAILS");
  try {
    Deno.env.delete("HARNESS_EMAILS");
    assertEquals(harnessEmailsEnabled(), false);
    Deno.env.set("HARNESS_EMAILS", "1");
    assertEquals(harnessEmailsEnabled(), false);
    Deno.env.set("HARNESS_EMAILS", "true");
    assertEquals(harnessEmailsEnabled(), true);
  } finally {
    if (prev === undefined) Deno.env.delete("HARNESS_EMAILS");
    else Deno.env.set("HARNESS_EMAILS", prev);
  }
});
