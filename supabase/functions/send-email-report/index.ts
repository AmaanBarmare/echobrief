import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts"
import { formatISTDate } from "../_shared/time.ts";
import {
  APP_URL,
  BODY,
  C,
  emailShell,
  escapeHtml,
  MONO,
  panel,
  row,
  section,
} from "../_shared/email-brand.ts";

const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

interface EmailReportRequest {
  meeting_id: string
  user_id: string
  recipient_email: string
  include_transcript?: boolean
}

/**
 * The report a user emails to somebody else from the meeting page.
 *
 * Same shell as the automatic summary (_shared/email-brand.ts) — this used to
 * be a separate design with its own fonts, its own header gradient and a dead
 * *.vercel.app link in the footer, which is exactly the drift the shared shell
 * exists to stop. Content differs from the digest on purpose: whoever was sent
 * this may never have seen the meeting, so key points stay in.
 */
function generateEmailHTML(insights: any, meeting: any): string {
  const esc = escapeHtml
  const summary = insights.summary_short || ''
  const keyPoints = Array.isArray(insights.key_points) ? insights.key_points.slice(0, 5) : []
  const decisions = Array.isArray(insights.decisions) ? insights.decisions.slice(0, 3) : []
  const actionItems = Array.isArray(insights.action_items) ? insights.action_items.slice(0, 5) : []

  const bullet = (content: string, accent: string) => `
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:8px;">
                <tr>
                  <td width="3" style="background-color:${accent};border-radius:2px 0 0 2px;">&nbsp;</td>
                  <td style="background-color:${C.paperCard};border:1px solid ${C.rule};border-left:none;border-radius:0 8px 8px 0;padding:12px 14px;font-family:${BODY};font-size:14px;line-height:1.55;color:${C.inkMid};">${content}</td>
                </tr>
              </table>`

  const keyPointsHtml = keyPoints
    .map((point: unknown) => bullet(esc(point), C.ember))
    .join('')

  const decisionsHtml = decisions
    .map((d: any) => bullet(esc(typeof d === 'string' ? d : d?.decision ?? ''), C.ember))
    .join('')

  const actionItemsHtml = actionItems
    .map((item: any) => {
      const task = typeof item === 'string' ? item : item.task || ''
      const owner = typeof item === 'object' && item.owner ? item.owner : null
      const priority = typeof item === 'object' && item.priority ? item.priority : null
      const ownerHtml = owner
        ? `<div style="margin-top:5px;font-family:${BODY};font-size:12px;color:${C.inkSoft};">Owner: <span style="color:${C.emberDeep};font-weight:600;">${esc(owner)}</span></div>`
        : ''
      const priorityHtml = priority
        ? ` <span style="font-family:${MONO};font-size:10px;font-weight:600;letter-spacing:0.08em;color:${priorityColor(priority)};">${esc(String(priority).toUpperCase())}</span>`
        : ''
      return bullet(
        `<span style="color:${C.ink};font-weight:600;">${esc(task)}</span>${priorityHtml}${ownerHtml}`,
        C.gold,
      )
    })
    .join('')

  return emailShell({
    eyebrow: 'Meeting report',
    headline: meeting.title,
    meta: esc(
      formatISTDate(meeting.start_time, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    ),
    bodyRows: [
      summary
        ? row(
          panel(
            `<p style="margin:0;font-family:${BODY};font-size:15px;line-height:1.6;color:${C.ink};">${esc(summary)}</p>`,
          ),
          '20px 28px 26px',
        )
        : '',
      keyPointsHtml ? section('Key points', keyPointsHtml) : '',
      decisionsHtml ? section('Decisions', decisionsHtml) : '',
      actionItemsHtml ? section('Action items', actionItemsHtml) : '',
    ].join(''),
    cta: { href: `${APP_URL}/meeting/${meeting.id}`, label: 'Open the full report' },
    ctaNote: 'The transcript, timeline and the rest of the analysis are on the report page.',
  })
}

function priorityColor(priority: string): string {
  switch (String(priority).toLowerCase()) {
    case 'high': return C.stop
    case 'medium': return C.warn
    case 'low': return C.ok
    default: return C.inkSoft
  }
}

async function sendViaResend(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY not configured')
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'EchoBrief <noreply@echobrief.in>',
      to,
      subject,
      html,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Resend API error: ${response.status} ${error}`)
  }

  const data = await response.json()
  return {
    success: true,
    messageId: data.id,
  }
}

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req)
  if (corsResponse) return corsResponse

  const origin = req.headers.get("origin")
  const corsHeaders = getCorsHeaders(origin)

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const {
      meeting_id,
      user_id,
      recipient_email,
      include_transcript = false,
    }: EmailReportRequest = await req.json()

    if (!meeting_id || !recipient_email) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: meeting_id, recipient_email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Sending email report for meeting ${meeting_id} to ${recipient_email}`)

    // Fetch meeting
    const { data: meeting, error: meetingError } = await supabaseClient
      .from('meetings')
      .select('*')
      .eq('id', meeting_id)
      .single()

    if (meetingError || !meeting) {
      throw new Error('Meeting not found')
    }

    // Fetch insights
    const { data: insights, error: insightsError } = await supabaseClient
      .from('meeting_insights')
      .select('*')
      .eq('meeting_id', meeting_id)
      .single()

    if (insightsError || !insights) {
      throw new Error('No insights found for this meeting')
    }

    // Generate HTML
    const html = generateEmailHTML(insights, meeting)

    // Send via Resend
    // Subject matches the summary mail's shape: what the reader gets first,
    // not our own name — the from-address already says EchoBrief.
    const subject = `${meeting.title} \u2014 meeting report`

    const sendResult = await sendViaResend(recipient_email, subject, html)

    if (!sendResult.success) {
      throw new Error(sendResult.error || 'Failed to send email')
    }

    console.log(`Email sent to ${recipient_email}, message ID: ${sendResult.messageId}`)

    // Log email delivery
    const { error: logError } = await supabaseClient
      .from('email_messages')
      .insert({
        meeting_id,
        recipient_email,
        subject,
        status: 'sent',
        message_id: sendResult.messageId,
        sent_at: new Date().toISOString(),
      })

    if (logError) {
      console.warn('Failed to log email delivery:', logError.message)
      // Don't fail the request, email was already sent
    }

    return new Response(
      JSON.stringify({
        success: true,
        meeting_id,
        recipient_email,
        message_id: sendResult.messageId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('Email report error:', error.message)

    return new Response(
      JSON.stringify({
        error: error.message,
        success: false,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
