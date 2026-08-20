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
}

export interface ConversationMetrics {
  speaker_participation: SpeakerStat[];
  total_speaking_seconds: number;
  /** Percent of meeting duration with no speech, clamped to [0, 100]. */
  silence_percentage: number;
  turn_count: number;
  longest_monologue_seconds: number;
  longest_monologue_speaker: string | null;
  /** 1 - Gini over per-speaker seconds. 1 = perfectly even. */
  participation_balance: number;
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
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
    longest_monologue_seconds: 0,
    longest_monologue_speaker: null,
    participation_balance: 0,
  };

  if (!Array.isArray(segments) || segments.length === 0) {
    // No speech at all: the whole meeting was silence, when we know its length.
    return { ...empty, silence_percentage: durationSeconds > 0 ? 100 : 0 };
  }

  // Turn detection depends on time order; callers do not guarantee it.
  const ordered = [...segments].sort(
    (a, b) => Number(a.start ?? 0) - Number(b.start ?? 0),
  );

  const bySpeaker = new Map<string, { seconds: number; turns: number; questions: number }>();
  let totalSpeaking = 0;
  let turnCount = 0;
  let prevSpeaker: string | null = null;

  let runSpeaker: string | null = null;
  let runSeconds = 0;
  let longestSeconds = 0;
  let longestSpeaker: string | null = null;

  for (const s of ordered) {
    const speaker = s.speaker || "Unknown";
    const secs = segSeconds(s);
    totalSpeaking += secs;

    const stat = bySpeaker.get(speaker) ?? { seconds: 0, turns: 0, questions: 0 };
    stat.seconds += secs;
    stat.questions += (String(s.text ?? "").match(/\?/g) || []).length;

    if (speaker !== prevSpeaker) {
      turnCount += 1;
      stat.turns += 1;
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
    }))
    .sort((a, b) => b.seconds - a.seconds);

  const silence = durationSeconds > 0
    ? Math.min(100, Math.max(0, ((durationSeconds - totalSpeaking) / durationSeconds) * 100))
    : 0;

  return {
    speaker_participation: participation,
    total_speaking_seconds: round(totalSpeaking),
    silence_percentage: round(silence),
    turn_count: turnCount,
    longest_monologue_seconds: round(longestSeconds),
    longest_monologue_speaker: longestSpeaker,
    participation_balance: round(1 - gini(participation.map((p) => p.seconds))),
  };
}
