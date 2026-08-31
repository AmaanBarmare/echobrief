/**
 * Per-meeting sales coaching report.
 *
 * The metrics module measures (talk %, monologue, questions) but carries no
 * interpretation — a rep reading "57%" doesn't know it's a problem. This
 * module benchmarks the measurements into verdicts, computes hedge-word
 * density deterministically, and runs one LLM pass over the facts + transcript
 * for moment detection (objection ignored, pitched too early, numbers
 * mismatch, next step strength), a sentiment timeline for the external
 * participant, and a coach's summary paragraph.
 *
 * Deterministic parts are pure and unit-tested (tests/coaching_test.ts).
 * Coaching runs only for external meetings — internal syncs don't get graded.
 */
import OpenAI from "https://esm.sh/openai@4.20.1";
import type { SpeakerSegment } from "./insights.ts";
import type { MeetingFacts } from "./facts.ts";
import type { ConversationMetrics } from "./metrics.ts";
import { Attendee, externalAttendees, ownerDomain, speakerMatchesAttendee } from "./zones.ts";

export interface MetricVerdict {
  value: number;
  target: number;
  verdict: "good" | "ok" | "high" | "low";
  note: string;
}

export interface CoachingFlag {
  value: boolean;
  note: string;
  evidence_ts: number | null;
}

export interface CoachingReport {
  rep: string | null;
  external_participant: string | null;
  metrics: {
    talk_ratio?: MetricVerdict;
    longest_monologue?: MetricVerdict;
    questions?: MetricVerdict;
    hedge_density?: MetricVerdict;
  };
  flags: {
    pitched_before_discovery_complete?: CoachingFlag;
    objection_ignored?: CoachingFlag;
    numbers_mismatch?: CoachingFlag;
    next_step_secured?: { value: boolean; strength: "date_locked" | "vague" | "none"; note: string; evidence_ts: number | null };
  };
  sentiment_timeline: Array<{ t: number; score: number; note?: string }>;
  summary: string;
}

/** Discovery-call guideline: the rep should hold under 45% of the airtime. */
const TALK_RATIO_TARGET = 45;
const MONOLOGUE_TARGET_SECONDS = 60;

const HEDGE_WORDS = [
  "like", "maybe", "possibly", "probably", "basically", "actually",
  "kind of", "sort of", "i think", "i feel like", "i guess", "you know",
  "matlab", "waise", "thoda",
];

/** Split speakers into the workspace side and the guest side. */
export function classifySpeakers(
  speakers: string[],
  attendees: Attendee[] | null | undefined,
): { internal: string[]; external: string[] } {
  const domain = ownerDomain(attendees);
  const externals = externalAttendees(attendees, domain);
  const internal: string[] = [];
  const external: string[] = [];
  for (const name of speakers) {
    if (externals.some((a) => speakerMatchesAttendee(name, a))) external.push(name);
    else internal.push(name);
  }
  return { internal, external };
}

/** Hedge/filler occurrences per 100 words for the given speakers. */
export function hedgeDensity(
  segments: SpeakerSegment[],
  speakers: string[],
): { per_100_words: number; total: number; words: number } {
  const wanted = new Set(speakers);
  let hits = 0;
  let words = 0;
  for (const seg of Array.isArray(segments) ? segments : []) {
    if (wanted.size > 0 && !wanted.has(seg.speaker)) continue;
    const text = ` ${String(seg.text ?? "").toLowerCase().replace(/[^a-z\s]/g, " ")} `;
    words += text.split(/\s+/).filter(Boolean).length;
    for (const hedge of HEDGE_WORDS) {
      let idx = 0;
      const needle = ` ${hedge} `;
      while ((idx = text.indexOf(needle, idx)) !== -1) {
        hits++;
        idx += needle.length - 1;
      }
    }
  }
  return {
    per_100_words: words > 0 ? Math.round((hits / words) * 1000) / 10 : 0,
    total: hits,
    words,
  };
}

