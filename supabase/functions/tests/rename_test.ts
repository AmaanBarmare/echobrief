import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applySpeakerOverrides, renameInDecisions, renameSpeakerDeep } from "../_shared/rename.ts";

Deno.test("renameSpeakerDeep renames speaker-valued keys everywhere, case-insensitively", () => {
  const out = renameSpeakerDeep(
    {
      speakers: [{ speaker: "SPEAKER_01", text: "hi SPEAKER_01" }],
      action_items: [{ task: "x", owner: "speaker_01" }],
      meeting_metrics: { dominant_speaker: "SPEAKER_01", speaker_participation: [{ speaker: "SPEAKER_01" }] },
      facts: { commitments: [{ who: "SPEAKER_01", what: "y" }] },
      coaching: { rep: "SPEAKER_01", external_participant: "Mathew Ryan" },
    },
    "SPEAKER_01",
    "Khush Mutha",
  );
  assertEquals(out.speakers[0].speaker, "Khush Mutha");
  // Free text is never rewritten.
  assertEquals(out.speakers[0].text, "hi SPEAKER_01");
  assertEquals(out.action_items[0].owner, "Khush Mutha");
  assertEquals(out.meeting_metrics.dominant_speaker, "Khush Mutha");
  assertEquals(out.meeting_metrics.speaker_participation[0].speaker, "Khush Mutha");
  assertEquals(out.facts.commitments[0].who, "Khush Mutha");
  assertEquals(out.coaching.rep, "Khush Mutha");
  assertEquals(out.coaching.external_participant, "Mathew Ryan");
});

Deno.test("renameInDecisions rewrites the (Owner) tag only", () => {
  assertEquals(
    renameInDecisions(["ship it (SPEAKER_01) — context", "other (Vineet)"], "SPEAKER_01", "Khush"),
    ["ship it (Khush) — context", "other (Vineet)"],
  );
});

Deno.test("applySpeakerOverrides maps saved re-labels onto raw segments", () => {
  const segs = applySpeakerOverrides(
    [{ speaker: "SPEAKER_00", text: "a" }, { speaker: "Mathew Ryan", text: "b" }],
    { speaker_00: "Khush Mutha" },
  );
  assertEquals(segs.map((s) => s.speaker), ["Khush Mutha", "Mathew Ryan"]);
  assertEquals(applySpeakerOverrides(segs, null), segs);
});
