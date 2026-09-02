/**
 * What a shared meeting's transcript looks like to somebody outside the account.
 *
 * Kept out of the handler so the rule can be tested directly: this is the only
 * thing standing between a public URL and the pre/post-call chatter that
 * `zones.ts` spends real effort identifying.
 */

export interface PublicSegment {
  speaker: string;
  text: string;
  start: number | null;
}

interface RawSegment {
  speaker?: unknown;
  text?: unknown;
  start?: unknown;
  zone?: unknown;
}

/**
 * Meeting-zone segments only, carrying nothing but who said what and when.
 *
 * Fields are whitelisted rather than filtered: `original_text` (the
 * pre-translation Devanagari a leaked segment keeps) and anything added to a
 * segment in future are dropped by construction, so widening the public payload
 * has to be a deliberate edit here.
 */
export function publicSegments(raw: unknown): PublicSegment[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawSegment[])
    .filter((seg) => {
      if (!seg || typeof seg !== "object") return false;
      const zone = typeof seg.zone === "string" ? seg.zone : "meeting";
      return zone === "meeting" && typeof seg.text === "string" && seg.text.trim().length > 0;
    })
    .map((seg) => ({
      speaker: typeof seg.speaker === "string" && seg.speaker.trim() ? seg.speaker : "Speaker",
      text: String(seg.text).trim(),
      start: typeof seg.start === "number" && Number.isFinite(seg.start) ? seg.start : null,
    }));
}
