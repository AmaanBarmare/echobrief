/**
 * Pure chunk-stitching logic for multi-file (chunked) Sarvam jobs.
 *
 * Extracted from sarvam-webhook so it is unit-testable: given the ordered
 * per-chunk outputs and the chunk length, produce one merged result with
 * absolute timestamps. No I/O, no env, no side effects.
 */

export interface StitchedResult {
  transcript: string;
  language_code: string;
  diarized_transcript: { entries: Record<string, unknown>[] };
  empty_chunks: number;
}

/**
 * Merge ordered chunk results into a single transcript + diarized timeline.
 *
 * - chunk i's timestamps are offset by `i * chunkSeconds` (absolute meeting time)
 * - entries are time-sorted afterwards: Sarvam's diarization can emit slightly
 *   out-of-order entries when speakers overlap, and the dashboard timeline
 *   (and the stitch_integrity eval) expect monotonic segments
 * - empty chunks (silence) are skipped but counted
 * - language_code = first non-null chunk language
 */
export function stitchChunkResults(
  chunkResults: Record<string, unknown>[],
  chunkSeconds: number,
): StitchedResult {
  const mergedEntries: Record<string, unknown>[] = [];
  const transcriptParts: string[] = [];
  let mergedLanguage: string | null = null;
  let emptyChunks = 0;

  chunkResults.forEach((chunk: Record<string, unknown>, i: number) => {
    const offset = i * chunkSeconds;
    const text = String((chunk as any)?.transcript || "").trim();
    if (text) transcriptParts.push(text);
    else emptyChunks++;
    if (!mergedLanguage && (chunk as any)?.language_code) {
      mergedLanguage = (chunk as any).language_code;
    }
    const entries = (chunk as any)?.diarized_transcript?.entries || [];
    for (const entry of entries) {
      mergedEntries.push({
        ...entry,
        start_time_seconds: (entry.start_time_seconds ?? entry.start ?? 0) + offset,
        end_time_seconds: (entry.end_time_seconds ?? entry.end ?? 0) + offset,
      });
    }
  });

  mergedEntries.sort(
    (a, b) =>
      Number(a.start_time_seconds ?? 0) - Number(b.start_time_seconds ?? 0),
  );

  return {
    transcript: transcriptParts.join(" "),
    language_code: mergedLanguage || "unknown",
    diarized_transcript: { entries: mergedEntries },
    empty_chunks: emptyChunks,
  };
}
