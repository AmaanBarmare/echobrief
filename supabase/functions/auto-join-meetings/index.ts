import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RECALL_API_KEY = Deno.env.get('RECALL_API_KEY')
const RECALL_API_BASE_URL =
  Deno.env.get('RECALL_API_BASE_URL') || 'https://us-east-1.recall.ai'
const RECALL_BASE_URL = `${RECALL_API_BASE_URL}/api/v1`
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// This function is called by a cron job every minute to check for upcoming meetings
serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    
    // Get all users with auto-join enabled
    const { data: prefs, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('user_id, notetaker_name, join_minutes_before')
      .eq('auto_record', true)

    if (prefsError || !prefs?.length) {
      return new Response(JSON.stringify({ message: 'No users with auto-join enabled', error: prefsError }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const results = []

    for (const pref of prefs) {
      // Get user's OAuth tokens
      const { data: tokens } = await supabase
        .from('user_oauth_tokens')
        .select('google_access_token, google_refresh_token, google_token_expiry')
        .eq('user_id', pref.user_id)
        .single()

      if (!tokens?.google_access_token) continue

      // Check if token needs refresh
      let accessToken = tokens.google_access_token
      if (tokens.google_token_expiry && new Date(tokens.google_token_expiry) < new Date()) {
        // Token expired, need to refresh
        const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID')
        const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
        
        if (tokens.google_refresh_token && googleClientId && googleClientSecret) {
          const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              refresh_token: tokens.google_refresh_token,
              client_id: googleClientId,
              client_secret: googleClientSecret,
              grant_type: 'refresh_token',
            }),
          })
          const refreshData = await refreshResponse.json()
          if (refreshData.access_token) {
            accessToken = refreshData.access_token
            // Update token in DB
            const expiryDate = new Date()
            expiryDate.setSeconds(expiryDate.getSeconds() + (refreshData.expires_in || 3600))
            await supabase
              .from('user_oauth_tokens')
              .update({ 
                google_access_token: accessToken,
                google_token_expiry: expiryDate.toISOString()
              })
              .eq('user_id', pref.user_id)
          }
        }
      }

      // Get upcoming calendar events (next 5 minutes)
      const now = new Date()
      const joinMinutes = pref.join_minutes_before || 2
      const checkWindow = new Date(now.getTime() + (joinMinutes + 1) * 60 * 1000)
      
      const calendarResponse = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${now.toISOString()}&timeMax=${checkWindow.toISOString()}&singleEvents=true&orderBy=startTime`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      )

      if (!calendarResponse.ok) continue

      const calendarData = await calendarResponse.json()
      const events = calendarData.items || []

      for (const event of events) {
        // Check if event has a meeting link
        const meetingUrl = event.hangoutLink || 
          event.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri

        if (!meetingUrl) continue

        // Check if we already sent a bot to this meeting
        const { data: existingMeeting } = await supabase
          .from('meetings')
          .select('id')
          .eq('user_id', pref.user_id)
          .eq('calendar_event_id', event.id)
          .eq('source', 'auto-join')
          .single()

        if (existingMeeting) continue // Already joined

        // Check if meeting starts within the join window
        const eventStart = new Date(event.start?.dateTime || event.start?.date)
        const minutesUntilStart = (eventStart.getTime() - now.getTime()) / 60000
        
        if (minutesUntilStart > joinMinutes) continue // Not time yet

        // Start the bot!
        const botResponse = await fetch(`${RECALL_BASE_URL}/bot/`, {
          method: 'POST',
          headers: {
            'Authorization': RECALL_API_KEY || '',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            meeting_url: meetingUrl,
            bot_name: pref.notetaker_name || 'EchoBrief Notetaker',
            recording_config: {
              audio_mixed_mp3: {},
            },
          })
        })

        const botData = await botResponse.json()

        if (botResponse.ok && botData.id) {
          // Record the meeting in DB
          await supabase.from('meetings').insert({
            user_id: pref.user_id,
            title: event.summary || 'Untitled Meeting',
            source: 'auto-join',
            calendar_event_id: event.id,
            meeting_link: meetingUrl,
            status: 'recording',
            start_time: eventStart.toISOString(),
            recall_bot_id: botData.id,
          })

          results.push({
            user_id: pref.user_id,
            event: event.summary,
            bot_id: botData.id,
            status: 'joined'
          })
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('auto-join-meetings error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
