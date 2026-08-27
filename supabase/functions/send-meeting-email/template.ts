/**
 * Summary-email markup.
 *
 * Split out of index.ts so the layout can be imported, rendered and inspected
 * without the module's serve() call trying to bind a port.
 *
 * Deliberately NOT a copy of the meeting page. The page is the full report;
 * this is the digest that decides whether you open it. It carries the summary,
 * the handful of numbers worth knowing, and the things someone has to act on —
 * everything else is one click away and named in the closing line.
 *
 * Shell, colours and type come from _shared/email-brand.ts, which every mail we
 * send is built from. Nothing brand-level is redefined here — only the parts
 * that are specific to a meeting digest.
 */
import {
  APP_URL,
  BODY,
  C,
  emailShell,
  escapeHtml,
  MONO,
  row,
  section,
  SERIF,
  panel,
} from "../_shared/email-brand.ts";

export interface EmailData {
  title: string;
  date: string;
  time: string;
  duration: number;
  insights: any;
  meetingId: string;
}

export function buildEmailHtml(data: EmailData): string {
  const { title, date, time, duration, insights, meetingId } = data;

  const esc = escapeHtml;

  const clock = (seconds: number) => {
    const total = Math.round(seconds);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  };

  const itemBox = (content: string, accent: string) => `
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:8px;">
                <tr>
                  <td width="3" style="background-color:${accent};border-radius:2px 0 0 2px;">&nbsp;</td>
                  <td style="background-color:${C.paperCard};border:1px solid ${C.rule};border-left:none;border-radius:0 8px 8px 0;padding:12px 14px;font-family:${BODY};font-size:14px;line-height:1.55;color:${C.inkMid};">${content}</td>
                </tr>
              </table>`;

  // --- the three things worth acting on -------------------------------------
  const actionList = (insights?.action_items || []) as any[];
  const actionsHtml = actionList.map((item: any) => {
    const ownerBits: string[] = [];
    if (item?.owner) {
      ownerBits.push(`Owner: <span style="color:${C.emberDeep};font-weight:600;">${esc(item.owner)}</span>`);
    }
    if (item?.due_date) ownerBits.push(`Due ${esc(String(item.due_date))}`);
    const owner = ownerBits.length
      ? `<div style="margin-top:5px;font-family:${BODY};font-size:12px;color:${C.inkSoft};">${ownerBits.join(" · ")}</div>`
      : "";
    const priority = item?.priority
      ? ` <span style="font-family:${MONO};font-size:10px;font-weight:600;letter-spacing:0.08em;color:${getPriorityColor(item.priority)};">${esc(String(item.priority).toUpperCase())}</span>`
      : "";
    return itemBox(`<span style="color:${C.ink};font-weight:600;">${esc(item?.task ?? item)}</span>${priority}${owner}`, C.gold);
  }).join("");

  const decisionList = (insights?.decisions || []) as any[];
  const decisionsHtml = decisionList.map((d: any) =>
    itemBox(esc(typeof d === "string" ? d : d?.decision ?? ""), C.ember)).join("");

  const riskList = (insights?.risks || []) as string[];
  const risksHtml = riskList.map((r) => itemBox(esc(r), C.stop)).join("");

  // --- at a glance: four numbers, no more -----------------------------------
  const m = insights?.meeting_metrics || {};
  const cards: { label: string; value: string; caption: string }[] = [];
  if (typeof m.total_speaking_seconds === "number") {
    cards.push({ label: "Talk time", value: clock(m.total_speaking_seconds),
      caption: typeof m.total_words === "number" ? `${m.total_words} words` : "of speech" });
  }
  if (m.dominant_speaker && typeof m.dominant_speaker_share === "number" &&
      (m.speaker_participation?.length ?? 0) >= 2) {
    cards.push({
      label: "Airtime",
      value: `${Math.round(m.dominant_speaker_share)}%`,
      caption: String(m.dominant_speaker),
    });
  }
  if (typeof m.questions_asked === "number") {
    cards.push({
      label: "Questions",
      value: `${m.questions_asked}`,
      caption: "asked in the meeting",
    });
  }
  if (typeof m.participation_balance === "number") {
    cards.push({ label: "Balance", value: `${Math.round(m.participation_balance * 100)}%`, caption: "time shared evenly" });
  } else if (typeof m.silence_percentage === "number") {
    cards.push({ label: "Silence", value: `${Math.round(m.silence_percentage)}%`, caption: "of the meeting" });
  } else if (typeof m.words_per_minute === "number") {
    cards.push({ label: "Pace", value: `${m.words_per_minute}`, caption: "words per minute" });
  }
  const glance = cards.slice(0, 4);

  const metricCard = (c?: { label: string; value: string; caption: string }) =>
    !c
      ? `<td width="50%">&nbsp;</td>`
      : `<td width="50%" valign="top" style="padding:0 0 10px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr><td style="background-color:${C.paperCard};border:1px solid ${C.rule};border-radius:10px;padding:13px 15px;">
                        <div style="font-family:${MONO};font-size:10px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:${C.inkFaint};">${c.label}</div>
                        <div style="font-family:${SERIF};font-size:26px;color:${C.ink};line-height:1.15;padding-top:5px;">${c.value}</div>
                        <div style="font-family:${BODY};font-size:12px;color:${C.inkSoft};padding-top:3px;">${c.caption}</div>
                      </td></tr>
                    </table>
                  </td>`;

  const metricRows: string[] = [];
  for (let i = 0; i < glance.length; i += 2) {
    metricRows.push(`<tr>${metricCard(glance[i])}<td width="10">&nbsp;</td>${metricCard(glance[i + 1])}</tr>`);
  }
  const metricsHtml = `<table width="100%" cellpadding="0" cellspacing="0" role="presentation">${metricRows.join("")}</table>`;

  // What the digest leaves out, named so its absence is a choice, not a gap.
  const alsoInReport = [
    (insights?.key_points || []).length ? "key points" : null,
    (insights?.speaker_highlights || []).length ? "speaker highlights" : null,
    (insights?.open_questions || []).length ? "open questions" : null,
    (insights?.follow_ups || []).length ? "follow-ups" : null,
    (insights?.strategic_insights || []).length ? "strategic insights" : null,
    (insights?.timeline_entries || []).length ? "the outline" : null,
    "the transcript",
  ].filter(Boolean) as string[];
  const alsoLine = alsoInReport.length > 1
    ? `${alsoInReport.slice(0, -1).join(", ")} and ${alsoInReport[alsoInReport.length - 1]}`
    : alsoInReport[0];

  const summaryShort = esc(insights?.summary_short || "No summary was produced for this meeting.");

  return emailShell({
    eyebrow: "Meeting summary",
    headline: title,
    meta: `${esc(date)} &nbsp;&middot;&nbsp; ${esc(time)} &nbsp;&middot;&nbsp; ${duration} min`,
    bodyRows: [
      row(panel(
        `<p style="margin:0;font-family:${BODY};font-size:15px;line-height:1.6;color:${C.ink};">${summaryShort}</p>`,
      ), "20px 28px 26px"),
      glance.length ? section("At a glance", metricsHtml) : "",
      actionsHtml ? section("Action items", actionsHtml) : "",
      decisionsHtml ? section("Decisions", decisionsHtml) : "",
      risksHtml ? section("Risks", risksHtml) : "",
    ].join(""),
    cta: { href: `${APP_URL}/meeting/${meetingId}`, label: "Open the full report" },
    ctaNote: `Also in the report: ${alsoLine}.`,
  });
}

function getPriorityColor(priority: string): string {
  switch (priority?.toLowerCase()) {
    case 'high': return '#D7352D';   // --stop
    case 'medium': return '#D6A20A'; // --warn
    case 'low': return '#479C4D';    // --ok
    default: return '#827873';       // --ink-soft
  }
}

/**
 * Subject line. Leads with what the reader gets, not with our own name — the
 * from-address already says EchoBrief, so "[EchoBrief] Meeting Summary" spent
 * the most valuable characters in the inbox restating it.
 */
export function buildSubject(title: string, insights: any): string {
  const name = String(title || "Meeting").trim();
  const short = name.length > 48 ? `${name.slice(0, 47).trimEnd()}\u2026` : name;

  const actions = (insights?.action_items || []).length;
  const decisions = (insights?.decisions || []).length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  const parts: string[] = [];
  if (actions) parts.push(plural(actions, "action item"));
  if (decisions) parts.push(plural(decisions, "decision"));

  return parts.length ? `${short} — ${parts.join(", ")}` : `${short} — meeting summary`;
}
