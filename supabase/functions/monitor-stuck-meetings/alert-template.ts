/**
 * The stuck-meeting alert markup.
 *
 * Split out of index.ts for the same reason send-meeting-email's template is:
 * the module body reads env vars and calls serve(), so the layout could not be
 * rendered or tested without starting a server on import.
 *
 * Internal mail, same shell as everything else — an alert that looks like a
 * different product is one more thing to recognise at 2am.
 */
import {
  BODY,
  C,
  emailShell,
  escapeHtml,
  MONO,
  panel,
  row,
  section,
} from "../_shared/email-brand.ts";
import { KNOWN_PATTERNS } from "./known-patterns.ts";

export interface AlertInput {
  meeting: {
    id: string;
    title: string;
    user_id: string;
    status: string;
    recall_bot_id?: string | null;
    sarvam_job_id?: string | null;
  };
  detection: {
    signature: string;
    age_minutes: number;
    details: unknown;
  };
  recoveryNote: string;
  recoveryOk: boolean;
  isNewPattern: boolean;
  isHarnessMeeting: boolean;
}

export function buildAlertSubject(input: AlertInput): string {
  const prefix = input.isHarnessMeeting
    ? "[ECHOBRIEF HARNESS TEST]"
    : input.isNewPattern
      ? "[ECHOBRIEF NEW ERROR]"
      : "[ECHOBRIEF]";
  return `${prefix} ${input.detection.signature} \u2014 ${input.meeting.title}`;
}

export function buildAlertHtml(input: AlertInput): string {
  const { meeting, detection, recoveryNote, recoveryOk, isNewPattern, isHarnessMeeting } = input;

  const knownAdvice = KNOWN_PATTERNS[detection.signature]?.description ||
    "Unknown pattern. Investigate the meeting and add an entry to errors.md + known-patterns.ts.";

  const dashboardLink = `https://echobrief.in/meeting/${meeting.id}`;
  const detailsBlock = JSON.stringify(detection.details, null, 2);

  // Same shell as every user-facing mail. This one goes to us, not a customer,
  // but an alert that looks like a different product is one more thing to
  // recognise at 2am — and the shell costs nothing to reuse.
  const tone = isHarnessMeeting ? C.ok : isNewPattern ? C.stop : C.ember;
  const headline = isHarnessMeeting
    ? "Harness test alert"
    : isNewPattern
      ? "New error pattern"
      : "Stuck meeting";
  const standfirst = isHarnessMeeting
    ? "Triggered by a [harness] meeting. Expected — safe to ignore."
    : isNewPattern
      ? "This signature is not in KNOWN_PATTERNS. Investigate, then add it to errors.md and known-patterns.ts."
      : "A meeting has been stuck past the threshold and the canonical recovery was attempted.";

  const fact = (label: string, value: string, mono = false) => `
                <tr>
                  <td style="padding:0 0 6px;font-family:${MONO};font-size:10px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:${C.inkFaint};width:120px;" valign="top">${escapeHtml(label)}</td>
                  <td style="padding:0 0 6px;font-family:${mono ? MONO : BODY};font-size:13px;line-height:1.5;color:${C.inkMid};">${escapeHtml(value)}</td>
                </tr>`;

  const factTable = (rows: string) =>
    `<table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rows}</table>`;

  const html = emailShell({
    eyebrow: "Pipeline alert",
    headline,
    meta: `<span style="color:${tone};font-weight:600;">${escapeHtml(detection.signature)}</span>`,
    bodyRows: [
      row(
        panel(
          `<p style="margin:0;font-family:${BODY};font-size:15px;line-height:1.6;color:${C.ink};">${escapeHtml(standfirst)}</p>`,
          isNewPattern ? "gold" : "ember",
        ),
        "20px 28px 26px",
      ),
      section(
        "Recovery",
        factTable(
          fact("Attempted", `${recoveryOk ? "succeeded" : "failed"} — ${recoveryNote}`) +
            fact("Guidance", knownAdvice),
        ),
      ),
      section(
        "Meeting",
        factTable(
          fact("Title", meeting.title) +
            fact("ID", meeting.id, true) +
            fact("Owner", meeting.user_id, true) +
            fact("Status", meeting.status, true) +
            fact("Stuck for", `${Math.round(detection.age_minutes)} min`) +
            fact("Recall bot", meeting.recall_bot_id || "none", true) +
            fact("Sarvam job", meeting.sarvam_job_id || "none", true),
        ),
      ),
      section(
        "Details",
        `<pre style="margin:0;background-color:${C.paper};border:1px solid ${C.rule};border-radius:10px;padding:14px;overflow-x:auto;font-family:${MONO};font-size:12px;line-height:1.5;color:${C.inkMid};">${escapeHtml(detailsBlock)}</pre>`,
      ),
      isNewPattern
        ? section(
          "Next step",
          `<p style="margin:0;font-family:${BODY};font-size:14px;line-height:1.6;color:${C.inkMid};">Investigate this signature, then add it to <span style="font-family:${MONO};font-size:13px;">errors.md</span> and <span style="font-family:${MONO};font-size:13px;">monitor-stuck-meetings/known-patterns.ts</span> with a recovery action. They drift if you only update one.</p>`,
        )
        : "",
    ].join(""),
    cta: { href: dashboardLink, label: "Open in dashboard" },
    signoff: "Sent by",
    hideFooterLink: true,
  });
  return html;
}
