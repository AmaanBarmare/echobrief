/**
 * Which calendar events actually need writing.
 *
 * `sync-google-calendar` used to upsert every event on every run. Postgres
 * writes a new tuple version per row whether or not anything changed, so an
 * idle browser tab syncing on a timer rewrote the user's entire calendar
 * repeatedly: 151,000 write tuples against a 507-row table, the second largest
 * write source in the database on an instance whose Disk IO Budget is the
 * binding free-tier constraint.
 *
 * Google stamps every event with `updated`, and we already store the raw event,
 * so the row we hold knows its own version. Anything whose stamp matches what
 * is already stored is skipped.
 *
 * Pure and synchronous — unit-tested in supabase/functions/tests/calendar_diff_test.ts.
 */
export interface StoredEventVersion {
  event_id: string;
  /** Google's `updated` stamp for the stored copy; PostgREST returns it flat. */
  updated?: string | null;
}

/**
 * Returns the subset of `events` whose Google `updated` stamp differs from the
 * stored copy. An event we have never seen, or one stored without a stamp, is
 * always considered changed — the safe direction is to write.
 */
export function pickChangedEvents<T extends { id?: string; updated?: string }>(
  stored: StoredEventVersion[] | null | undefined,
  events: T[] | null | undefined,
): T[] {
  if (!Array.isArray(events) || events.length === 0) return [];

  const storedVersion = new Map<string, string>();
  for (const row of stored ?? []) {
    const id = row?.event_id;
    const updated = row?.updated;
    // A row with no stamp stays out of the map, so it reads as "never seen"
    // and gets rewritten once — after which it carries a stamp and settles.
    if (typeof id === "string" && id && typeof updated === "string" && updated) {
      storedVersion.set(id, updated);
    }
  }

  return events.filter((event) => {
    const id = event?.id;
    if (typeof id !== "string" || !id) return true; // cannot match it; write it
    const incoming = event?.updated;
    if (typeof incoming !== "string" || !incoming) return true; // no stamp; write it
    return storedVersion.get(id) !== incoming;
  });
}
