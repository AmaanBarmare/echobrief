import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseClient = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

interface DigestRequest {
  user_id: string
  frequency: 'weekly' | 'monthly' | 'manual'
  period_start?: string // ISO date
  period_end?: string // ISO date
  recipient_emails: string[]
}

function generateDigestHTML(
  meetings: any[],
  insights: any[],
  period: { start: string; end: string }
): string {
  const totalMeetings = meetings.length
  const totalActionItems = insights.reduce((sum, i) => sum + (Array.isArray(i.action_items) ? i.action_items.length : 0), 0)
  const totalDecisions = insights.reduce((sum, i) => sum + (Array.isArray(i.decisions) ? i.decisions.length : 0), 0)

  // Group meetings by date
  const meetingsByDate = meetings.reduce((acc: any, m: any) => {
    const date = new Date(m.start_time).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    if (!acc[date]) acc[date] = []
    acc[date].push(m)
    return acc
  }, {})

  // Aggregate action items
  const allActionItems: any[] = []
  insights.forEach((i: any) => {
    if (Array.isArray(i.action_items)) {
      i.action_items.forEach((item: any) => {
        allActionItems.push({
          ...item,
          meeting_id: i.meeting_id,
          meeting_title: meetings.find(m => m.id === i.meeting_id)?.title || 'Unknown Meeting'
        })
      })
    }
  })

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; line-height: 1.6; }
    .container { max-width: 700px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #F97316, #F59E0B); padding: 30px; border-radius: 8px; color: white; margin-bottom: 30px; }
    .header h1 { margin: 0; font-size: 28px; }
    .header p { margin: 5px 0 0 0; opacity: 0.9; font-size: 14px; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px; }
    .stat-box { background: #FFF7ED; padding: 20px; border-radius: 6px; border-left: 4px solid #F97316; }
    .stat-number { font-size: 28px; font-weight: bold; color: #F97316; }
    .stat-label { font-size: 12px; color: #78716C; margin-top: 5px; }
    .section { margin-bottom: 30px; }
    .section-title { font-size: 16px; font-weight: 600; color: #1C1917; margin-bottom: 12px; border-bottom: 2px solid #F97316; padding-bottom: 8px; }
    .meeting-group { margin-bottom: 20px; }
    .meeting-date { font-size: 13px; font-weight: 600; color: #F97316; margin-bottom: 8px; }
    .meeting-item { background: #f5f5f5; padding: 12px; border-radius: 4px; margin-bottom: 8px; }
    .meeting-title { font-weight: 600; color: #1C1917; }
    .meeting-summary { font-size: 13px; color: #666; margin-top: 4px; }
    .action-item { background: #f9f9f9; padding: 12px; border-radius: 4px; margin-bottom: 8px; border-left: 3px solid #22C55E; }
    .action-task { font-weight: 500; color: #1C1917; }
    .action-meta { font-size: 12px; color: #999; margin-top: 4px; }
    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Meeting Digest Report</h1>
      <p>${period.start} to ${period.end}</p>
    </div>

    <div class="stats">
      <div class="stat-box">
        <div class="stat-number">${totalMeetings}</div>
        <div class="stat-label">Meetings</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${totalActionItems}</div>
        <div class="stat-label">Action Items</div>
      </div>
      <div class="stat-box">
        <div class="stat-number">${totalDecisions}</div>
        <div class="stat-label">Decisions</div>
      </div>
    </div>

    ${totalMeetings > 0 ? `
    <div class="section">
      <div class="section-title">📅 Meetings This Period</div>
      ${Object.entries(meetingsByDate).map(([date, mtgs]: [string, any]) => `
        <div class="meeting-group">
          <div class="meeting-date">${date}</div>
          ${(mtgs as any[]).map((m: any) => {
            const insight = insights.find((i: any) => i.meeting_id === m.id)
            return `
            <div class="meeting-item">
              <div class="meeting-title">${m.title}</div>
              ${insight?.summary_short ? `<div class="meeting-summary">${insight.summary_short}</div>` : ''}
            </div>
            `
          }).join('')}
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${allActionItems.length > 0 ? `
    <div class="section">
      <div class="section-title">✅ Action Items</div>
      ${allActionItems.map((item: any) => `
        <div class="action-item">
          <div class="action-task">${typeof item === 'string' ? item : item.task || item}</div>
          <div class="action-meta">
            📌 ${item.meeting_title}
            ${item.owner ? ` • Assigned to ${item.owner}` : ''}
            ${item.priority ? ` • ${item.priority} priority` : ''}
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <div class="footer">
      <p>Generated by EchoBrief • ${new Date().toLocaleDateString()}</p>
      <p style="margin-top: 10px;"><a href="https://echobrief-ten.vercel.app" style="color: #F97316; text-decoration: none;">View full reports →</a></p>
    </div>
  </div>
</body>
</html>
`.trim()
}

async function sendViaResend(
  to: string[],
  subject: string,
  html: string
): Promise<{ success: boolean; messageIds: string[]; error?: string }> {
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY not configured')
  }

  const messageIds: string[] = []

  for (const email of to) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'EchoBrief <noreply@echobrief.in>',
        to: email,
        subject,
        html,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.warn(`Failed to send to ${email}: ${response.status} ${error}`)
      continue
    }

    const data = await response.json()
    if (data.id) {
      messageIds.push(data.id)
    }
  }

  if (messageIds.length === 0) {
    throw new Error('Failed to send to any recipients')
  }

  return {
    success: true,
    messageIds,
  }
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const {
      user_id,
      frequency = 'manual',
      period_start,
      period_end,
      recipient_emails = [],
    }: DigestRequest = await req.json()

    if (!user_id || recipient_emails.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: user_id, recipient_emails' }),
        { status: 400 }
      )
    }

    console.log(`Generating ${frequency} digest for user ${user_id}`)

    // Determine period
    let start = period_start
    let end = period_end

    if (!start || !end) {
      const now = new Date()
      if (frequency === 'weekly') {
        // Last 7 days
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
        end = now.toISOString()
      } else if (frequency === 'monthly') {
        // Last 30 days
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
        end = now.toISOString()
      } else {
        // Last week for manual
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
        end = now.toISOString()
      }
    }

    // Fetch meetings in period
    const { data: meetings, error: meetingsError } = await supabaseClient
      .from('meetings')
      .select('*')
      .eq('user_id', user_id)
      .gte('start_time', start)
      .lte('start_time', end)
      .order('start_time', { ascending: false })

    if (meetingsError) {
      throw new Error(`Failed to fetch meetings: ${meetingsError.message}`)
    }

    if (!meetings || meetings.length === 0) {
      console.log('No meetings in period')
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No meetings in this period',
          meetings_count: 0,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Fetch insights for these meetings
    const meetingIds = meetings.map((m: any) => m.id)
    const { data: insights, error: insightsError } = await supabaseClient
      .from('meeting_insights')
      .select('*')
      .in('meeting_id', meetingIds)

    if (insightsError) {
      console.warn(`Failed to fetch insights: ${insightsError.message}`)
    }

    const insightsData = insights || []

    // Generate HTML
    const startFormatted = new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const endFormatted = new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const html = generateDigestHTML(meetings, insightsData, { start: startFormatted, end: endFormatted })

    // Send via Resend
    const sendResult = await sendViaResend(
      recipient_emails,
      `${frequency === 'weekly' ? 'Weekly' : frequency === 'monthly' ? 'Monthly' : 'Meeting'} Digest Report`,
      html
    )

    // Log the digest report
    const { error: logError } = await supabaseClient
      .from('digest_reports')
      .insert({
        user_id,
        frequency,
        period_start: start,
        period_end: end,
        meetings_count: meetings.length,
        insights_summary: {
          action_items: insightsData.reduce((sum, i) => sum + (Array.isArray(i.action_items) ? i.action_items.length : 0), 0),
          decisions: insightsData.reduce((sum, i) => sum + (Array.isArray(i.decisions) ? i.decisions.length : 0), 0),
        },
        recipient_emails,
        status: 'sent',
        message_ids: sendResult.messageIds,
        sent_at: new Date().toISOString(),
      })

    if (logError) {
      console.warn('Failed to log digest report:', logError.message)
    }

    console.log(`Digest sent to ${recipient_emails.length} recipients`)

    return new Response(
      JSON.stringify({
        success: true,
        frequency,
        meetings_count: meetings.length,
        recipients: recipient_emails.length,
        message_ids: sendResult.messageIds,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('Digest report error:', error.message)

    return new Response(
      JSON.stringify({
        error: error.message,
        success: false,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
