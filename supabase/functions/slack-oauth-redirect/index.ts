/**
 * Slack's redirect back after the user installs the app.
 *
 * `verify_jwt = false`: this arrives as a browser navigation from Slack with no
 * Authorization header, exactly like `google-oauth-redirect` and
 * `microsoft-oauth-redirect`. The single-use `google_oauth_states` row created
 * by `slack-oauth-start` against a real session is what authenticates it, and
 * it is burned the moment it is used, so a replayed callback authenticates
 * nobody.
 *
 * The bot token lands SEALED in `slack_connections.access_token` —
 * `sealConnectionTokens` works unchanged here because that table deliberately
 * uses the same `access_token` / `refresh_token` column names as
 * `calendar_connections`.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { sealConnectionTokens } from "../_shared/oauth-tokens.ts";
import { exchangeCode, SlackError } from "../_shared/slack.ts";

serve(async (req) => {
  const limit = await checkRateLimit(`slack-oauth-redirect:${getClientIdentifier(req)}`, RATE_LIMITS.AUTH);
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

  const clientId = Deno.env.get("SLACK_CLIENT_ID");
  const clientSecret = Deno.env.get("SLACK_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    await burn();
    return back("error=server_config");
  }

  try {
    const redirectUri = `${supabaseUrl}/functions/v1/slack-oauth-redirect`;
    const tokens = await exchangeCode(clientId, clientSecret, code, redirectUri);

    if (!tokens.access_token || !tokens.team_id) {
      await burn();
      return back("error=token_exchange_failed");
    }

    // Which workspace was connected before, if any. A user who reconnects to a
    // DIFFERENT workspace must not keep the old channel_id: the id would still
    // look configured while pointing at a channel this token cannot see, and
    // the failure would only surface on the next completed meeting.
    const { data: existing } = await supabase
      .from("slack_connections")
      .select("id, team_id")
      .eq("user_id", stateRow.user_id)
      .maybeSingle();
    const sameWorkspace = existing?.team_id === tokens.team_id;

    const payload: Record<string, unknown> = {
      user_id: stateRow.user_id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      // Slack only issues expires_in when the workspace has token rotation on.
      token_expiry: tokens.expires_in
        ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
        : null,
      scopes: tokens.scope ?? null,
      team_id: tokens.team_id,
      team_name: tokens.team_name ?? null,
      bot_user_id: tokens.bot_user_id ?? null,
      authed_user_id: tokens.authed_user_id ?? null,
      needs_reconnect: false,
      updated_at: new Date().toISOString(),
    };
    if (!sameWorkspace) {
      payload.channel_id = null;
      payload.channel_name = null;
    }

    const { error: upsertError } = await supabase
      .from("slack_connections")
      .upsert(await sealConnectionTokens(payload), { onConflict: "user_id" });

    if (upsertError) {
      console.error("[slack-oauth-redirect] could not store the grant:", upsertError);
      await burn();
      return back("error=store_failed");
    }

    await burn();
    // `slack_connected=1` lands Settings on the channel picker: connecting the
    // workspace is only half the job, and a connection with no channel posts
    // nothing.
    return back("slack_connected=1");
  } catch (err) {
    const code = err instanceof SlackError ? err.slackCode : "unexpected";
    console.error("[slack-oauth-redirect]", code, err);
    await burn();
    return back(`error=${encodeURIComponent(code)}`);
  }
});
