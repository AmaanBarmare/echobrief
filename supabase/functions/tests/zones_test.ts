/**
 * Unit harness: meeting boundary detection (pure logic, no I/O).
 * Run: deno test -A supabase/functions/tests/
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  annotateZones,
  computeBoundaries,
  externalAttendees,
  meetingZone,
  ownerDomain,
  speakerMatchesAttendee,
  zoneOf,
  externalSpeakerNames,
  guardBoundaries,
} from "../_shared/zones.ts";

const ATTENDEES = [
  { email: "vineet@oltaflock.ai", organizer: true },
  { email: "khush@oltaflock.ai", self: true },
  { email: "mathew@ryanandcotravel.com.au" },
];

Deno.test("ownerDomain prefers the self attendee", () => {
  assertEquals(ownerDomain(ATTENDEES), "oltaflock.ai");
});

Deno.test("ownerDomain falls back to organizer, then majority", () => {
  assertEquals(
    ownerDomain([{ email: "a@x.com", organizer: true }, { email: "b@y.com" }]),
    "x.com",
  );
  assertEquals(
    ownerDomain([{ email: "a@x.com" }, { email: "b@x.com" }, { email: "c@y.com" }]),
    "x.com",
  );
  assertEquals(ownerDomain([]), null);
  assertEquals(ownerDomain(undefined), null);
});

Deno.test("externalAttendees picks the other-domain guests only", () => {
  const ext = externalAttendees(ATTENDEES, "oltaflock.ai");
  assertEquals(ext.length, 1);
  assertEquals(ext[0].email, "mathew@ryanandcotravel.com.au");
  // Without a known internal domain nothing is safely "external".
  assertEquals(externalAttendees(ATTENDEES, null), []);
});

Deno.test("speakerMatchesAttendee matches name tokens against the email local part", () => {
  const mathew = { email: "mathew@ryanandcotravel.com.au" };
  assertEquals(speakerMatchesAttendee("Mathew Ryan", mathew), true);
  assertEquals(speakerMatchesAttendee("Vineet Patel", mathew), false);
  assertEquals(
    speakerMatchesAttendee("Mathew Ryan", { email: "mathew.ryan@x.com" }),
    true,
  );
  assertEquals(
    speakerMatchesAttendee("Mat", { email: "mathewryan@x.com" }),
    false, // tokens under 3 chars are dropped; "Mat" alone is too weak anyway
  );
  assertEquals(
    speakerMatchesAttendee("Ryan", { displayName: "Mathew Ryan" }),
    true,
  );
});

const TIMELINE = [
  { speaker: "Vineet Patel", start: 0, end: 60 },
  { speaker: "Khush Mutha", start: 60, end: 160 },
  { speaker: "Mathew Ryan", start: 259, end: 266 },
  { speaker: "Khush Mutha", start: 289, end: 700 },
  { speaker: "Mathew Ryan", start: 700, end: 1500 },
  { speaker: "Vineet Patel", start: 1600, end: 1800 }, // post-call debrief
];

Deno.test("computeBoundaries pads around the external speaker's speech", () => {
  const b = computeBoundaries(ATTENDEES, TIMELINE);
  assertEquals(b.internal_only, false);
  assertEquals(b.source, "speech_estimated");
  assertEquals(b.first_external_join_ts, 259 - 45);
  assertEquals(b.last_external_leave_ts, 1500 + 20);
});

Deno.test("computeBoundaries: internal-only meeting trims nothing", () => {
  const internal = [
    { email: "vineet@oltaflock.ai", organizer: true },
    { email: "khush@oltaflock.ai", self: true },
  ];
  const b = computeBoundaries(internal, TIMELINE);
  assertEquals(b.internal_only, true);
  assertEquals(b.first_external_join_ts, null);
  assertEquals(zoneOf(0, b), "meeting");
});

Deno.test("computeBoundaries: external invited but never spoke → no trim", () => {
  const b = computeBoundaries(ATTENDEES, [
    { speaker: "Khush Mutha", start: 0, end: 500 },
  ]);
  assertEquals(b.source, "none");
  assertEquals(b.internal_only, false);
  assertEquals(zoneOf(0, b), "meeting");
});

Deno.test("computeBoundaries clamps the join pad at zero", () => {
  const b = computeBoundaries(ATTENDEES, [
    { speaker: "Mathew Ryan", start: 10, end: 900 },
  ]);
  assertEquals(b.first_external_join_ts, 0);
});

Deno.test("annotateZones + meetingZone split and filter the fixture shape", () => {
  const b = computeBoundaries(ATTENDEES, TIMELINE);
  const segments = annotateZones(
    [
      { speaker: "Vineet Patel", text: "pre chatter", start: 5, end: 20 },
      { speaker: "Khush Mutha", text: "greeting", start: 260, end: 280 },
      { speaker: "Mathew Ryan", text: "the call", start: 800, end: 900 },
      { speaker: "Vineet Patel", text: "debrief", start: 1600, end: 1700 },
    ],
    b,
  );
  assertEquals(segments.map((s) => s.zone), ["pre", "meeting", "meeting", "post"]);
  const inMeeting = meetingZone(segments);
  assertEquals(inMeeting.length, 2);
  // Untagged segments are treated as meeting (backwards compatibility).
  assertEquals(meetingZone([{ text: "old row" } as never]).length, 1);
});

Deno.test("externalSpeakerNames matches guests by elimination when the email has no name tokens", () => {
  const attendees = [
    { email: "vineet@oltaflock.ai" },
    { email: "khush@oltaflock.ai", self: true },
    { email: "gm@kananwas.com" }, // no usable name tokens
  ];
  const names = externalSpeakerNames(attendees, ["Devendra Singh", "Khush Mutha", "Vineet Patel"]);
  assertEquals([...names], ["Devendra Singh"]);
  // Direct matches still win when they exist.
  assertEquals([...externalSpeakerNames(ATTENDEES, ["Mathew Ryan", "Khush Mutha"])], ["Mathew Ryan"]);
  // Two unmatched speakers but one invited guest → too ambiguous to eliminate.
  assertEquals(externalSpeakerNames(attendees, ["A B", "C D", "Khush Mutha"]).size, 0);
  // Phantom diarization labels are never promoted to guests.
  assertEquals(externalSpeakerNames(attendees, ["SPEAKER_01", "Khush Mutha"]).size, 0);
});

Deno.test("computeBoundaries uses elimination matching (the Kananwas case)", () => {
  const attendees = [{ email: "khush@oltaflock.ai", self: true }, { email: "gm@kananwas.com" }];
  const b = computeBoundaries(attendees, [
    { speaker: "Khush Mutha", start: 0, end: 30 },
    { speaker: "Devendra Singh", start: 100, end: 2000 },
  ]);
  assertEquals(b.source, "speech_estimated");
  assertEquals(b.first_external_join_ts, 55);
});

Deno.test("guardBoundaries rejects a window that keeps under half the speech", () => {
  const segments = [
    { speaker: "A", text: "x", start: 0, end: 50 },
    { speaker: "B", text: "y", start: 60, end: 2100 },
  ];
  const bad = { first_external_join_ts: 0, last_external_leave_ts: 55, source: "llm_estimated" as const, internal_only: false };
  const kept = guardBoundaries(bad, segments);
  assertEquals(kept.source, "none");
  assertEquals(zoneOf(1000, kept), "meeting");
  // A sane window passes through untouched.
  const good = { first_external_join_ts: 40, last_external_leave_ts: 2120, source: "speech_estimated" as const, internal_only: false };
  assertEquals(guardBoundaries(good, segments), good);
  // Internal-only / untrimmed boundaries are left alone.
  const none = { first_external_join_ts: null, last_external_leave_ts: null, source: "none" as const, internal_only: true };
  assertEquals(guardBoundaries(none, segments), none);
});
