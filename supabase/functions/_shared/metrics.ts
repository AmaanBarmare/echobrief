/**
 * Conversation metrics computed from transcript segments.
 *
 * Why this exists: `meeting_metrics` used to be produced by asking GPT-4o-mini
 * to estimate talk time. On meeting 7261568f it returned duration_seconds 300
 * for a 664-second meeting whose speech spans ~500 seconds — a plausible round
 * number presented as a measurement. Every segment already carries exact
 * start/end timings, so these are computed rather than guessed.
 *
 * Pure and synchronous: no I/O, no clock, no randomness. Fully unit-tested in
 * supabase/functions/tests/metrics_test.ts.
 */
import type { SpeakerSegment } from "./insights.ts";

export interface SpeakerStat {
  speaker: string;
  seconds: number;
  /** Share of total speech (speakers sum to 100), NOT of wall-clock. */
  percentage: number;
  turns: number;
  questions: number;
  words: number;
  /** Words per minute of this speaker's own speech. Null when unmeasurable. */
  words_per_minute: number | null;
}

export interface ConversationMetrics {
  speaker_participation: SpeakerStat[];
  total_speaking_seconds: number;
  /** Percent of meeting duration with no speech, clamped to [0, 100]. */
  silence_percentage: number;
  turn_count: number;
  total_words: number;
  /** Words per minute across all speech. Null when there is no speech time. */
  words_per_minute: number | null;
  /** Dead air before the first word and after the last, in seconds. */
  lead_in_silence_seconds: number;
  trailing_silence_seconds: number;
  longest_monologue_seconds: number;
  longest_monologue_speaker: string | null;
  /**
   * 1 - Gini over per-speaker seconds. 1 = perfectly even. Null when fewer
   * than two speakers, where "balance" describes nothing.
   */
  participation_balance: number | null;
}

/**
 * A silence longer than this ends a monologue.
 *
 * Without it, "longest uninterrupted stretch" means "total time this speaker
 * held the floor", which is a different and much larger number. Meeting
 * 7261568f reported a 244.94 s stretch that contained 36 gaps, one of them
 * 62 s — the longest genuinely continuous speech was 21 s.
 */
