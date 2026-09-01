/**
 * The early-access feedback sequence.
 *
 * A code buys someone 28 days of the product in exchange for telling us what
 * is wrong with it. Nothing collected that feedback, so the trade was a
 * handshake. This module decides WHICH prompt is due for a given trial and
 * writes its copy; `send-feedback-prompts` does the I/O.
 *
 * Two rules the shape here exists to hold:
 *
 *   - At most one email per person per tick. Someone whose trial started
 *     before this shipped is "due" for all three at once; sending three would
 *     be the fastest way to get marked as spam. So the LATEST due prompt wins
 *     and the earlier ones are skipped, not queued.
 *   - Never nag someone who never started. Day 3 asks a different question of
 *     a person with zero recordings than of a person with six.
 *
 * Pure and unit-tested (tests/feedback_prompts_test.ts). No fetch, no clock.
 */
import {
  APP_URL,
  C,
  emailShell,
  escapeHtml,
  paragraph,
  row,
} from "./email-brand.ts";

/** The three moments in a 28-day trial worth asking at. */
export type PromptKind = "day_3" | "day_14" | "day_25";

/** Days into the trial at which each prompt becomes due. */
export const PROMPT_SCHEDULE: Array<{ kind: PromptKind; afterDays: number }> = [
  { kind: "day_3", afterDays: 3 },
  { kind: "day_14", afterDays: 14 },
  { kind: "day_25", afterDays: 25 },
];

export interface PromptContext {
  /** Whole days since the code was redeemed. */
  daysElapsed: number;
  /** Prompt kinds already sent to this user, in any order. */
  sent: readonly string[];
}

/**
 * Which prompt to send now, or null for "nothing due".
 *
 * Returns the latest due-and-unsent prompt rather than the earliest: a trial
 * that is 20 days in should hear the day-14 question, not the day-3 one it
 * has outgrown.
 */
export function dueFeedbackPrompt(ctx: PromptContext): PromptKind | null {
  if (!(ctx.daysElapsed >= 0)) return null;
  const sent = new Set(ctx.sent);
  for (let i = PROMPT_SCHEDULE.length - 1; i >= 0; i--) {
    const step = PROMPT_SCHEDULE[i];
    if (ctx.daysElapsed >= step.afterDays && !sent.has(step.kind)) return step.kind;
  }
  return null;
}

export interface PromptCopy {
  subject: string;
  html: string;
}

export interface RenderContext {
  /** Their name, if we have one. Used only in the greeting. */
  name?: string | null;
  /** Meetings they have actually recorded so far. Changes the day-3 ask. */
  meetingsRecorded: number;
  /** Whole days of access left. */
  daysLeft: number;
  /** Where to send the reply. */
  replyTo: string;
}

const FEEDBACK_NOTE =
  "Just reply to this email — it reaches a person, not a ticket queue.";

/**
 * Build the email. One question per mail: a message that asks five things
 * gets answered zero times.
 */
export function renderFeedbackPrompt(
  kind: PromptKind,
  ctx: RenderContext,
): PromptCopy {
  const hi = ctx.name ? `Hi ${escapeHtml(ctx.name.split(" ")[0])},` : "Hi,";

  if (kind === "day_3") {
    // Someone who has recorded nothing has a different problem from someone
    // who has recorded six times, and asking them both "how did it go?" wastes
    // the one message we get.
    const stalled = ctx.meetingsRecorded === 0;
    return {
      subject: stalled
        ? "Anything blocking you getting started?"
        : "How were your first EchoBrief summaries?",
      html: emailShell({
        eyebrow: "Early access",
        headline: stalled ? "Stuck on something?" : "How did the first few go?",
        bodyRows:
          row(paragraph(hi)) +
          row(
            paragraph(
              stalled
                ? "You picked up an early-access code a few days ago and haven't recorded a meeting yet. That's useful information on its own — what got in the way? Calendar connection, sending the bot, or something else entirely?"
                : `You've had ${ctx.meetingsRecorded} meeting${ctx.meetingsRecorded === 1 ? "" : "s"} through EchoBrief. One question: <strong>was the summary accurate enough that you'd send it to someone else without editing it?</strong>`,
            ),
          ) +
          row(paragraph(FEEDBACK_NOTE, C.inkFaint)),
        cta: { href: `${APP_URL}/dashboard`, label: "Open EchoBrief" },
      }),
    };
  }

  if (kind === "day_14") {
    return {
      subject: "Two weeks in — what's missing?",
      html: emailShell({
        eyebrow: "Early access",
        headline: "What would make you keep using this?",
        bodyRows:
          row(paragraph(hi)) +
          row(
            paragraph(
              `You're halfway through early access, with ${ctx.meetingsRecorded} meeting${ctx.meetingsRecorded === 1 ? "" : "s"} recorded. The question we actually need answered: <strong>what is the one thing that would make you keep paying for this after the trial?</strong>`,
            ),
          ) +
          row(
            paragraph(
              "If the honest answer is \"nothing\", that's the most useful reply we can get. Say so and tell us why.",
            ),
          ) +
          row(paragraph(FEEDBACK_NOTE, C.inkFaint)),
        cta: { href: `${APP_URL}/dashboard`, label: "Open EchoBrief" },
      }),
    };
  }

  return {
    subject: `Your early access ends in ${ctx.daysLeft} day${ctx.daysLeft === 1 ? "" : "s"}`,
    html: emailShell({
      eyebrow: "Early access",
      headline: "Before your access ends",
      bodyRows:
        row(paragraph(hi)) +
        row(
          paragraph(
            `Your early access ends in ${ctx.daysLeft} day${ctx.daysLeft === 1 ? "" : "s"}. Your meetings, transcripts and summaries stay where they are — recording is what stops.`,
          ),
        ) +
        row(
          paragraph(
            "Two things worth five minutes of yours: <strong>what did EchoBrief get wrong that you had to fix by hand</strong>, and <strong>what would it need to do for you to pay for it?</strong>",
          ),
        ) +
        row(paragraph(FEEDBACK_NOTE, C.inkFaint)),
      cta: { href: `${APP_URL}/settings?tab=billing`, label: "See your plans" },
    }),
  };
}
