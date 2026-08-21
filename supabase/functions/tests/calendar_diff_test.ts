import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pickChangedEvents } from "../_shared/calendar-diff.ts";

const ev = (id: string, updated?: string) => ({ id, updated });

Deno.test("an unchanged event is not rewritten", () => {
  const stored = [{ event_id: "a", updated: "2026-05-14T03:46:44.514Z" }];
  assertEquals(pickChangedEvents(stored, [ev("a", "2026-05-14T03:46:44.514Z")]), []);
});

Deno.test("a genuinely edited event is rewritten", () => {
  const stored = [{ event_id: "a", updated: "2026-05-14T03:46:44.514Z" }];
  const changed = pickChangedEvents(stored, [ev("a", "2026-06-01T00:00:00.000Z")]);
  assertEquals(changed.length, 1);
  assertEquals(changed[0].id, "a");
});

Deno.test("an event we have never stored is written", () => {
  assertEquals(pickChangedEvents([], [ev("new", "2026-05-14T03:46:44.514Z")]).length, 1);
  assertEquals(pickChangedEvents(null, [ev("new", "2026-05-14T03:46:44.514Z")]).length, 1);
});

Deno.test("a stored row with no stamp is rewritten once", () => {
  const stored = [{ event_id: "a", updated: null }];
  assertEquals(pickChangedEvents(stored, [ev("a", "2026-05-14T03:46:44.514Z")]).length, 1);
});

Deno.test("an incoming event with no stamp is always written", () => {
  const stored = [{ event_id: "a", updated: "2026-05-14T03:46:44.514Z" }];
  assertEquals(pickChangedEvents(stored, [ev("a", undefined)]).length, 1);
});

Deno.test("only the changed events of a mixed batch are returned", () => {
  const stored = [
    { event_id: "a", updated: "1" },
    { event_id: "b", updated: "1" },
    { event_id: "c", updated: "1" },
  ];
  const changed = pickChangedEvents(stored, [ev("a", "1"), ev("b", "2"), ev("c", "1"), ev("d", "1")]);
  assertEquals(changed.map((e) => e.id), ["b", "d"]);
});

Deno.test("an empty incoming batch writes nothing", () => {
  assertEquals(pickChangedEvents([{ event_id: "a", updated: "1" }], []), []);
  assertEquals(pickChangedEvents([], null), []);
});

Deno.test("a steady calendar produces no writes at all", () => {
  // The case that matters: 507 unchanged events, repeated every sync.
  const stored = Array.from({ length: 507 }, (_, i) => ({ event_id: `e${i}`, updated: "s" }));
  const incoming = Array.from({ length: 507 }, (_, i) => ev(`e${i}`, "s"));
  assertEquals(pickChangedEvents(stored, incoming).length, 0);
});
