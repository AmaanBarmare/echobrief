/**
 * Zoho's redirect back after the user consents.
 *
 * `verify_jwt = false`: a browser navigation from Zoho carries no Authorization
 * header. The single-use `google_oauth_states` row created by
 * `zoho-oauth-start` against a real session authenticates it, and is burned on
 * use.
 *
 * Zoho adds two query parameters the other providers do not: `location` (the
 * datacentre code) and `accounts-server`. They matter — see `_shared/zoho.ts`
 * on the datacentre trap. The domain the grant works in is stored beside the
 * token, never assumed.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { sealConnectionTokens } from "../_shared/oauth-tokens.ts";
import { exchangeCode, fetchOrg, ZohoError } from "../_shared/zoho.ts";

serve(async (req) => {
  const limit = await checkRateLimit(`zoho-oauth-redirect:${getClientIdentifier(req)}`, RATE_LIMITS.AUTH);
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
  const location = url.searchParams.get("location");
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

  const clientId = Deno.env.get("ZOHO_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOHO_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    await burn();
    return back("error=server_config");
  }

  try {
    const redirectUri = `${supabaseUrl}/functions/v1/zoho-oauth-redirect`;
    const tokens = await exchangeCode(clientId, clientSecret, code, redirectUri, location);

    if (!tokens.access_token) {
      await burn();
      return back("error=token_exchange_failed");
    }
    if (!tokens.refresh_token) {
      // Without a refresh token the connection dies in an hour. Better to fail
      // the connect loudly than to store a grant that stops working after lunch.
      await burn();
      return back("error=no_refresh_token");
    }

    // Best effort, and never allowed to fail the grant: it is only a label.
    const org = await fetchOrg(tokens.api_domain, tokens.access_token);

    const { error: upsertError } = await supabase
      .from("zoho_connections")
      .upsert(await sealConnectionTokens({
        user_id: stateRow.user_id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expiry: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
        scopes: tokens.scope ?? null,
        location: location ?? null,
        api_domain: tokens.api_domain,
        org_id: org?.id ?? null,
        org_name: org?.name ?? null,
        needs_reconnect: false,
        updated_at: new Date().toISOString(),
      }), { onConflict: "user_id" });

    if (upsertError) {
      console.error("[zoho-oauth-redirect] could not store the grant:", upsertError);
      await burn();
      return back("error=store_failed");
    }

    await burn();
    return back("zoho_connected=1");
  } catch (err) {
    const code = err instanceof ZohoError ? err.code : "unexpected";
    console.error("[zoho-oauth-redirect]", code, err);
    await burn();
    return back(`error=${encodeURIComponent(code)}`);
  }
});
