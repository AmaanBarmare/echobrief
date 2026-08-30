/**
 * Translate Sarvam's leaked Devanagari segments to English.
 *
 * Sarvam runs in translate mode — the product promise is English output from
 * any spoken language — but it leaks untranslated (often garbled) Devanagari
 * lines on Hinglish audio (measured 2026-08-30). Those lines poison the
 * transcript, the insights and the english_output eval. This pass finds the
 * segments language-tagged hi/mixed and asks gpt-4o-mini to translate JUST
 * those, keeping the original text on the segment for audit.
 *
 * Non-fatal by construction: any failure returns the input unchanged — a
 * missing translation must never cost the meeting its transcript.
 */
import OpenAI from "https://esm.sh/openai@4.20.1";
import type { SpeakerSegment } from "./insights.ts";
import type { SegmentLanguage } from "./language.ts";

type Tagged = SpeakerSegment & { language?: SegmentLanguage };

const BATCH_SIZE = 60;

async function translateBatch(
  openai: OpenAI,
  batch: Array<{ index: number; text: string }>,
): Promise<Record<string, string>> {
  const prompt = `Translate each numbered Hindi/Hinglish utterance from a business meeting to natural English. These are automatic-transcription outputs, so some are garbled — translate the recoverable meaning; if an utterance is unrecoverable noise, return your best literal gloss rather than inventing content. Never add information.

UTTERANCES:
${JSON.stringify(batch)}

Respond with JSON: {"translations": {"<index>": "<english>"}} — one entry per input index.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });
  const raw = JSON.parse(completion.choices[0]?.message?.content || "{}");
  const map = raw.translations;
  return map && typeof map === "object" ? (map as Record<string, string>) : {};
}

/**
 * Returns segments with hi/mixed ones translated to English (`original_text`
 * keeps what Sarvam produced). Segments must already carry a `language` tag
 * (annotateLanguages). Untagged or English segments pass through untouched.
 */
export async function translateLeakedSegments<T extends Tagged>(
  openai: OpenAI,
  segments: T[],
): Promise<T[]> {
  const leaked = segments
    .map((seg, index) => ({ seg, index }))
    .filter(({ seg }) => seg.language === "hi" || seg.language === "mixed")
    .filter(({ seg }) => String(seg.text ?? "").trim().length > 0);
  if (leaked.length === 0) return segments;

  try {
    const translations: Record<string, string> = {};
    for (let i = 0; i < leaked.length; i += BATCH_SIZE) {
      const batch = leaked
        .slice(i, i + BATCH_SIZE)
        .map(({ seg, index }) => ({ index, text: String(seg.text) }));
      Object.assign(translations, await translateBatch(openai, batch));
    }

    let applied = 0;
    const out = segments.map((seg, index) => {
      const t = translations[String(index)];
      if (typeof t !== "string" || !t.trim()) return seg;
      applied++;
      return { ...seg, text: t.trim(), original_text: seg.text };
    });
    console.log(
      `[translate-leaks] Translated ${applied}/${leaked.length} leaked Devanagari segment(s) to English`,
    );
    return out;
  } catch (err) {
    console.warn("[translate-leaks] Translation pass failed (non-fatal):", err);
    return segments;
  }
}
