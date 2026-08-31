/**
 * One-click "create the follow-up" — a Google Calendar event on the resolved
 * follow-up date, at the original meeting's time of day (IST), 30 minutes,
 * with the meeting's attendees. Invitations are sent only when the caller
 * explicitly asks (`invite_attendees: true`) — this is outward-facing mail.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, CORS_HEADERS, json } from "../_shared/auth.ts";
import { getGoogleAccessToken, hasCalendarWriteScope, RECONNECT_MESSAGE } from "../_shared/google-token.ts";
import { APP_TIMEZONE } from "../_shared/time.ts";

/** "HH:MM:SS" of an instant in IST. */
function istClock(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIMEZONE, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}:${get("second")}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const caller = await authenticate(req, supabase);
  if (!caller.ok) return caller.response;
  if (caller.isService) return json({ error: "A user session is required" }, 403);

  const body = await req.json().catch(() => ({}));
  const meetingId = String(body.meeting_id ?? "");
  const date = String(body.date ?? "");
  const actionIndex = Number.isInteger(body.action_index) ? Number(body.action_index) : null;
  const inviteAttendees = body.invite_attendees === true;
  const durationMinutes = Math.min(180, Math.max(15, Number(body.duration_minutes) || 30));
  if (!/^[0-9a-f-]{36}$/i.test(meetingId)) return json({ error: "meeting_id must be a uuid" }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: "date must be YYYY-MM-DD" }, 400);

  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, title, start_time, attendees, user_id")
    .eq("id", meetingId)
    .eq("user_id", caller.userId)
    .maybeSingle();
  if (!meeting) return json({ error: "Meeting not found" }, 404);

  // A grant made before 2026-08-31 is read-only; say so before calling Google.
  const { data: grant } = await supabase
    .from("user_oauth_tokens").select("google_scopes").eq("user_id", caller.userId).maybeSingle();
  if (hasCalendarWriteScope(grant?.google_scopes) === false) {
    return json({ error: RECONNECT_MESSAGE, code: "NEEDS_RECONNECT" }, 400);
  }

  const token = await getGoogleAccessToken(supabase, caller.userId);
  if (!token.ok) return json({ error: token.error, code: token.code }, token.code === "SERVER_CONFIG" ? 500 : 400);

  const { data: insights } = await supabase
    .from("meeting_insights")
    .select("id, summary_short, action_items, facts")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const clock = istClock(meeting.start_time);
  const startLocal = `${date}T${clock}`;
  const startMs = new Date(`${startLocal}+05:30`).getTime();
  const endLocal = new Date(startMs + durationMinutes * 60_000)
    .toLocaleString("sv-SE", { timeZone: APP_TIMEZONE }).replace(" ", "T");

  const commitments = (insights?.facts?.commitments ?? []) as Array<{ who?: string | null; what: string; due?: string | null }>;
  const appUrl = Deno.env.get("APP_URL") || "https://www.echobrief.in";
  const description = [
    `Follow-up to "${meeting.title}".`,
    insights?.summary_short ? `\n${insights.summary_short}` : "",
    commitments.length ? `\nCommitments:\n${commitments.map((c) => `• ${c.who ? `${c.who}: ` : ""}${c.what}${c.due ? ` (${c.due})` : ""}`).join("\n")}` : "",
    `\nMeeting notes: ${appUrl}/meeting/${meeting.id}`,
  ].join("\n");

  const attendees = inviteAttendees
    ? ((meeting.attendees ?? []) as Array<{ email?: string }>)
      .map((a) => String(a.email ?? "").trim())
      .filter((e) => e.includes("@"))
      .map((email) => ({ email }))
    : [];

  const event = {
    summary: String(body.title || `Follow-up: ${meeting.title}`).slice(0, 200),
    description,
    start: { dateTime: startLocal, timeZone: APP_TIMEZONE },
    end: { dateTime: endLocal, timeZone: APP_TIMEZONE },
    attendees,
    reminders: { useDefault: true },
  };

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=${inviteAttendees ? "all" : "none"}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(event),
    },
  );
  const created = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[create-followup-event] Google error:", res.status, JSON.stringify(created).slice(0, 300));
    const message = String(created?.error?.message || "");
    // Tokens granted before scopes were recorded reach here with a 403.
    if (res.status === 403 && /insufficient.*scope|insufficientPermissions/i.test(message + JSON.stringify(created?.error?.errors ?? ""))) {
      return json({ error: RECONNECT_MESSAGE, code: "NEEDS_RECONNECT" }, 400);
    }
    return json({ error: message || `Google Calendar returned ${res.status}` }, 502);
  }

  // Remember the link on the action item so the button becomes "Open event".
  if (insights && actionIndex !== null && Array.isArray(insights.action_items) && insights.action_items[actionIndex]) {
    const items = [...insights.action_items];
    items[actionIndex] = { ...items[actionIndex], calendar_event_link: created.htmlLink, calendar_event_id: created.id };
    await supabase.from("meeting_insights").update({ action_items: items }).eq("id", insights.id);
  }

  return json({
    success: true,
    event_id: created.id,
    html_link: created.htmlLink,
    start: created.start,
    invited: attendees.length,
  });
});
