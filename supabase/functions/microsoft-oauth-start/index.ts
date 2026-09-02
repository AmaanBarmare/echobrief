/**
 * Begin connecting a Microsoft (Outlook) calendar.
 *
 * Mirrors `google-oauth-start`. The single-use row in `google_oauth_states` is
 * what authenticates the browser redirect that comes back — that table is
 * named for Google but its shape (state, user_id, return_to, origin) is
 * provider-agnostic, and each redirect function only ever consumes states it
 * created, so reusing it needs no schema change.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { checkRateLimit, getClientIdentifier, createRateLimitResponse, RATE_LIMITS } from "../_shared/rate-limit.ts";

// `common` accepts both work/school accounts and personal Microsoft accounts,
// and matches the multitenant + personal registration in Azure. A single-tenant
// endpoint here would only ever work for our own tenant.
const AUTHORIZE = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const limit = await checkRateLimit(`ms-oauth-start:${getClientIdentifier(req)}`, RATE_LIMITS.OAUTH);
  if (!limit.allowed) return createRateLimitResponse(limit, corsHeaders);

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const returnTo = typeof body?.returnTo === "string" ? body.returnTo : "/settings";
    const origin = (
      typeof body?.origin === "string" ? body.origin : req.headers.get("origin") || ""
    ).trim();
    if (!origin) return json({ error: "Missing origin" }, 400);

    const azureClientId = Deno.env.get("AZURE_CLIENT_ID");
    if (!azureClientId) return json({ error: "Microsoft sign-in is not configured yet." }, 503);

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
      console.error("[microsoft-oauth-start] state insert failed:", insertError);
      return json({ error: "Could not start the connection. Try again." }, 500);
    }

    const redirectUri = `${supabaseUrl}/functions/v1/microsoft-oauth-redirect`;
    const params = new URLSearchParams({
      client_id: azureClientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      // Narrowest set that covers what we call: read the user's events, and
      // keep a refresh token so auto-join works when nobody is at the browser.
      // Calendars.ReadWrite is deliberately not requested — nothing writes to
      // an Outlook calendar yet.
      scope: "offline_access User.Read Calendars.Read",
      state,
    });

    return json({ authUrl: `${AUTHORIZE}?${params.toString()}`, redirectUri });
  } catch (err) {
    console.error("[microsoft-oauth-start]", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
