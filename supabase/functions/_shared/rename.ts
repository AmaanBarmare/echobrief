/**
 * Manual speaker re-label, applied retroactively to everything derived from
 * the transcript. Diarization mapping is right most of the time; when it is
 * not, the fix has to reach the transcript, metrics, facts, coaching, action
 * item owners and the Recall timeline — otherwise the meeting page disagrees
 * with itself. Pure and unit-tested (tests/rename_test.ts).
 */

/** Object keys whose string value is a speaker/person name. */
const SPEAKER_KEYS = new Set([
  "speaker",
  "owner",
  "who",
  "rep",
  "external_participant",
  "longest_monologue_speaker",
  "dominant_speaker",
  "assignee",
  "name",
]);

function sameName(a: unknown, b: string): boolean {
  return typeof a === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Deep-walk any JSON value, renaming speaker-valued fields. Returns a copy. */
export function renameSpeakerDeep<T>(value: T, from: string, to: string): T {
  if (Array.isArray(value)) {
    return value.map((v) => renameSpeakerDeep(v, from, to)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SPEAKER_KEYS.has(k) && sameName(v, from)) out[k] = to;
      else out[k] = renameSpeakerDeep(v, from, to);
    }
    return out as T;
  }
  return value;
}

/** Decisions are stored flat as "decision (Owner) — context"; rename the owner tag. */
export function renameInDecisions(decisions: unknown, from: string, to: string): unknown {
  if (!Array.isArray(decisions)) return decisions;
  const tag = `(${from})`;
  return decisions.map((d) =>
    typeof d === "string" && d.includes(tag) ? d.split(tag).join(`(${to})`) : d
  );
}

/** Apply a saved {from: to} override map to a list of segments. */
export function applySpeakerOverrides<T extends { speaker: string }>(
  segments: T[],
  overrides: Record<string, string> | null | undefined,
): T[] {
  if (!overrides || Object.keys(overrides).length === 0) return segments;
  const lookup = new Map(Object.entries(overrides).map(([f, t]) => [f.trim().toLowerCase(), t]));
  return segments.map((s) => {
    const to = lookup.get(String(s.speaker ?? "").trim().toLowerCase());
    return to ? { ...s, speaker: to } : s;
  });
}
