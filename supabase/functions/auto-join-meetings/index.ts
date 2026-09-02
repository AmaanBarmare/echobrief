import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { authenticate, json } from "../_shared/auth.ts"
import { checkRecordingAllowed, recordUsage } from "../_shared/entitlements.ts"
import { BOT_AVATAR_OUTPUT } from "../_shared/bot-avatar.ts"

const RECALL_API_KEY = Deno.env.get('RECALL_API_KEY')
const RECALL_API_BASE_URL =
  Deno.env.get('RECALL_API_BASE_URL') || 'https://us-east-1.recall.ai'
const RECALL_BASE_URL = `${RECALL_API_BASE_URL}/api/v1`
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Called by a pg_cron job every 5 minutes to auto-join calendar meetings.
// The look-ahead window (joinMinutes) must be >= the cron interval so no
// meeting slips between polls; the per-event dedup guard below prevents the
// wider window from sending duplicate bots on successive runs.
serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Cron-only: pg_cron sends the Vault-sourced service key (see migration
    // 20260831190000_cron_service_auth.sql). This sweep touches every
    // auto-join profile, so nothing short of the service role may run it.
    const caller = await authenticate(req, supabase)
    if (!caller.ok) return caller.response
    if (!caller.isService) return json({ error: 'Service only' }, 403)

    // Get all users with auto-join enabled from profiles table
    const { data: prefs, error: prefsError } = await supabase
      .from('profiles')
      .select('user_id, notetaker_name')
      .eq('auto_join_enabled', true)

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
        const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID')
        const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')

        // Missing client creds is OUR configuration problem, not this user's
        // grant — skip them this tick without touching their profile.
        if (!googleClientId || !googleClientSecret) continue

        if (!tokens.google_refresh_token) {
          // Expired with nothing to refresh with: the grant can never recover
          // on its own. Flag the profile so the UI asks for a reconnect
          // instead of auto-join silently doing nothing forever.
          await supabase
            .from('profiles')
            .update({ google_calendar_connected: false, google_needs_reconnect: true })
            .eq('user_id', pref.user_id)
          continue
        }

        try {
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
          let refreshData: any = null
          try {
            refreshData = await refreshResponse.json()
          } catch {
            refreshData = null
          }
          if (refreshData?.access_token) {
            accessToken = refreshData.access_token
            const expiryDate = new Date()
            expiryDate.setSeconds(expiryDate.getSeconds() + (refreshData.expires_in || 3600))
            await supabase
              .from('user_oauth_tokens')
              .update({
                google_access_token: accessToken,
                google_token_expiry: expiryDate.toISOString()
              })
              .eq('user_id', pref.user_id)
          } else {
            // A parseable non-5xx answer with no access_token (typically
            // invalid_grant) means the grant is dead — flag the profile. A 5xx
            // or non-JSON body is transient: leave the flags alone.
            if (refreshData !== null && refreshResponse.status < 500) {
              await supabase
                .from('profiles')
                .update({ google_calendar_connected: false, google_needs_reconnect: true })
                .eq('user_id', pref.user_id)
            }
            continue
          }
        } catch (refreshErr) {
          // Network error reaching Google: transient, never a profile flip.
          console.warn(`[auto-join] Google token refresh failed for ${pref.user_id}:`, refreshErr)
          continue
        }
      }

      // Look for calendar events starting within the next 7 minutes.
      // Window is > the 5-min cron cadence so every meeting is caught at least
      // one poll before it starts; dedup (below) stops repeat bots.
      const now = new Date()
      const joinMinutes = 7
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
        // Skip events cancelled/deleted on the calendar.
        if (event.status === 'cancelled') continue

        // Only process events with a video meeting link
        const meetingUrl = event.hangoutLink ||
          event.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri

        if (!meetingUrl) continue

        // Only join meetings this user actually intends to attend. Without this
        // filter the bot fired on ANY calendar event carrying a video link —
        // dead recurring series, declined invites, invitations never answered —
        // which is where the bulk of the "no audio captured" results and
        // waiting-room timeouts came from (prod analysis 2026-08-20).
        // Join when the user accepted, or when they own the event and have not
        // declined it (organizers commonly show responseStatus 'accepted', but
        // self-created events sometimes carry no attendee entry at all).
        const selfAttendee = (event.attendees || []).find((a: any) => a.self)
        const responseStatus = selfAttendee?.responseStatus
        const isOwner = event.organizer?.self === true || event.creator?.self === true
        const shouldJoin =
          responseStatus === 'accepted' ||
          (isOwner && responseStatus !== 'declined')

        if (!shouldJoin) {
          console.log(
            `[auto-join] Skipping "${event.summary}" — responseStatus=${responseStatus ?? 'none'}, owner=${isOwner}`,
          )
          continue
        }

        // Only join if the meeting starts within the join window
        const eventStart = new Date(event.start?.dateTime || event.start?.date)
        const minutesUntilStart = (eventStart.getTime() - now.getTime()) / 60000

        if (minutesUntilStart > joinMinutes) continue

        // Determine platform
        let platform = 'unknown'
        if (meetingUrl.includes('teams.microsoft.com')) platform = 'teams'
        else if (meetingUrl.includes('zoom.us')) platform = 'zoom'
        else if (meetingUrl.includes('meet.google.com')) platform = 'google_meet'

        // Plan gate — the same ceiling the manual path enforces, so a user
        // cannot route around their quota by letting the calendar dispatch it.
        // Checked per event, not per user: each claim consumes quota, and a
        // user with two back-to-back meetings can cross the line between them.
        const entitlement = await checkRecordingAllowed(supabase, pref.user_id)
        if (!entitlement.allowed) {
          console.log(
            `[auto-join] Quota reached for ${pref.user_id} (${entitlement.code}), skipping event ${event.id}`,
          )
          results.push({
            user_id: pref.user_id,
            event: event.summary,
            status: 'skipped_quota',
            code: entitlement.code,
          })
          continue
        }

        // Claim the calendar event BEFORE sending a bot. The unique index
        // meetings_autojoin_dedup (migration 20260820150000) makes the database
        // the arbiter: a concurrent invocation that lost the race gets 23505 here
        // and skips. Reading first and inserting only after the bot call is what
        // produced 88 duplicate bots, all created 1-2 s apart.
        const { data: claimed, error: claimError } = await supabase
          .from('meetings')
          .insert({
            user_id: pref.user_id,
            title: event.summary || 'Untitled Meeting',
            source: 'auto-join',
            calendar_event_id: event.id,
            meeting_link: meetingUrl,
            platform,
            status: 'joining',
            start_time: eventStart.toISOString(),
            // Kept so the summary can be copied to allowlisted reviewers on the
            // invite (see _shared/summary-recipients.ts) and so insight
            // generation has real participant names to map speakers onto.
            attendees: event.attendees || [],
          })
          .select('id')
          .single()

        if (claimError || !claimed) {
          // 23505 = unique_violation: another invocation already claimed it.
          if (claimError?.code !== '23505') {
            console.error(`[auto-join] Could not claim event ${event.id}:`, claimError)
          }
          continue
        }

        // Send the bot
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
            // Hard per-meeting ceiling, enforced by Recall itself. Must stay in
            // sync with start-recall-recording.
            automatic_leave: {
              in_call_recording_timeout: entitlement.limits.maxMeetingSeconds,
            },
            // Brand lockup as the bot's camera feed. Must stay in sync with
            // start-recall-recording; regenerate with `npm run brand:avatar`.
            automatic_video_output: BOT_AVATAR_OUTPUT,
            recording_config: {
              audio_mixed_mp3: {},
              // Playback-only mp4, streamed from Recall at view time and never
              // stored by us. Must stay in sync with start-recall-recording.
              video_mixed_mp4: {},
              // 168 h is Recall's free storage ceiling; past it they bill.
              retention: { type: "timed", hours: 168 },
              // Required for speaker-name resolution: without a transcript
              // provider Recall produces no transcript, so sarvam-webhook has
              // no speaker timeline to map SPEAKER_XX onto real participants.
              // Must stay in sync with start-recall-recording.
              transcript: {
                provider: {
                  recallai_streaming: {
                    mode: "prioritize_accuracy",
                  },
                },
              },
            },
          })
        })

        const botData = await botResponse.json()

        if (!botResponse.ok || !botData.id) {
          // Release the claim so a later poll can retry this event.
          console.error(
            `[auto-join] Recall bot creation failed for event ${event.id} (HTTP ${botResponse.status}):`,
            JSON.stringify(botData).substring(0, 300),
          )
          await supabase.from('meetings').delete().eq('id', claimed.id)
          continue
        }

        await supabase
          .from('meetings')
          .update({ status: 'recording', recall_bot_id: botData.id })
          .eq('id', claimed.id)

        await recordUsage(supabase, {
          userId: pref.user_id,
          meetingId: claimed.id,
          kind: 'meeting_started',
          plan: entitlement.plan,
          isOverage: entitlement.isOverage,
        })

        results.push({
          user_id: pref.user_id,
          event: event.summary,
          bot_id: botData.id,
          status: 'joined'
        })
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('auto-join-meetings error:', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