/** Deterministic benchmark verdicts from the computed conversation metrics. */
export function benchmarkMetrics(
  metrics: ConversationMetrics & { sentiment_score?: number },
  segments: SpeakerSegment[],
  internalSpeakers: string[],
): CoachingReport["metrics"] {
  const out: CoachingReport["metrics"] = {};

  const internalShare = metrics.speaker_participation
    .filter((p) => internalSpeakers.includes(p.speaker))
    .reduce((a, p) => a + p.percentage, 0);
  if (internalSpeakers.length > 0 && metrics.speaker_participation.length >= 2) {
    const value = Math.round(internalShare);
    out.talk_ratio = {
      value,
      target: TALK_RATIO_TARGET,
      verdict: value > TALK_RATIO_TARGET + 10 ? "high" : value > TALK_RATIO_TARGET ? "ok" : "good",
      note: value > TALK_RATIO_TARGET
        ? `Your side spoke ${value}% — top discovery calls keep the rep under ${TALK_RATIO_TARGET}%.`
        : `Your side spoke ${value}% — under the ${TALK_RATIO_TARGET}% discovery guideline.`,
    };
  }

  // Only grade the monologue when the longest stretch belongs to the rep
  // side — a prospect talking at length is what good discovery looks like.
  if (
    Number.isFinite(metrics.longest_monologue_seconds) &&
    (metrics.longest_monologue_speaker === null ||
      internalSpeakers.includes(metrics.longest_monologue_speaker))
  ) {
    const value = Math.round(metrics.longest_monologue_seconds);
    out.longest_monologue = {
      value,
      target: MONOLOGUE_TARGET_SECONDS,
      verdict: value > MONOLOGUE_TARGET_SECONDS * 1.5
        ? "high"
        : value > MONOLOGUE_TARGET_SECONDS
        ? "ok"
        : "good",
      note: value > MONOLOGUE_TARGET_SECONDS
        ? `Longest uninterrupted stretch was ${value}s (${metrics.longest_monologue_speaker ?? "unknown"}) — aim under ${MONOLOGUE_TARGET_SECONDS}s.`
        : `Longest stretch ${value}s — within the ${MONOLOGUE_TARGET_SECONDS}s guideline.`,
    };
  }

  const repQuestions = metrics.speaker_participation
    .filter((p) => internalSpeakers.includes(p.speaker))
    .reduce((a, p) => a + p.questions, 0);
  if (internalSpeakers.length > 0) {
    out.questions = {
      value: repQuestions,
      target: 10,
      verdict: repQuestions >= 10 ? "good" : repQuestions >= 5 ? "ok" : "low",
      note: repQuestions >= 10
        ? `You asked ${repQuestions} questions — healthy discovery.`
        : `You asked ${repQuestions} questions — strong discovery calls usually run 10+.`,
    };
  }

  const hedge = hedgeDensity(segments, internalSpeakers);
  if (hedge.words > 50) {
    out.hedge_density = {
      value: hedge.per_100_words,
      target: 3,
      verdict: hedge.per_100_words > 5 ? "high" : hedge.per_100_words > 3 ? "ok" : "good",
      note: hedge.per_100_words > 3
        ? `${hedge.per_100_words} hedge/filler words per 100 ("maybe", "I think", "like") — tighten the language.`
        : `${hedge.per_100_words} hedge words per 100 — confident delivery.`,
    };
  }

  return out;
}

function flag(raw: unknown): CoachingFlag | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const tsNum = Number(o.evidence_ts);
  return {
    value: o.value === true,
    note: String(o.note ?? "").trim(),
    evidence_ts: Number.isFinite(tsNum) && tsNum >= 0 ? Math.round(tsNum) : null,
  };
}

/**
 * Full coaching report. Returns null for internal meetings (nothing to
 * coach) and never throws — a coaching failure must not cost the summary.
 */