const MONOLOGUE_GAP_SECONDS = 15;

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function wordCount(text: unknown): number {
  return String(text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

/** Words per minute, or null when there is no speech time to divide by. */
function rate(words: number, seconds: number): number | null {
  if (!(seconds > 0)) return null;
  return Math.round(words / (seconds / 60));
}

function segSeconds(s: SpeakerSegment): number {
  const start = Number(s.start ?? 0);
  const end = Number(s.end ?? 0);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

/**
 * Gini coefficient of a value distribution. 0 = perfectly even.
 * A single value yields 0 — one participant is evenly balanced by construction.
 */
function gini(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  let weighted = 0;
  for (let i = 0; i < n; i++) weighted += (i + 1) * sorted[i];
  return (2 * weighted) / (n * total) - (n + 1) / n;
}

export function computeConversationMetrics(
  segments: SpeakerSegment[],
  durationSeconds: number,
): ConversationMetrics {
  const empty: ConversationMetrics = {
    speaker_participation: [],
    total_speaking_seconds: 0,
    silence_percentage: 0,
    turn_count: 0,
    total_words: 0,
    words_per_minute: null,
    lead_in_silence_seconds: 0,
    trailing_silence_seconds: 0,
    longest_monologue_seconds: 0,
    longest_monologue_speaker: null,
    participation_balance: null,
  };

  if (!Array.isArray(segments) || segments.length === 0) {
    // No speech at all: the whole meeting was silence, when we know its length.
    return { ...empty, silence_percentage: durationSeconds > 0 ? 100 : 0 };
  }

  // Turn detection depends on time order; callers do not guarantee it.
  const ordered = [...segments].sort(
    (a, b) => Number(a.start ?? 0) - Number(b.start ?? 0),
  );

  const bySpeaker = new Map<
    string,
    { seconds: number; turns: number; questions: number; words: number }
  >();
  let totalSpeaking = 0;
  let turnCount = 0;
  let prevSpeaker: string | null = null;

  let runSpeaker: string | null = null;
  let runSeconds = 0;
  let longestSeconds = 0;
  let longestSpeaker: string | null = null;
  let prevEnd: number | null = null;

  for (const s of ordered) {
    const speaker = s.speaker || "Unknown";
    const secs = segSeconds(s);
    totalSpeaking += secs;

    const stat = bySpeaker.get(speaker) ??
      { seconds: 0, turns: 0, questions: 0, words: 0 };
    stat.seconds += secs;
    stat.questions += (String(s.text ?? "").match(/\?/g) || []).length;
    stat.words += wordCount(s.text);

    // A turn is a change of speaker. A monologue additionally ends when the
    // speaker goes quiet for a while, so silence is never counted as speech.
    const speakerChanged = speaker !== prevSpeaker;
    const start = Number(s.start ?? 0);
    const gap = prevEnd === null || !Number.isFinite(start)
      ? 0
      : Math.max(0, start - prevEnd);
    const monologueEnded = speakerChanged || gap > MONOLOGUE_GAP_SECONDS;

    if (speakerChanged) {
      turnCount += 1;
      stat.turns += 1;
    }

    if (monologueEnded) {
      if (runSeconds > longestSeconds) {
        longestSeconds = runSeconds;
        longestSpeaker = runSpeaker;
      }
      runSpeaker = speaker;
      runSeconds = secs;
    } else {
      runSeconds += secs;
    }

    bySpeaker.set(speaker, stat);
    prevSpeaker = speaker;
    const end = Number(s.end ?? 0);
    if (Number.isFinite(end)) prevEnd = prevEnd === null ? end : Math.max(prevEnd, end);
  }

  // The final run never hits the speaker-change branch above.
  if (runSeconds > longestSeconds) {
    longestSeconds = runSeconds;
    longestSpeaker = runSpeaker;
  }

  const participation: SpeakerStat[] = [...bySpeaker.entries()]
    .map(([speaker, v]) => ({
      speaker,
      seconds: round(v.seconds),
      percentage: totalSpeaking > 0 ? round((v.seconds / totalSpeaking) * 100) : 0,
      turns: v.turns,
      questions: v.questions,
      words: v.words,
      words_per_minute: rate(v.words, v.seconds),
    }))
    .sort((a, b) => b.seconds - a.seconds);

  const silence = durationSeconds > 0
    ? Math.min(100, Math.max(0, ((durationSeconds - totalSpeaking) / durationSeconds) * 100))
    : 0;

  // Dead air at the edges: the wait before anyone spoke, and the tail after
  // the last word, both of which the bot still recorded.
  const firstStart = Number(ordered[0]?.start ?? 0);
  const lastEnd = ordered.reduce((max, s) => Math.max(max, Number(s.end ?? 0)), 0);
  const leadIn = Number.isFinite(firstStart) ? Math.max(0, firstStart) : 0;
  const trailing = durationSeconds > 0 ? Math.max(0, durationSeconds - lastEnd) : 0;
  const totalWords = [...bySpeaker.values()].reduce((a, v) => a + v.words, 0);

  return {
    speaker_participation: participation,
    total_speaking_seconds: round(totalSpeaking),
    total_words: totalWords,
    words_per_minute: rate(totalWords, totalSpeaking),
    lead_in_silence_seconds: round(Math.min(leadIn, durationSeconds > 0 ? durationSeconds : leadIn)),
    trailing_silence_seconds: round(trailing),
    silence_percentage: round(silence),
    turn_count: turnCount,
    longest_monologue_seconds: round(longestSeconds),
    longest_monologue_speaker: longestSpeaker,
    participation_balance: participation.length >= 2
      ? round(1 - gini(participation.map((p) => p.seconds)))
      : null,
  };
}

/**
 * Merge the model's meeting_metrics with the computed ones.
 *
 * A whitelist, not a spread. Removing engagement_score from the prompt does not
 * stop gpt-4o-mini from volunteering it in JSON mode — observed in production on
 * 2026-08-20, where a plain `{...model, ...computed}` merge let `engagement_score: 80`
 * back into the row because no computed key shadowed it. sentiment_score is the
 * only model-produced value we keep, because it is a genuine judgment call rather
 * than a measurement the transcript already contains.
 */
export function mergeMeetingMetrics(
  modelMetrics: Record<string, unknown> | null | undefined,
  computed: ConversationMetrics,
): ConversationMetrics & { sentiment_score?: number } {
  const raw = (modelMetrics ?? {}) as Record<string, unknown>;
  const sentiment = Number(raw.sentiment_score);
  return {
    ...computed,
    ...(Number.isFinite(sentiment) ? { sentiment_score: sentiment } : {}),
  };
}
