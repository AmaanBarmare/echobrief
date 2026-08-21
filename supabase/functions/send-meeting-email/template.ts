/**
 * Summary-email markup.
 *
 * Split out of index.ts so the layout can be imported, rendered and inspected
 * without the module's serve() call trying to bind a port.
 */

export interface EmailData {
  title: string;
  date: string;
  time: string;
  duration: number;
  insights: any;
  meetingId: string;
}

// Exported so the layout can be rendered and inspected without sending mail.
export function buildEmailHtml(data: EmailData): string {
  const { title, date, time, duration, insights, meetingId } = data;
  const appUrl = "https://echobrief.in";

  // Brand palette — brand/COLORS.md "Warm Dispatch". Email supports neither CSS
  // variables nor color-mix(), so every value here is the flat equivalent of a
  // token. The tints come from the `email` block of brand/tokens/colors.json —
  // take them from there rather than eyeballing a new hex.
  const C = {
    orange: "#D93F0B", // --ember
    amber: "#F5C842", // --gold
    orangeDeep: "#B83508", // --ember-deep
    goldInk: "#8A6400", // --gold-ink (gold is 1.5:1 on paper; this is the text-safe gold)
    ink: "#190F0B", // --ink
    body: "#514540", // --ink-mid
    muted: "#827873", // --ink-soft
    faint: "#AAA39F", // --ink-faint
    border: "#E0D5CF", // --rule
    surface: "#FEFBF8", // --paper-card
    page: "#FAF4EF", // --paper
    tint: "#F8E7DF", // ember 7% over paper
    tintBorder: "#F6DED4", // ember 12% over paper
    ring: "#F3CCBD", // ember 22% over paper
    ok: "#479C4D", // --ok
    warn: "#D6A20A", // --warn
    stop: "#D7352D", // --stop
  };
  const GRADIENT = `linear-gradient(135deg, ${C.orange} 0%, ${C.amber} 100%)`;
  // Neither Switzer nor DM Serif Display render in Gmail/Outlook — declare them
  // first so clients that can use them do, and fall back to a system sans.
  const HEAD = "'Switzer',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
  const BODY = "'Switzer',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

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

  // ---------- section scaffolding ----------
  const sectionHeading = (label: string) => `
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td width="4" style="background:${GRADIENT};background-color:${C.orange};border-radius:2px;">&nbsp;</td>
                  <td style="padding-left:10px;font-family:${HEAD};font-size:16px;font-weight:600;color:${C.ink};letter-spacing:-0.01em;">${label}</td>
                </tr>
              </table>`;

  const section = (label: string, inner: string) => `
          <tr>
            <td style="padding:0 28px 28px;">
              ${sectionHeading(label)}
              <div style="height:14px;line-height:14px;">&nbsp;</div>
              ${inner}
            </td>
          </tr>`;

  // Each item in its own bordered box, so a long list stays scannable.
  const itemBox = (content: string, accent = C.border) => `
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:8px;">
                <tr>
                  <td width="3" style="background-color:${accent};border-radius:2px 0 0 2px;">&nbsp;</td>
                  <td style="background-color:${C.surface};border:1px solid ${C.border};border-left:none;border-radius:0 8px 8px 0;padding:12px 14px;font-family:${BODY};font-size:14px;line-height:1.5;color:${C.body};">${content}</td>
                </tr>
              </table>`;

  const emptyNote = (text: string) => `
              <p style="margin:0;font-family:${BODY};font-size:14px;color:${C.muted};">${text}</p>`;

  // ---------- content blocks ----------
  const actionList = (insights?.action_items || []) as any[];
  const actionsHtml = actionList.length
    ? actionList.map((item: any) => {
        const task = esc(item?.task ?? item);
        const owner = item?.owner
          ? `<div style="margin-top:5px;font-size:12px;color:${C.muted};">Owner: <span style="color:${C.orangeDeep};font-weight:500;">${esc(item.owner)}</span></div>`
          : "";
        const priority = item?.priority
          ? ` <span style="font-size:11px;font-weight:600;color:${getPriorityColor(item.priority)};">${esc(String(item.priority).toUpperCase())}</span>`
          : "";
        return itemBox(`<span style="color:${C.ink};font-weight:500;">${task}</span>${priority}${owner}`, C.orange);
      }).join("")
    : emptyNote("No action items identified.");

  const decisionList = (insights?.decisions || []) as any[];
  const decisionsHtml = decisionList.length
    ? decisionList.map((d: any) =>
        itemBox(esc(typeof d === "string" ? d : d?.decision ?? JSON.stringify(d)), C.amber)).join("")
    : emptyNote("No decisions recorded.");

  const questionList = (insights?.open_questions || []) as string[];
  const questionsHtml = questionList.length
    ? questionList.map((q) => itemBox(esc(q), C.muted)).join("")
    : "";

  const riskList = (insights?.risks || []) as string[];
  const risksHtml = riskList.length
    ? riskList.map((r) => itemBox(esc(r), C.stop)).join("")
    : "";

  const strategicList = (insights?.strategic_insights || []) as any[];
  const strategicHtml = strategicList.length
    ? strategicList.map((it: any) => itemBox(
        `${esc(it?.insight ?? it)}${it?.category ? `<div style="margin-top:5px;font-size:11px;text-transform:capitalize;color:${C.muted};">${esc(it.category)}</div>` : ""}`,
        C.amber)).join("")
    : "";

  const highlightList = (insights?.speaker_highlights || []) as any[];
  const highlightsHtml = highlightList.length
    ? highlightList.map((h: any) => itemBox(
        `<span style="color:${C.ink};font-weight:500;">${esc(h?.speaker)}</span><div style="margin-top:4px;">${esc(h?.highlight)}</div>${h?.context ? `<div style="margin-top:4px;font-size:12px;color:${C.muted};">&rarr; ${esc(h.context)}</div>` : ""}`
      )).join("")
    : "";

  const followUpList = (insights?.follow_ups || []) as any[];
  const followUpsHtml = followUpList.length
    ? followUpList.map((f: any) => itemBox(
        `${esc(f?.description ?? f)}<div style="margin-top:5px;font-size:12px;color:${C.muted};">${f?.assignee ? `${esc(f.assignee)} &middot; ` : ""}${esc(f?.type || "follow-up")}</div>`,
        C.orange)).join("")
    : "";

  const keyPointList = (insights?.key_points || []) as string[];
  const keyPointsHtml = keyPointList.length
    ? keyPointList.map((k) => itemBox(esc(k))).join("")
    : "";

  // ---------- metrics as individual cards ----------
  const metrics = insights?.meeting_metrics || {};
  const cards: { label: string; value: string; caption?: string }[] = [];
  if (typeof metrics.total_speaking_seconds === "number") {
    cards.push({ label: "Talk time", value: clock(metrics.total_speaking_seconds),
      caption: typeof metrics.total_words === "number" ? `${metrics.total_words} words` : undefined });
  }
  if (typeof metrics.words_per_minute === "number") {
    cards.push({ label: "Speaking rate", value: `${metrics.words_per_minute}`, caption: "words per minute" });
  }
  if (typeof metrics.silence_percentage === "number") {
    cards.push({ label: "Silence", value: `${Math.round(metrics.silence_percentage)}%`, caption: "of the meeting" });
  }
  if (typeof metrics.turn_count === "number") {
    cards.push({ label: "Speaker turns", value: `${metrics.turn_count}`,
      caption: metrics.turn_count === 1 ? "one continuous speaker" : "hand-offs between speakers" });
  }
  if (typeof metrics.longest_monologue_seconds === "number" && metrics.longest_monologue_speaker) {
    cards.push({ label: "Longest stretch", value: clock(metrics.longest_monologue_seconds),
      caption: `unbroken, ${esc(metrics.longest_monologue_speaker)}` });
  }
  if (typeof metrics.lead_in_silence_seconds === "number" && metrics.lead_in_silence_seconds >= 5) {
    cards.push({ label: "Dead air", value: clock(metrics.lead_in_silence_seconds), caption: "before the first word" });
  }
  if (typeof metrics.participation_balance === "number") {
    cards.push({ label: "Balance", value: `${Math.round(metrics.participation_balance * 100)}%`, caption: "how evenly time was shared" });
  }
  if (typeof metrics.sentiment_score === "number") {
    cards.push({ label: "Sentiment", value: metrics.sentiment_score > 0 ? "Positive" : metrics.sentiment_score < 0 ? "Negative" : "Neutral",
      caption: "tone across the discussion" });
  }

  const metricCard = (c?: { label: string; value: string; caption?: string }) => {
    if (!c) return `<td width="50%" style="padding:0;">&nbsp;</td>`;
    return `<td width="50%" valign="top" style="padding:0 0 10px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr><td style="background-color:${C.surface};border:1px solid ${C.border};border-radius:10px;padding:14px 16px;">
                        <div style="font-family:${BODY};font-size:11px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};">${c.label}</div>
                        <div style="font-family:${HEAD};font-size:24px;font-weight:600;color:${C.ink};line-height:1.2;padding-top:4px;">${c.value}</div>
                        ${c.caption ? `<div style="font-family:${BODY};font-size:12px;color:${C.muted};padding-top:3px;">${c.caption}</div>` : ""}
                      </td></tr>
                    </table>
                  </td>`;
  };

  const metricRows: string[] = [];
  for (let i = 0; i < cards.length; i += 2) {
    metricRows.push(`<tr>${metricCard(cards[i])}<td width="10">&nbsp;</td>${metricCard(cards[i + 1])}</tr>`);
  }
  const metricsHtml = cards.length
    ? `<table width="100%" cellpadding="0" cellspacing="0" role="presentation">${metricRows.join("")}</table>`
    : emptyNote("No metrics available for this meeting.");

  // ---------- who spoke, with a share bar ----------
  const speakers = (Array.isArray(metrics.speaker_participation) ? metrics.speaker_participation : []) as any[];
  const speakerHtml = speakers.map((sp: any, i: number) => {
    const secs = typeof sp.seconds === "number" ? sp.seconds : sp.duration_seconds;
    const pct = typeof sp.percentage === "number" ? Math.round(sp.percentage) : 0;
    const detail = [
      typeof secs === "number" ? clock(secs) : null,
      typeof sp.words_per_minute === "number" ? `${sp.words_per_minute} wpm` : null,
      typeof sp.questions === "number" && sp.questions > 0
        ? `${sp.questions} question${sp.questions === 1 ? "" : "s"}` : null,
    ].filter(Boolean).join(" &middot; ");
    return `
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:${i === speakers.length - 1 ? 0 : 12}px;">
                <tr>
                  <td style="font-family:${BODY};font-size:14px;font-weight:500;color:${C.ink};padding-bottom:6px;">${esc(sp.speaker)}</td>
                  <td align="right" style="font-family:${BODY};font-size:12px;color:${C.muted};padding-bottom:6px;">${detail} &middot; <span style="color:${C.orangeDeep};font-weight:600;">${pct}%</span></td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:0;">
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:${C.border};border-radius:4px;">
                      <tr><td width="${pct}%" style="background:${GRADIENT};background-color:${C.orange};border-radius:4px;height:6px;line-height:6px;font-size:0;">&nbsp;</td><td>&nbsp;</td></tr>
                    </table>
                  </td>
                </tr>
              </table>`;
  }).join("");

  // ---------- timeline (bounded: it is the densest block) ----------
  const timelineEntries = ((insights?.timeline_entries || []) as any[]).slice(0, 8);
  const timelineHtml = timelineEntries.length
    ? `<table width="100%" cellpadding="0" cellspacing="0" role="presentation">${
        timelineEntries.map((e: any) => `
                <tr>
                  <td width="52" valign="top" style="font-family:${BODY};font-size:12px;color:${C.orangeDeep};font-weight:600;padding:0 0 10px 0;white-space:nowrap;">${formatTimestamp(e.timestamp)}</td>
                  <td valign="top" style="font-family:${BODY};font-size:13px;color:${C.body};line-height:1.5;padding:0 0 10px 0;">${e.speaker ? `<span style="color:${C.ink};font-weight:500;">${esc(e.speaker)}</span> — ` : ""}${esc(e.content)}</td>
                </tr>`).join("")
      }</table>`
    : "";

  const summaryShort = esc(insights?.summary_short || "No summary available for this meeting.");
  const summaryDetailed = insights?.summary_detailed ? esc(insights.summary_detailed) : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.page};font-family:${BODY};">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:${C.page};padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;background-color:${C.surface};border:1px solid ${C.border};border-radius:16px;overflow:hidden;">

          <!-- Signature gradient bar -->
          <tr><td style="height:4px;line-height:4px;font-size:0;background:${GRADIENT};background-color:${C.orange};">&nbsp;</td></tr>

          <!-- Logo lockup: concentric mark + wordmark, drawn in HTML so no
               image asset has to load for the brand to be present. -->
          <tr>
            <td style="padding:22px 28px 0;">
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td width="40" valign="middle">
                    <table width="40" cellpadding="0" cellspacing="0" role="presentation" style="width:40px;height:40px;border:1.5px solid ${C.ring};border-radius:50%;">
                      <tr><td align="center" valign="middle" style="height:37px;line-height:37px;font-size:0;">
                        <table cellpadding="0" cellspacing="0" role="presentation" style="width:26px;height:26px;background:${GRADIENT};background-color:${C.orange};border-radius:50%;">
                          <tr><td align="center" valign="middle" style="height:26px;line-height:26px;font-size:0;">
                            <table cellpadding="0" cellspacing="0" role="presentation" style="width:9px;height:9px;background-color:${C.surface};border-radius:50%;">
                              <tr><td style="height:9px;line-height:9px;font-size:0;">&nbsp;</td></tr>
                            </table>
                          </td></tr>
                        </table>
                      </td></tr>
                    </table>
                  </td>
                  <td valign="middle" style="padding-left:10px;font-family:${HEAD};font-size:20px;font-weight:600;letter-spacing:-0.02em;color:${C.ink};">echo<span style="color:${C.orangeDeep};">brief</span></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Meeting title -->
          <tr>
            <td style="padding:20px 28px 0;">
              <h1 style="margin:0;font-family:${HEAD};font-size:26px;font-weight:600;line-height:1.25;letter-spacing:-0.02em;color:${C.ink};">${esc(title)}</h1>
              <p style="margin:8px 0 0;font-family:${BODY};font-size:13px;color:${C.muted};">${esc(date)} &nbsp;&middot;&nbsp; ${esc(time)} &nbsp;&middot;&nbsp; ${duration} min</p>
            </td>
          </tr>

          <!-- Summary -->
          <tr>
            <td style="padding:22px 28px 26px;">
              ${sectionHeading("Executive summary")}
              <div style="height:12px;line-height:12px;">&nbsp;</div>
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr><td style="background-color:${C.tint};border:1px solid ${C.tintBorder};border-radius:12px;padding:16px 18px;">
                  <p style="margin:0;font-family:${BODY};font-size:15px;line-height:1.6;color:${C.ink};">${summaryShort}</p>
                </td></tr>
                ${summaryDetailed ? `<tr><td style="padding:14px 2px 0;"><p style="margin:0;font-family:${BODY};font-size:14px;line-height:1.65;color:${C.body};">${summaryDetailed}</p></td></tr>` : ""}
              </table>
            </td>
          </tr>

          ${section("At a glance", metricsHtml)}
          ${speakerHtml ? section("Who spoke", speakerHtml) : ""}
          ${actionList.length ? section("Action items", actionsHtml) : ""}
          ${decisionList.length ? section("Decisions", decisionsHtml) : ""}
          ${strategicHtml ? section("Strategic insights", strategicHtml) : ""}
          ${keyPointsHtml ? section("Key points", keyPointsHtml) : ""}
          ${highlightsHtml ? section("Speaker highlights", highlightsHtml) : ""}
          ${questionsHtml ? section("Open questions", questionsHtml) : ""}
          ${risksHtml ? section("Risks", risksHtml) : ""}
          ${followUpsHtml ? section("Follow-ups", followUpsHtml) : ""}
          ${timelineHtml ? section("How it unfolded", timelineHtml) : ""}

          <!-- CTA -->
          <tr>
            <td align="center" style="padding:4px 28px 32px;">
              <a href="${appUrl}/meeting/${meetingId}" style="display:inline-block;background:${GRADIENT};background-color:${C.orange};color:#FFFFFF;text-decoration:none;padding:13px 30px;border-radius:12px;font-family:${BODY};font-weight:500;font-size:14px;">Open the full report</a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 28px;background-color:${C.page};border-top:1px solid ${C.border};" align="center">
              <p style="margin:0;font-family:${BODY};font-size:12px;color:${C.muted};">Recorded and summarised by <span style="color:${C.ink};font-weight:500;">echo<span style="color:${C.orangeDeep};">brief</span></span></p>
              <p style="margin:6px 0 0;font-family:${BODY};font-size:12px;">
                <a href="${appUrl}/settings" style="color:${C.muted};text-decoration:underline;">Notification settings</a>
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

function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getTimelineIcon(type: string): string {
  switch (type) {
    case 'topic': return '💬';
    case 'question': return '❓';
    case 'decision': return '✅';
    case 'action': return '📋';
    case 'risk': return '⚠️';
    default: return '•';
  }
}
