/**
 * Send one of every email EchoBrief can send to a single address, for eyeballing.
 *
 *   deno run -A --env-file=.env scripts/email-preview.ts you@example.com
 *
 * Nine mails: the meeting summary, the forwarded report, the monitor's pipeline
 * alert, and the six Supabase Auth templates. All of them are rendered from the
 * same modules production uses — the summary and report are filled with a real
 * completed meeting's insights (read with the service role) so the layout is
 * exercised against real text lengths, not lorem ipsum.
 *
 * Delivery goes straight through Resend rather than through the edge functions,
 * because the point is to look at the markup: send-meeting-email would refuse a
 * second copy to an address that already has one for that meeting (the
 * email_deliveries claim), and the auth mails are rate-limited by GoTrue.
 */
import { buildEmailHtml, buildSubject } from "../supabase/functions/send-meeting-email/template.ts";
import {
  buildAlertHtml,
  buildAlertSubject,
} from "../supabase/functions/monitor-stuck-meetings/alert-template.ts";
import { generateEmailHTML } from "../supabase/functions/send-email-report/template.ts";
import { formatISTDate, formatISTTime } from "../supabase/functions/_shared/time.ts";

const to = Deno.args[0];
if (!to) {
  console.error("usage: deno run -A --env-file=.env scripts/email-preview.ts <recipient>");
  Deno.exit(1);
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM = "EchoBrief <noreply@echobrief.in>";

async function rest(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return await res.json();
}

async function send(subject: string, html: string, label: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  const body = await res.json();
  console.log(`${res.ok ? "✓" : "✗"} ${label.padEnd(18)} ${res.ok ? body.id : JSON.stringify(body)}`);
  return res.ok;
}

// --- real content for the two meeting mails ---------------------------------
const [meeting] = await rest(
  "meetings?select=*&status=eq.completed&title=not.like.*harness*&order=start_time.desc&limit=1",
);
const [insights] = await rest(`meeting_insights?select=*&meeting_id=eq.${meeting.id}`);

await send(
  buildSubject(meeting.title, insights),
  buildEmailHtml({
    title: meeting.title,
    date: formatISTDate(meeting.start_time),
    time: formatISTTime(meeting.start_time),
    duration: Math.round((meeting.duration_seconds || 0) / 60),
    insights,
    meetingId: meeting.id,
  }),
  "summary",
);

await send(
  `${meeting.title} \u2014 meeting report`,
  generateEmailHTML(insights, meeting),
  "report",
);

// --- the monitor's alert ----------------------------------------------------
const alertInput = {
  meeting: {
    id: meeting.id,
    title: meeting.title,
    user_id: meeting.user_id,
    status: "processing",
    recall_bot_id: meeting.recall_bot_id,
    sarvam_job_id: meeting.sarvam_job_id,
  },
  detection: {
    signature: "stuck:processing:no_sarvam_job",
    age_minutes: 37,
    details: {
      note: "This is a preview. No meeting is actually stuck.",
      status: "processing",
      sarvam_job_id: null,
      audio_url: "recordings/preview.mp3",
    },
  },
  recoveryNote: "re-fired check-recall-status; Sarvam job created",
  recoveryOk: true,
  isNewPattern: false,
  isHarnessMeeting: false,
};
await send(buildAlertSubject(alertInput), buildAlertHtml(alertInput), "monitor alert");

// --- the six auth templates -------------------------------------------------
const AUTH: Record<string, string> = {
  recovery: "Reset your password",
  confirmation: "Verify your email",
  invite: "You've been invited to EchoBrief",
  magic_link: "Your sign-in link",
  email_change: "Confirm your new email address",
  reauthentication: "Confirm it's you",
};

// Supabase substitutes these at send time; fill them so the preview is clickable.
const SUBS: Record<string, string> = {
  "{{ .ConfirmationURL }}": "https://echobrief.in/auth?preview=1",
  "{{ .Token }}": "418 902",
  "{{ .Email }}": "you@example.com",
  "{{ .NewEmail }}": "new@example.com",
};

for (const [name, subject] of Object.entries(AUTH)) {
  let html = await Deno.readTextFile(
    new URL(`../supabase/auth-emails/${name}.html`, import.meta.url),
  );
  for (const [token, value] of Object.entries(SUBS)) html = html.replaceAll(token, value);
  await send(subject, html, `auth:${name}`);
}

console.log(`\nSent to ${to}. The two meeting mails use "${meeting.title}".`);
