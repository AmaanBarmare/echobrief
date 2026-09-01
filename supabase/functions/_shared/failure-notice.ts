/**
 * Telling the user when their meeting failed.
 *
 * The monitor cron has always emailed `ALERT_EMAIL_TO` — us. The person whose
 * meeting failed saw a status change, no explanation, no email, and had no
 * status page to check. Every competitor sends a "we could not process this".
 *
 * This is a sweep rather than a hook at each failure site: `status: "failed"`
 * is written from eight different places (recall-webhook, check-recall-status,
 * process-meeting, sarvam-webhook, recall-pipeline, monitor-stuck-meetings),
 * and wiring a send into every one of them is how you end up with two of them
 * that double-send and one that never fires. One pass, run from the monitor
 * cron that already ticks every 15 minutes, catches all eight and adds no new
 * cron job.
 *
 * Idempotence is the `email_deliveries` claim, the same UNIQUE-index mechanism
 * that stopped the triple summary email in August — not a flag on the meeting,
 * which a concurrent tick could read before the other one wrote it.
 */
import { emailShell, paragraph, row, panel, C } from "./email-brand.ts";
import { claimEmailDelivery, recordEmailDelivery, releaseEmailDelivery } from "./email-delivery.ts";
import { harnessEmailsEnabled, isHarnessMeeting } from "./insights.ts";

export const FAILURE_NOTICE_KIND = "failure_notice";

/** Only recent failures. Without this, deploying the sweep mails the backlog. */
const DEFAULT_WINDOW_HOURS = 24;
/** A ceiling so a bad deploy cannot turn one tick into hundreds of emails. */
const DEFAULT_LIMIT = 25;

/**
 * Plain language for what went wrong.
 *
 * The stored `error_message` is written for us — it says things like
 * "KeyError: 'timestamps'". The user needs to know whether to try again and
 * whether it was their fault, and nothing else.
 */
export function explainFailure(errorMessage?: string | null): {
  summary: string;
  advice: string;
} {
  const raw = (errorMessage || "").toLowerCase();

  // Order matters, and the matchers are deliberately specific. A bare
  // `includes("sarvam")` looked reasonable and was wrong twice: the monitor's
  // own signature `stuck:processing:no_sarvam_job` and a raw
  // `KeyError ... sarvam_pipeline.py` both matched it, so a stuck meeting and
  // an unrecognised crash were both described to the user as a transcription
  // failure. Match the phrase, not the vendor name.
  if (raw.includes("no clear speech") || raw.includes("empty transcript")) {
    return {
      summary: "The recording came through, but we could not find any clear speech in it.",
      advice: "This usually means the bot was admitted but nobody was speaking, or the meeting audio never reached it. Recording again should work.",
    };
  }
  if (raw.includes("stuck") || raw.includes("timeout") || raw.includes("timed out")) {
    return {
      summary: "Processing this meeting took longer than expected and was stopped.",
      advice: "Long recordings occasionally hit this. Recording again, or splitting a very long call into two, should get you a summary.",
    };
  }
  if (raw.includes("download") || raw.includes("audio")) {
    return {
      summary: "We could not retrieve the audio for this meeting.",
      advice: "The recording did not make it from the meeting platform to us. Nothing on your side caused this — recording the meeting again is the fix.",
    };
  }
  if (raw.includes("transcription failed") || raw.includes("both sarvam and whisper")) {
    return {
      summary: "The recording was captured, but transcription did not complete.",
      advice: "We try a second transcription service when the first one fails, and both were unable to process this audio. Recording again usually succeeds.",
    };
  }
  return {
    summary: "Something went wrong while processing this meeting.",
    advice: "We have been alerted and are looking at it. Recording the meeting again is the quickest way to get your summary.",
  };
}

function buildFailureEmail(meeting: Record<string, any>): { subject: string; html: string } {
  const title = meeting.title || "Your meeting";
  const { summary, advice } = explainFailure(meeting.error_message);

  const bodyRows = [
    row(paragraph(summary, C.ink)),
    row(
      panel(`<p style="margin:0;font-size:14px;color:${C.inkMid};">${advice}</p>`, "ember"),
    ),
    row(
      paragraph(
        "This meeting used none of your plan's meeting-hours — those are counted "
          + "only when a recording is processed successfully.",
        C.inkSoft,
      ),
    ),
  ].join("");

  return {
    subject: `We could not process "${title}"`,
    html: emailShell({
      eyebrow: "Meeting not processed",
      headline: "This one did not come through",
      meta: title,
      bodyRows,
      cta: { href: "https://www.echobrief.in/dashboard", label: "Open EchoBrief" },
      ctaNote: "Reply to this email if it keeps happening and we will look into your account.",
    }),
  };
}

export interface FailureSweepResult {
  considered: number;
  sent: number;
  skipped: number;
}

/**
 * Email the owner of every meeting that failed inside the window and has not
 * been told yet. Never throws — this runs inside the monitor cron and must not
 * be able to take stuck-meeting detection down with it.
 */
export async function notifyRecentFailures(
  supabase: any,
  opts: { windowHours?: number; limit?: number; dryRun?: boolean } = {},
): Promise<FailureSweepResult> {
  const windowHours = opts.windowHours ?? DEFAULT_WINDOW_HOURS;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const result: FailureSweepResult = { considered: 0, sent: 0, skipped: 0 };

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.warn("[failure-notice] RESEND_API_KEY not set, skipping sweep");
    return result;
  }

  try {
    const since = new Date(Date.now() - windowHours * 3600_000).toISOString();
    const { data: failures, error } = await supabase
      .from("meetings")
      .select("id, user_id, title, error_message, created_at")
      .eq("status", "failed")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    result.considered = (failures ?? []).length;

    for (const meeting of failures ?? []) {
      // Harness meetings fail on purpose, several times a run.
      if (isHarnessMeeting(meeting.title) && !harnessEmailsEnabled()) {
        result.skipped += 1;
        continue;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("user_id", meeting.user_id)
        .maybeSingle();
      const to = profile?.email;
      if (!to) {
        result.skipped += 1;
        continue;
      }

      // The claim is what makes re-running this every 15 minutes harmless.
      const claim = await claimEmailDelivery(supabase, meeting.id, to, FAILURE_NOTICE_KIND);
      if (!claim.claimed) {
        result.skipped += 1;
        continue;
      }

      if (opts.dryRun) {
        await releaseEmailDelivery(supabase, claim.claimId);
        result.sent += 1;
        continue;
      }

      const { subject, html } = buildFailureEmail(meeting);
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "EchoBrief <noreply@echobrief.in>",
            to: [to],
            subject,
            html,
          }),
        });
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(`Resend ${response.status}: ${detail.slice(0, 200)}`);
        }
        const sendResult = await response.json();
        await recordEmailDelivery(supabase, claim.claimId, sendResult?.id);
        result.sent += 1;
        console.log(`[failure-notice] told ${to} about meeting ${meeting.id}`);
      } catch (sendError) {
        // Give the slot back so the next tick can retry rather than the user
        // never hearing about it.
        await releaseEmailDelivery(supabase, claim.claimId);
        console.error(`[failure-notice] send failed for meeting ${meeting.id}:`, sendError);
      }
    }
  } catch (err) {
    console.error("[failure-notice] sweep failed:", err);
  }

  return result;
}
