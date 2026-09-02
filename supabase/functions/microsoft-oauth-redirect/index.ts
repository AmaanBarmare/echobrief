/**
 * Microsoft's redirect back after the user consents.
 *
 * `verify_jwt = false`: this arrives as a browser navigation from Microsoft
 * with no Authorization header, exactly like `google-oauth-redirect`. The
 * single-use `google_oauth_states` row is what authenticates it — the row was
 * created by `microsoft-oauth-start` against a real session, and is deleted the
 * moment it is used, so a replayed callback authenticates nobody.
 *
 * Unlike Google, tokens go straight into `calendar_connections`. Only Google
 * has to route through the legacy `user_oauth_tokens` table.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from "../_shared/rate-limit.ts";

const TOKEN = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

serve(async (req) => {
  const limit = await checkRateLimit(`ms-oauth-redirect:${getClientIdentifier(req)}`, RATE_LIMITS.AUTH);
  if (!limit.allowed) {
    return new Response(
      `Too many requests. Please wait ${limit.resetIn} seconds and try again.`,
      { status: 429, headers: { "Content-Type": "text/plain", "Retry-After": String(limit.resetIn) } },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (!state) {
    return new Response("Missing session. Start the connection from the app again.", {
      status: 400, headers: { "Content-Type": "text/plain" },
    });
  }

  const { data: stateRow } = await supabase
    .from("google_oauth_states").select("*").eq("state", state).single();
  if (!stateRow) {
    return new Response("Invalid or expired session. Please return to the app and try again.", {
      status: 400, headers: { "Content-Type": "text/plain" },
    });
  }

  const frontendUrl: string | null = stateRow.origin || null;
  const returnTo: string = stateRow.return_to || "/settings";
  // Single use: burn the state before anything else can go wrong with it.
  const burn = () => supabase.from("google_oauth_states").delete().eq("state", state);
  const back = (params: string) =>
    new Response(null, { status: 302, headers: { Location: `${frontendUrl}${returnTo}?${params}` } });

  if (!frontendUrl) {
    await burn();
    return new Response("Missing origin. Please start the connection from the app again.", {
      status: 400, headers: { "Content-Type": "text/plain" },
    });
  }

  if (Date.now() - new Date(stateRow.created_at).getTime() > 30 * 60 * 1000) {
    await burn();
    return back("error=expired_state");
  }
  if (oauthError) {
    await burn();
    return back(`error=${encodeURIComponent(oauthError)}`);
  }
  if (!code) {
    await burn();
    return back("error=no_code");
  }

  const azureClientId = Deno.env.get("AZURE_CLIENT_ID");
  const azureClientSecret = Deno.env.get("AZURE_CLIENT_SECRET");
  if (!azureClientId || !azureClientSecret) {
    await burn();
    return back("error=server_config");
  }

  try {
    const redirectUri = `${supabaseUrl}/functions/v1/microsoft-oauth-redirect`;
    const tokenResponse = await fetch(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: azureClientId,
        client_secret: azureClientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: "offline_access User.Read Calendars.Read",
      }),
    });
    const tokenData = await tokenResponse.json().catch(() => ({}));

    if (!tokenResponse.ok || !tokenData.access_token) {
      // error_description carries the AADSTS code, which is what makes a
      // failed connection diagnosable at all.
      console.error("[microsoft-oauth-redirect] token exchange failed:",
        tokenResponse.status, String(tokenData?.error_description ?? "").slice(0, 200));
      await burn();
      return back(`error=${encodeURIComponent(tokenData?.error ?? "token_exchange_failed")}`);
    }

    const expiry = new Date(Date.now() + (Number(tokenData.expires_in) || 3600) * 1000).toISOString();

    const { error: upsertError } = await supabase
      .from("calendar_connections")
      .upsert({
        user_id: stateRow.user_id,
        provider: "microsoft",
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token ?? null,
        token_expiry: expiry,
        scopes: typeof tokenData.scope === "string" ? tokenData.scope : null,
        needs_reconnect: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,provider" });

    if (upsertError) {
      console.error("[microsoft-oauth-redirect] could not store the grant:", upsertError);
      await burn();
      return back("error=store_failed");
    }

    // Record the calendar so Settings can show what is connected. Best effort:
    // the grant is already saved and auto-join reads calendar_connections, not
    // this table, so a failure here costs a label and nothing else.
    try {
      const me = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (me.ok) {
        const profile = await me.json();
        const address = profile.mail || profile.userPrincipalName || null;
        await supabase.from("calendars").upsert({
          user_id: stateRow.user_id,
          provider: "microsoft",
          calendar_id: address || "outlook-primary",
          calendar_name: address ? `Outlook — ${address}` : "Outlook calendar",
          email: address,
          is_primary: true,
          is_active: true,
        }, { onConflict: "user_id,calendar_id" });
      }
    } catch (err) {
      console.warn("[microsoft-oauth-redirect] calendar label lookup failed:", err);
    }

    await burn();
    return back("microsoft_connected=1");
  } catch (err) {
    console.error("[microsoft-oauth-redirect]", err);
    await burn();
    return back("error=unexpected");
  }
});
