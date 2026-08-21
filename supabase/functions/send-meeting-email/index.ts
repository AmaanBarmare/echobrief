import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

interface EmailRequest {
  meetingId: string;
  recipientEmail?: string;
}

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const { meetingId, recipientEmail }: EmailRequest = await req.json();

    if (!meetingId) {
      return new Response(
        JSON.stringify({ error: "Meeting ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get meeting with insights
    const { data: meeting, error: meetingError } = await supabase
      .from("meetings")
      .select("*")
      .eq("id", meetingId)
      .single();

    if (meetingError || !meeting) {
      console.error("Meeting not found:", meetingError);
      return new Response(
        JSON.stringify({ error: "Meeting not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get insights
    const { data: insights } = await supabase
      .from("meeting_insights")
      .select("*")
      .eq("meeting_id", meetingId)
      .single();

    // Get user email
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", meeting.user_id)
      .single();

    const toEmail = recipientEmail || profile?.email;
    
    if (!toEmail) {
      console.error("No recipient email found");
      return new Response(
        JSON.stringify({ error: "No recipient email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format meeting date
    const meetingDate = new Date(meeting.start_time).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const meetingTime = new Date(meeting.start_time).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const durationMinutes = Math.round((meeting.duration_seconds || 0) / 60);

    // Build email HTML
    const emailHtml = buildEmailHtml({
      title: meeting.title,
      date: meetingDate,
      time: meetingTime,
      duration: durationMinutes,
      insights,
      meetingId
    });

    // Send email via Resend API
    console.log("Sending email to:", toEmail);
    
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "EchoBrief <noreply@echobrief.in>",
        to: [toEmail],
        subject: `[EchoBrief] Meeting Summary – ${meeting.title}`,
        html: emailHtml
      })
    });

    const emailResult = await emailResponse.json();
    console.log("Email sent:", emailResult);

    if (!emailResponse.ok) {
      console.error("Resend API error:", emailResult);
      return new Response(
        JSON.stringify({ error: emailResult.message || "Failed to send email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, emailId: emailResult.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Email error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send email" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

interface EmailData {
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

  // Brand palette — BRAND.md "Warm Ember". Orange/amber gradient on stone
  // neutrals. The gradient is a signature accent, never a large background.
  const C = {
    orange: "#D93F0B", // --ember, the token the app and logo actually use
    amber: "#D4900A",
    orangeDeep: "#B83508", // --ember-deep
    ink: "#1C1917", // Stone 900
    body: "#57534E", // Stone 600
    muted: "#A8A29E", // Stone 400
    border: "#E7E5E4", // Stone 200
    surface: "#FFFFFF",
    page: "#FAFAF9", // Stone 50
    tint: "#FDF4EF", // ember tint, matches the app surface
  };
  const GRADIENT = `linear-gradient(135deg, ${C.orange} 0%, ${C.amber} 100%)`;
  const HEAD = "'Outfit','Segoe UI',Helvetica,Arial,sans-serif";
  const BODY = "'DM Sans','Segoe UI',Helvetica,Arial,sans-serif";

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
    ? riskList.map((r) => itemBox(esc(r), "#EF4444")).join("")
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
                    <table width="40" cellpadding="0" cellspacing="0" role="presentation" style="width:40px;height:40px;border:1.5px solid #F0C3AC;border-radius:50%;">
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
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr><td style="background-color:${C.tint};border:1px solid #F6D8C6;border-radius:12px;padding:16px 18px;">
                  <p style="margin:0;font-family:${BODY};font-size:15px;line-height:1.6;color:${C.ink};">${summaryShort}</p>
                </td></tr>
                ${summaryDetailed ? `<tr><td style="padding:14px 2px 0;"><p style="margin:0;font-family:${BODY};font-size:14px;line-height:1.65;color:${C.body};">${summaryDetailed}</p></td></tr>` : ""}
              </table>
            </td>
          </tr>

          ${section("At a glance", metricsHtml)}
          ${speakerHtml ? section("Who spoke", speakerHtml) : ""}
          ${section("Action items", actionsHtml)}
          ${decisionList.length ? section("Decisions", decisionsHtml) : ""}
          ${keyPointsHtml ? section("Key points", keyPointsHtml) : ""}
          ${questionsHtml ? section("Open questions", questionsHtml) : ""}
          ${risksHtml ? section("Risks", risksHtml) : ""}
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
    case 'high': return '#ef4444';
    case 'medium': return '#f59e0b';
    case 'low': return '#22c55e';
    default: return '#64748b';
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
