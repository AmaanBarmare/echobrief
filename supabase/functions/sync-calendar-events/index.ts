import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    let user_id: string;

    try {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) throw new Error("No user");
      user_id = user.id;
    } catch (err) {
      // Fallback: try to decode JWT manually
      const parts = token.split(".");
      if (parts.length !== 3) {
        return new Response(
          JSON.stringify({ error: "Invalid token format" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const payload = JSON.parse(atob(parts[1]));
        user_id = payload.sub;
        if (!user_id) throw new Error("No user ID in token");
      } catch {
        return new Response(
          JSON.stringify({ error: "Invalid token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get Google access token
    const { data: tokenData } = await supabase
      .from("user_oauth_tokens")
      .select("google_access_token")
      .eq("user_id", user_id)
      .single();

    if (!tokenData?.google_access_token) {
      return new Response(
        JSON.stringify({ error: "Google not connected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's calendars
    const { data: calendars } = await supabase
      .from("calendars")
      .select("id, calendar_id")
      .eq("user_id", user_id)
      .eq("is_active", true);

    if (!calendars || calendars.length === 0) {
      return new Response(
        JSON.stringify({ success: true, events: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date();
    const maxDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // Next 30 days

    let allEvents: any[] = [];

    // Fetch events from each calendar
    for (const cal of calendars) {
      try {
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.calendar_id)}/events?` +
          `timeMin=${now.toISOString()}&timeMax=${maxDate.toISOString()}&singleEvents=true&orderBy=startTime`,
          {
            headers: {
              "Authorization": `Bearer ${tokenData.google_access_token}`,
            },
          }
        );

        if (response.ok) {
          const { items } = await response.json();
          if (items) {
            allEvents.push(
              ...items.map((event: any) => ({
                user_id: user_id,
                calendar_id: cal.id,
                event_id: event.id,
                title: event.summary || "No title",
                description: event.description || null,
                start_time: event.start?.dateTime || event.start?.date,
                end_time: event.end?.dateTime || event.end?.date,
                is_all_day: !event.start?.dateTime,
                attendees: event.attendees ? JSON.stringify(event.attendees) : null,
                organizer: event.organizer ? JSON.stringify(event.organizer) : null,
              }))
            );
          }
        }
      } catch (err) {
        console.error(`Failed to fetch events from calendar ${cal.calendar_id}:`, err);
      }
    }

    // Save events to DB
    if (allEvents.length > 0) {
      const { error: saveError } = await supabase
        .from("calendar_events")
        .upsert(allEvents, { onConflict: "user_id,event_id" });

      if (saveError) {
        console.error("Error saving events:", saveError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, events_synced: allEvents.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Sync error:", error);
    return new Response(
      JSON.stringify({ error: "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
