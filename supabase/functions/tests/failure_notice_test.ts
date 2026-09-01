/**
 * The user-facing failure email.
 *
 * `explainFailure` is the part worth pinning: it turns internal error text
 * ("KeyError: 'timestamps'") into something a customer can act on, and the
 * failure mode to guard against is a stack trace reaching an inbox.
 */
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { explainFailure, FAILURE_NOTICE_KIND } from "../_shared/failure-notice.ts";
import { SUMMARY_EMAIL_KIND } from "../_shared/email-delivery.ts";

Deno.test("explainFailure: no-speech reads as a retry, not a fault", () => {
  const e = explainFailure("Transcript rejected: no clear speech was detected");
  assertStringIncludes(e.summary, "clear speech");
  assertStringIncludes(e.advice.toLowerCase(), "again");
});

Deno.test("explainFailure: a download failure says it was not the user's fault", () => {
  const e = explainFailure("Failed to download audio from Recall (HTTP 404)");
  assertStringIncludes(e.summary, "could not retrieve the audio");
  assertStringIncludes(e.advice, "Nothing on your side");
});

Deno.test("explainFailure: both transcription providers failing is explained", () => {
  const e = explainFailure(
    "Transcription failed: both Sarvam and Whisper could not process this recording.",
  );
  assertStringIncludes(e.summary, "transcription did not complete");
});

Deno.test("explainFailure: a stuck/timeout failure suggests splitting the call", () => {
  const e = explainFailure("stuck:processing:no_sarvam_job");
  assertStringIncludes(e.advice, "splitting");
});

Deno.test("explainFailure: unknown errors get a safe default, never the raw text", () => {
  const raw = "KeyError: 'timestamps' at line 402 in sarvam_pipeline.py";
  const e = explainFailure(raw);
  assertStringIncludes(e.summary, "Something went wrong");
  // The whole point: internal detail must not reach the customer.
  assert(!e.summary.includes("KeyError"), "summary leaked the raw error");
  assert(!e.advice.includes("KeyError"), "advice leaked the raw error");
  assert(!e.advice.includes(".py"), "advice leaked a filename");
});

Deno.test("explainFailure: null and empty are handled like unknown", () => {
  for (const input of [null, undefined, ""]) {
    const e = explainFailure(input);
    assertStringIncludes(e.summary, "Something went wrong");
    assert(e.advice.length > 0);
  }
});

Deno.test("explainFailure always returns non-empty, punctuated guidance", () => {
  const cases = [null, "no clear speech", "download error", "whisper failed", "timeout", "???"];
  for (const c of cases) {
    const e = explainFailure(c);
    assert(e.summary.trim().length > 10, `summary too short for ${c}`);
    assert(e.advice.trim().length > 10, `advice too short for ${c}`);
    assert(e.summary.trim().endsWith("."), `summary unpunctuated for ${c}`);
  }
});

Deno.test("the delivery kind is distinct from the summary email's", () => {
  // Both claim rows in email_deliveries against the same meeting; if these
  // collided, sending a failure notice would suppress the summary or vice versa.
  // Compared as strings because the literal types alone make it a static error.
  assertEquals(FAILURE_NOTICE_KIND, "failure_notice");
  assert(String(FAILURE_NOTICE_KIND) !== String(SUMMARY_EMAIL_KIND));
});
