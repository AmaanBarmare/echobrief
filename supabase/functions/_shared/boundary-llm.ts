/**
 * LLM fallback for meeting boundaries when the Recall speaker timeline is
 * missing (speakers are SPEAKER_XX) or the external guest never matched it.
 * Finds the first and last utterance that are part of the conversation WITH
 * the external party, by content. Marked `source: "llm_estimated"` so the UI
 * can say so. Never throws; returns null when unsure.
 */
import OpenAI from "https://esm.sh/openai@4.20.1";
import type { Boundaries } from "./zones.ts";

const JOIN_PAD_SECONDS = 20;
const LEAVE_PAD_SECONDS = 20;

export function normalizeLlmBoundaries(
  raw: Record<string, unknown>,
  lastSegmentEnd: number,
): Boundaries | null {
  const first = Number(raw.first_ts);
  const last = Number(raw.last_ts);
  if (raw.confident !== true) return null;
  if (!Number.isFinite(first) || !Number.isFinite(last) || first < 0 || last <= first) return null;
  if (lastSegmentEnd > 0 && first > lastSegmentEnd) return null;
  return {
    first_external_join_ts: Math.max(0, Math.round(first - JOIN_PAD_SECONDS)),
    last_external_leave_ts: Math.round(last + LEAVE_PAD_SECONDS),
    source: "llm_estimated",
    internal_only: false,
  };
}

export async function estimateBoundariesWithLLM(
  openai: OpenAI,
  labeledTranscript: string,
  externalDescription: string,
  lastSegmentEnd: number,
): Promise<Boundaries | null> {
  try {
    const prompt = `This is a recording that started before a guest joined and continued after they left. The guest(s): ${externalDescription}. Find the boundaries of the actual meeting with the guest.

TRANSCRIPT (each line is [mm:ss] Speaker: speech):
${labeledTranscript.slice(0, 60_000)}

Return JSON: {"first_ts": <seconds of the first utterance that is part of the conversation with the guest — usually a greeting to them>, "last_ts": <seconds of the last utterance directed at or spoken by the guest>, "confident": <true only if the boundary is clear>}. Convert [mm:ss] to seconds. If the whole transcript is the meeting, set first_ts to the first line's time and last_ts to the last line's time.`;
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    const raw = JSON.parse(completion.choices[0]?.message?.content || "{}");
    return normalizeLlmBoundaries(raw, lastSegmentEnd);
  } catch (err) {
    console.warn("[boundary-llm] estimate failed (non-fatal):", err);
    return null;
  }
}
