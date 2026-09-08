/**
 * Begin connecting Zoho CRM.
 *
 * Same shape as `slack-oauth-start` and `microsoft-oauth-start`, including the
 * reuse of the provider-agnostic `google_oauth_states` row that authenticates
 * the browser redirect coming back.
 *
 * `access_type=offline` is not optional: without it Zoho issues an access token
 * that dies in an hour and no refresh token, and the integration would work
 * perfectly during testing and then stop that afternoon.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { checkRateLimit, getClientIdentifier, createRateLimitResponse, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { accountsHost, ZOHO_SCOPES } from "../_shared/zoho.ts";

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const limit = await checkRateLimit(`zoho-oauth-start:${getClientIdentifier(req)}`, RATE_LIMITS.OAUTH);
  if (!limit.allowed) return createRateLimitResponse(limit, corsHeaders);

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const returnTo = typeof body?.returnTo === "string" ? body.returnTo : "/settings";
    const origin = (
      typeof body?.origin === "string" ? body.origin : req.headers.get("origin") || ""
    ).trim();
    if (!origin) return json({ error: "Missing origin" }, 400);

    const clientId = Deno.env.get("ZOHO_CLIENT_ID");
    if (!clientId) return json({ error: "Zoho is not configured yet." }, 503);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Authorization required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user }, error: userError } =
      await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (userError || !user) return json({ error: "Invalid user token" }, 401);

    const state = crypto.randomUUID();
    const { error: insertError } = await supabase
      .from("google_oauth_states")
      .insert({ state, user_id: user.id, return_to: returnTo, origin });
    if (insertError) {
      console.error("[zoho-oauth-start] state insert failed:", insertError);
      return json({ error: "Could not start the connection. Try again." }, 500);
    }

    const redirectUri = `${supabaseUrl}/functions/v1/zoho-oauth-redirect`;
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      scope: ZOHO_SCOPES,
      redirect_uri: redirectUri,
      // Without offline access there is no refresh token and the grant lasts
      // one hour.
      access_type: "offline",
      // Zoho suppresses the consent screen on a repeat authorisation, and a
      // silent re-auth returns no refresh token — which is indistinguishable
      // from a working reconnect until the first refresh.
      prompt: "consent",
      state,
    });

    return json({
      authUrl: `${accountsHost()}/oauth/v2/auth?${params.toString()}`,
      redirectUri,
    });
  } catch (err) {
    console.error("[zoho-oauth-start]", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
