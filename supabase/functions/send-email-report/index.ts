import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts"
import { authenticate } from "../_shared/auth.ts";
import { isValidEmail } from "../_shared/validation.ts";
import { generateEmailHTML } from "./template.ts";

const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

// Any body user_id is deliberately ignored — identity comes from the JWT.
interface EmailReportRequest {
  meeting_id: string
  recipient_email: string
  include_transcript?: boolean
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
    // verify_jwt = true: the gateway has verified the JWT signature.
    const caller = await authenticate(req, supabaseClient, corsHeaders)
    if (!caller.ok) return caller.response

    const {
      meeting_id,
      recipient_email,
      include_transcript = false,
    }: EmailReportRequest = await req.json()

    if (!meeting_id || !recipient_email) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: meeting_id, recipient_email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!isValidEmail(recipient_email)) {
      return new Response(
        JSON.stringify({ error: 'recipient_email is not a valid email address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Sending email report for meeting ${meeting_id} to ${recipient_email}`)

    // Fetch meeting (a user token can only send reports for its own meetings)
    let meetingQuery = supabaseClient
      .from('meetings')
      .select('*')
      .eq('id', meeting_id)
    if (!caller.isService) meetingQuery = meetingQuery.eq('user_id', caller.userId)
    const { data: meeting, error: meetingError } = await meetingQuery.single()

    if (meetingError || !meeting) {
      return new Response(
        JSON.stringify({ error: 'Meeting not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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