export async function generateCoaching(
  openai: OpenAI,
  meeting: Record<string, any>,
  facts: MeetingFacts | null,
  metrics: ConversationMetrics & { sentiment_score?: number },
  segments: SpeakerSegment[],
): Promise<CoachingReport | null> {
  try {
    if (facts && facts.meeting_type === "internal_sync") return null;
    const speakers = [...new Set(segments.map((s) => s.speaker).filter(Boolean))];
    if (speakers.length < 2) return null;
    const { internal, external } = classifySpeakers(speakers, meeting.attendees);
    if (external.length === 0) return null;

    const computed = benchmarkMetrics(metrics, segments, internal);

    const repLead = metrics.speaker_participation
      .filter((p) => internal.includes(p.speaker))
      .sort((a, b) => b.seconds - a.seconds)[0]?.speaker ?? internal[0] ?? null;

    const labeled = segments
      .map((s) => {
        const start = Math.max(0, Math.floor(Number(s.start) || 0));
        return `[${Math.floor(start / 60)}:${String(start % 60).padStart(2, "0")}] ${s.speaker}: ${s.text ?? ""}`;
      })
      .join("\n");

    const prompt = `You are a sales coach reviewing this call. The rep side: ${internal.join(", ") || "unknown"}. The prospect/client side: ${external.join(", ")}.

EXTRACTED FACTS (verbatim quotes + timestamps):
${JSON.stringify(facts ? { numbers: facts.numbers, objections: facts.objections, explicit_asks: facts.explicit_asks, commitments: facts.commitments, pain_points: facts.pain_points } : {})}

TRANSCRIPT (each line is [mm:ss] Speaker: speech):
${labeled}

Detect, with transcript evidence only (never invent):
1. pitched_before_discovery_complete — the rep proposed a solution before the prospect finished describing their problem.
2. objection_ignored — the prospect pushed back and the rep continued the same pitch anyway.
3. numbers_mismatch — the rep used hypothetical numbers when the prospect's real numbers were available in the call.
4. next_step_secured — was a concrete next step agreed? strength: "date_locked" (a specific day/time was agreed), "vague" ("let's talk soon"), or "none".
5. sentiment_timeline — for the prospect side only, one entry per ~2 minutes of the call: score -1..1 and a short note at inflection points (rise/fall and why).
6. summary — one paragraph, written like a coach: what went well, what to fix, ending with the single highest-leverage improvement for the next call. Reference the evidence.

JSON shape:
{
  "pitched_before_discovery_complete": {"value": false, "note": "", "evidence_ts": null},
  "objection_ignored": {"value": false, "note": "", "evidence_ts": null},
  "numbers_mismatch": {"value": false, "note": "", "evidence_ts": null},
  "next_step_secured": {"value": false, "strength": "date_locked|vague|none", "note": "", "evidence_ts": null},
  "sentiment_timeline": [{"t": 0, "score": 0, "note": ""}],
  "summary": ""
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 2048,
      messages: [
        {
          role: "system",
          content:
            "You are a rigorous sales coach. Every claim you make must be backed by a timestamp from the transcript. Always respond with valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = JSON.parse(completion.choices[0]?.message?.content || "{}");

    const nextRaw = raw.next_step_secured as Record<string, unknown> | undefined;
    const strengthRaw = String(nextRaw?.strength ?? "none");
    const nextTs = Number(nextRaw?.evidence_ts);

    const timeline = (Array.isArray(raw.sentiment_timeline) ? raw.sentiment_timeline : [])
      .map((e: Record<string, unknown>) => {
        const t = Number(e?.t);
        const score = Number(e?.score);
        if (!Number.isFinite(t) || !Number.isFinite(score)) return null;
        const note = String(e?.note ?? "").trim();
        return {
          t: Math.max(0, Math.round(t)),
          score: Math.max(-1, Math.min(1, Math.round(score * 100) / 100)),
          ...(note ? { note } : {}),
        };
      })
      .filter(Boolean)
      .slice(0, 60) as CoachingReport["sentiment_timeline"];

    return {
      rep: repLead,
      external_participant: external[0] ?? null,
      metrics: computed,
      flags: {
        pitched_before_discovery_complete: flag(raw.pitched_before_discovery_complete),
        objection_ignored: flag(raw.objection_ignored),
        numbers_mismatch: flag(raw.numbers_mismatch),
        next_step_secured: {
          value: nextRaw?.value === true,
          strength: strengthRaw === "date_locked" || strengthRaw === "vague" ? strengthRaw : "none",
          note: String(nextRaw?.note ?? "").trim(),
          evidence_ts: Number.isFinite(nextTs) && nextTs >= 0 ? Math.round(nextTs) : null,
        },
      },
      sentiment_timeline: timeline,
      summary: String(raw.summary ?? "").trim(),
    };
  } catch (err) {
    console.warn("[coaching] Coaching pass failed (non-fatal):", err);
    return null;
  }
}
