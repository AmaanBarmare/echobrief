/**
 * Per-segment language detection and the meeting-level language mix.
 *
 * Sarvam reports ONE language_code per job, so a 90%-English call with Hindi
 * pre-call chatter gets labeled "hindi" wholesale. We cannot re-run ASR, but
 * we can look at the text it produced: Sarvam leaks untranslated Devanagari
 * for Hindi speech, so script ratio per segment is an honest signal. The
 * meeting-level label becomes a duration-weighted mix ({"en": 0.88,
 * "hi": 0.12}) instead of a single wrong tag.
 *
 * Pure and synchronous. Unit-tested in tests/language_test.ts.
 */
import type { SpeakerSegment } from "./insights.ts";

export type SegmentLanguage = "en" | "hi" | "mixed" | "unknown";

const DEVANAGARI = /[ऀ-ॿ]/g;
const LATIN = /[A-Za-z]/g;

export function segmentLanguage(text: unknown): SegmentLanguage {
  const s = String(text ?? "");
  const deva = (s.match(DEVANAGARI) || []).length;
  const latin = (s.match(LATIN) || []).length;
  const total = deva + latin;
  if (total === 0) return "unknown";
  const devaRatio = deva / total;
  if (devaRatio >= 0.8) return "hi";
  if (devaRatio <= 0.2) return "en";
  return "mixed";
}

/**
 * Duration-weighted language shares, rounded to 2 dp, shares < 0.02 dropped
 * as noise. "mixed" segments split evenly between en and hi; "unknown"
 * segments are ignored. Empty when nothing is classifiable.
 */
export function languageMix(segments: SpeakerSegment[]): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const seg of Array.isArray(segments) ? segments : []) {
    const lang = segmentLanguage(seg.text);
    if (lang === "unknown") continue;
    const start = Number(seg.start ?? 0);
    const end = Number(seg.end ?? 0);
    const seconds = Number.isFinite(end - start) && end - start > 0
      ? end - start
      // No usable timing — weight by words so text-only segments still count.
      : String(seg.text ?? "").trim().split(/\s+/).filter(Boolean).length || 1;
    if (lang === "mixed") {
      weights.en = (weights.en ?? 0) + seconds / 2;
      weights.hi = (weights.hi ?? 0) + seconds / 2;
    } else {
      weights[lang] = (weights[lang] ?? 0) + seconds;
    }
  }
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (total <= 0) return {};
  const mix: Record<string, number> = {};
  for (const [lang, w] of Object.entries(weights)) {
    const share = Math.round((w / total) * 100) / 100;
    if (share >= 0.02) mix[lang] = share;
  }
  return mix;
}

const LANGUAGE_NAMES: Record<string, string> = { en: "English", hi: "Hindi" };

/** "English 88% · Hindi 12%" — for the UI chip and the summary email. */
export function formatLanguageMix(mix: Record<string, number> | null | undefined): string {
  if (!mix) return "";
  return Object.entries(mix)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, share]) =>
      `${LANGUAGE_NAMES[lang] ?? lang} ${Math.round(share * 100)}%`
    )
    .join(" · ");
}

/** Tag each segment with its detected language. Returns new objects. */
export function annotateLanguages<T extends SpeakerSegment>(
  segments: T[],
): (T & { language: SegmentLanguage })[] {
  return (Array.isArray(segments) ? segments : []).map((s) => ({
    ...s,
    language: segmentLanguage(s.text),
  }));
}
