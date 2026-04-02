import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST' } });
  }

  try {
    const { user_id, access_token } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's calendars
    const { data: calendars } = await supabase
      .from("calendars")
      .select("id, calendar_id")
      .eq("user_id", user_id)
      .eq("is_active", true);

    if (!calendars || calendars.length === 0) {
      return new Response(JSON.stringify({ events: [] }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const now = new Date();
    const maxDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    let allEvents: any[] = [];

    for (const cal of calendars) {
      try {
        const response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.calendar_id)}/events?timeMin=${now.toISOString()}&timeMax=${maxDate.toISOString()}&singleEvents=true&orderBy=startTime`,
          {
            headers: { "Authorization": `Bearer ${access_token}` },
          }
        );

        if (response.ok) {
          const { items } = await response.json();
          if (items) {
            allEvents.push(...items.map((event: any) => ({
              id: event.id,
              title: event.summary || "No title",
              start_time: event.start?.dateTime || event.start?.date,
              end_time: event.end?.dateTime || event.end?.date,
              is_all_day: !event.start?.dateTime,
            })));
          }
        }
      } catch (err) {
        console.error("Error fetching calendar:", err);
      }
    }

    return new Response(JSON.stringify({ events: allEvents }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Server error", events: [] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
});
