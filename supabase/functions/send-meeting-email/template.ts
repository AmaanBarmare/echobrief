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
 * Colours and tints are lifted from brand/tokens/colors.json (the `email` block
 * holds flat, pre-composited tints because mail clients support neither CSS
 * variables nor color-mix). Type is the brand stack from brand/TYPOGRAPHY.md.
 * Do not eyeball a new hex here.
 */
export interface EmailData {
  title: string;
  date: string;
  time: string;
  duration: number;
  insights: any;
  meetingId: string;
}

// Warm Dispatch — brand/COLORS.md
const C = {
  ember: "#D93F0B",
  emberDeep: "#B83508", // the only ember safe for small text on paper
  gold: "#F5C842",
  paper: "#FAF4EF",
  paperCard: "#FEFBF8",
  ink: "#190F0B",
  inkMid: "#514540",
  inkSoft: "#827873",
  inkFaint: "#AAA39F",
  rule: "#E0D5CF",
  ruleSoft: "#EFE6E0",
  emberTint: "#F8E7DF", // ember-7-on-paper
  emberTintEdge: "#F3CCBD", // ember-22-on-paper
  goldTint: "#F9EFDA", // gold-12-on-paper
  stop: "#D7352D",
};
const GRADIENT = `linear-gradient(135deg, ${C.ember} 0%, ${C.gold} 100%)`;
const SERIF = "'DM Serif Display',Georgia,'Times New Roman',serif";
const BODY = "'Manrope',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const MONO = "'IBM Plex Mono',Consolas,'Courier New',monospace";
const LOCKUP = "https://www.echobrief.in/echobrief-lockup-light.png";

export function buildEmailHtml(data: EmailData): string {
  const { title, date, time, duration, insights, meetingId } = data;
  const appUrl = "https://echobrief.in";

  // Model-written text lands in HTML; escape it so a stray angle bracket
  // cannot break the layout of an email we cannot edit once sent.
  const esc = (v: unknown) =>
    String(v ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const clock = (seconds: number) => {
    const total = Math.round(seconds);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  };

  const sectionHeading = (label: string) => `
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td width="3" style="background:${GRADIENT};background-color:${C.ember};border-radius:2px;">&nbsp;</td>
                  <td style="padding-left:10px;font-family:${MONO};font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:${C.inkSoft};">${label}</td>
                </tr>
              </table>`;

  const section = (label: string, inner: string) => `
          <tr>
            <td style="padding:0 28px 26px;">
              ${sectionHeading(label)}
              <div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>
              ${inner}
            </td>
          </tr>`;

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
    const owner = item?.owner
      ? `<div style="margin-top:5px;font-family:${BODY};font-size:12px;color:${C.inkSoft};">Owner: <span style="color:${C.emberDeep};font-weight:600;">${esc(item.owner)}</span></div>`
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
  if (typeof m.words_per_minute === "number") {
    cards.push({ label: "Pace", value: `${m.words_per_minute}`, caption: "words per minute" });
  }
  if (typeof m.silence_percentage === "number") {
    cards.push({ label: "Silence", value: `${Math.round(m.silence_percentage)}%`, caption: "of the meeting" });
  }
  if (typeof m.participation_balance === "number") {
    cards.push({ label: "Balance", value: `${Math.round(m.participation_balance * 100)}%`, caption: "time shared evenly" });
  } else if (typeof m.turn_count === "number") {
    cards.push({ label: "Turns", value: `${m.turn_count}`,
      caption: m.turn_count === 1 ? "one speaker throughout" : "hand-offs" });
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
    (insights?.timeline_entries || []).length ? "the full timeline" : null,
    "the transcript",
  ].filter(Boolean) as string[];
  const alsoLine = alsoInReport.length > 1
    ? `${alsoInReport.slice(0, -1).join(", ")} and ${alsoInReport[alsoInReport.length - 1]}`
    : alsoInReport[0];

  const summaryShort = esc(insights?.summary_short || "No summary was produced for this meeting.");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Manrope:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background-color:${C.paper};font-family:${BODY};">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:${C.paper};padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;background-color:${C.paperCard};border:1px solid ${C.rule};border-radius:16px;overflow:hidden;">

          <tr><td style="height:4px;line-height:4px;font-size:0;background:${GRADIENT};background-color:${C.ember};">&nbsp;</td></tr>

          <tr>
            <td style="padding:24px 28px 0;">
              <img src="${LOCKUP}" width="150" height="57" alt="EchoBrief" style="display:block;border:0;outline:none;width:150px;height:auto;">
            </td>
          </tr>

          <tr>
            <td style="padding:22px 28px 0;">
              <div style="font-family:${MONO};font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:${C.inkFaint};">Meeting summary</div>
              <h1 style="margin:8px 0 0;font-family:${SERIF};font-size:30px;font-weight:400;line-height:1.2;color:${C.ink};">${esc(title)}</h1>
              <p style="margin:8px 0 0;font-family:${BODY};font-size:13px;color:${C.inkSoft};">${esc(date)} &nbsp;&middot;&nbsp; ${esc(time)} &nbsp;&middot;&nbsp; ${duration} min</p>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 28px 26px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr><td style="background-color:${C.emberTint};border:1px solid ${C.emberTintEdge};border-radius:12px;padding:16px 18px;">
                  <p style="margin:0;font-family:${BODY};font-size:15px;line-height:1.6;color:${C.ink};">${summaryShort}</p>
                </td></tr>
              </table>
            </td>
          </tr>

          ${glance.length ? section("At a glance", metricsHtml) : ""}
          ${actionsHtml ? section("Action items", actionsHtml) : ""}
          ${decisionsHtml ? section("Decisions", decisionsHtml) : ""}
          ${risksHtml ? section("Risks", risksHtml) : ""}

          <tr>
            <td align="center" style="padding:6px 28px 10px;">
              <a href="${appUrl}/meeting/${meetingId}" style="display:inline-block;background:${GRADIENT};background-color:${C.ember};color:#FFFFFF;text-decoration:none;padding:13px 32px;border-radius:12px;font-family:${BODY};font-weight:600;font-size:14px;">Open the full report</a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 40px 30px;">
              <p style="margin:0;font-family:${BODY};font-size:12px;line-height:1.5;color:${C.inkFaint};">Also in the report: ${alsoLine}.</p>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:18px 28px;background-color:${C.paper};border-top:1px solid ${C.ruleSoft};">
              <p style="margin:0;font-family:${BODY};font-size:12px;color:${C.inkSoft};">Recorded and summarised by <span style="font-family:${SERIF};color:${C.ink};">echo<span style="font-style:italic;color:${C.emberDeep};">brief</span></span></p>
              <p style="margin:6px 0 0;font-family:${BODY};font-size:12px;">
                <a href="${appUrl}/settings" style="color:${C.inkFaint};text-decoration:underline;">Notification settings</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
