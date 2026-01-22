import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const notionClientId = Deno.env.get("NOTION_CLIENT_ID");
    const notionClientSecret = Deno.env.get("NOTION_CLIENT_SECRET");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get stored state
    const { data: stateData, error: stateError } = await supabase
      .from("google_oauth_states")
      .select("*")
      .eq("state", state)
      .single();

    if (stateError || !stateData) {
      const redirectUrl = stateData?.origin || "https://echobrief.lovable.app";
      return Response.redirect(`${redirectUrl}/settings?error=invalid_state`, 302);
    }

    const redirectOrigin = stateData.origin || "https://echobrief.lovable.app";
    const returnTo = stateData.return_to || "/settings";

    // Clean up state
    await supabase.from("google_oauth_states").delete().eq("state", state);

    if (error) {
      return Response.redirect(`${redirectOrigin}${returnTo}?error=access_denied`, 302);
    }

    if (!code || !notionClientId || !notionClientSecret) {
      return Response.redirect(`${redirectOrigin}${returnTo}?error=no_code`, 302);
    }

    // Exchange code for access token
    const redirectUri = `${supabaseUrl}/functions/v1/notion-oauth-callback`;
    const credentials = btoa(`${notionClientId}:${notionClientSecret}`);

    const tokenResponse = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Notion token exchange failed:", tokenData);
      return Response.redirect(`${redirectOrigin}${returnTo}?error=token_exchange_failed`, 302);
    }

    // Save Notion connection
    const { error: saveError } = await supabase.from("notion_connections").upsert({
      user_id: stateData.user_id,
      access_token: tokenData.access_token,
      workspace_id: tokenData.workspace_id,
      workspace_name: tokenData.workspace_name,
      bot_id: tokenData.bot_id,
      connected: true,
    }, {
      onConflict: "user_id"
    });

    if (saveError) {
      console.error("Failed to save Notion connection:", saveError);
      return Response.redirect(`${redirectOrigin}${returnTo}?error=save_failed`, 302);
    }

    return Response.redirect(`${redirectOrigin}${returnTo}?notion_connected=true`, 302);
  } catch (error) {
    console.error("Notion OAuth callback error:", error);
    return Response.redirect("https://echobrief.lovable.app/settings?error=server_error", 302);
  }
});
