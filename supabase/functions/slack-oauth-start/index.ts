/**
 * Begin connecting a Slack workspace.
 *
 * Mirrors `microsoft-oauth-start` exactly, including the reuse of
 * `google_oauth_states`: that table is named for Google but its shape (state,
 * user_id, return_to, origin) is provider-agnostic, each redirect function only
 * consumes states it created, and the single-use row is what authenticates the
 * browser navigation that comes back.
 *
 * Scopes are the narrowest set that lets the picker work and the post land:
 * `chat:write` to post, `channels:read` + `groups:read` to LIST channels. The
 * old integration asked users to paste a raw channel ID precisely because it
 * had no read scope, and a pasted ID is unverifiable until the first post
 * fails.
 *
 * `chat:write.public` is the fourth, and it is not padding. `chat:write` alone
 * posts only to channels the bot has JOINED, so a user who picks a public
 * channel from the picker — a channel the read scope happily listed — gets
 * `not_in_channel` on their first completed meeting, and the delivery path then
 * clears their choice. The picker would be offering destinations that do not
 * work. Private channels still require an explicit `/invite`, which is the
 * correct boundary: a private room should have to opt in.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { checkRateLimit, getClientIdentifier, createRateLimitResponse, RATE_LIMITS } from "../_shared/rate-limit.ts";

const AUTHORIZE = "https://slack.com/oauth/v2/authorize";
export const SLACK_SCOPES = "chat:write,chat:write.public,channels:read,groups:read";

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const limit = await checkRateLimit(`slack-oauth-start:${getClientIdentifier(req)}`, RATE_LIMITS.OAUTH);
  if (!limit.allowed) return createRateLimitResponse(limit, corsHeaders);

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const returnTo = typeof body?.returnTo === "string" ? body.returnTo : "/settings";
    const origin = (
      typeof body?.origin === "string" ? body.origin : req.headers.get("origin") || ""
    ).trim();
    if (!origin) return json({ error: "Missing origin" }, 400);

    const clientId = Deno.env.get("SLACK_CLIENT_ID");
    if (!clientId) return json({ error: "Slack is not configured yet." }, 503);

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
      console.error("[slack-oauth-start] state insert failed:", insertError);
      return json({ error: "Could not start the connection. Try again." }, 500);
    }

    const redirectUri = `${supabaseUrl}/functions/v1/slack-oauth-redirect`;
    const params = new URLSearchParams({
      client_id: clientId,
      scope: SLACK_SCOPES,
      redirect_uri: redirectUri,
      state,
    });

    return json({ authUrl: `${AUTHORIZE}?${params.toString()}`, redirectUri });
  } catch (err) {
    console.error("[slack-oauth-start]", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
