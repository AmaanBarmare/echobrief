/**
 * What a public share link is allowed to show of a transcript.
 *
 * The zone filter here is the whole privacy guarantee of a shared transcript:
 * the summary a stranger reads is written from the meeting zone only, and the
 * transcript beside it has to match. A regression would publish pre-call
 * chatter to a URL anyone can forward, silently.
 */
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { publicSegments } from "../_shared/share-view.ts";

Deno.test("publicSegments keeps only meeting-zone speech", () => {
  const out = publicSegments([
    { speaker: "Asha", text: "waiting for them to join", zone: "pre", start: 1 },
    { speaker: "Asha", text: "Let us start with pricing.", zone: "meeting", start: 60 },
    { speaker: "Ravi", text: "did you see the match", zone: "post", start: 3000 },
  ]);
  assertEquals(out, [{ speaker: "Asha", text: "Let us start with pricing.", start: 60 }]);
});

Deno.test("publicSegments treats an untagged segment as meeting", () => {
  // Pre-2026-08-31 meetings have no zone tags at all; dropping them would blank
  // the transcript rather than protect anything.
  const out = publicSegments([{ speaker: "Asha", text: "Hello.", start: 0 }]);
  assertEquals(out.length, 1);
  assertEquals(out[0].start, 0);
});

Deno.test("publicSegments drops every field it was not asked for", () => {
  const out = publicSegments([
    {
      speaker: "Asha",
      text: "Discount is twelve percent.",
      zone: "meeting",
      start: 12,
      // Neither of these may reach a public page.
      original_text: "डिस्काउंट बारह प्रतिशत है।",
      email: "asha@example.com",
    },
  ]);
  assertEquals(Object.keys(out[0]).sort(), ["speaker", "start", "text"]);
});

Deno.test("publicSegments survives junk and empty speech", () => {
  assertEquals(publicSegments(null), []);
  assertEquals(publicSegments("not an array"), []);
  assertEquals(publicSegments([null, 7, { text: "   ", zone: "meeting" }]), []);
});

Deno.test("publicSegments names an unnamed speaker rather than leaking undefined", () => {
  const out = publicSegments([{ text: "Right.", zone: "meeting", start: "9" }]);
  assertEquals(out, [{ speaker: "Speaker", text: "Right.", start: null }]);
});
