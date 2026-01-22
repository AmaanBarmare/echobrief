import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const notionClientId = Deno.env.get("NOTION_CLIENT_ID");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!notionClientId) {
      return new Response(
        JSON.stringify({ 
          error: "Notion integration not configured",
          needsSetup: true,
          message: "Please add your Notion Client ID to enable this integration."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { returnTo, origin: clientOrigin } = await req.json();

    // Generate state for CSRF protection
    const state = crypto.randomUUID();
    
    // Store state in database
    await supabase.from("google_oauth_states").insert({
      user_id: user.id,
      state,
      return_to: returnTo || "/settings",
      origin: clientOrigin,
    });

    // Build Notion OAuth URL
    const redirectUri = `${supabaseUrl}/functions/v1/notion-oauth-callback`;
    const authUrl = new URL("https://api.notion.com/v1/oauth/authorize");
    authUrl.searchParams.set("client_id", notionClientId);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("owner", "user");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("state", state);

    return new Response(
      JSON.stringify({ authUrl: authUrl.toString() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Notion OAuth start error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to start Notion OAuth" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
