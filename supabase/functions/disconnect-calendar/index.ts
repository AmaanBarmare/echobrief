/**
 * Disconnect a calendar provider.
 *
 * Only Microsoft today — Google keeps `disconnect-google`, which also revokes
 * the grant at Google and clears the legacy columns and profile flags. Pointing
 * both at one function would mean rewriting that path, and the Google
 * integration is the one that must not break.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "../_shared/rate-limit.ts";

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const caller = await authenticate(req, supabase, corsHeaders);
    if (!caller.ok) return caller.response;
    const userId = caller.userId;
    if (!userId) return json({ error: "User token required" }, 403);

    const limit = await checkRateLimit(`disconnect-calendar:${userId}`, RATE_LIMITS.AUTH);
    if (!limit.allowed) return createRateLimitResponse(limit, corsHeaders);

    const { provider } = await req.json().catch(() => ({}));
    if (provider !== "microsoft") {
      return json({ error: "Only 'microsoft' can be disconnected here. Use disconnect-google for Google." }, 400);
    }

    const { error: connError } = await supabase
      .from("calendar_connections").delete().eq("user_id", userId).eq("provider", "microsoft");
    if (connError) throw connError;

    // Calendar rows are cosmetic; a failure here must not leave the grant in
    // place, which is why it is not fatal and runs after the delete above.
    const { error: calError } = await supabase
      .from("calendars").delete().eq("user_id", userId).eq("provider", "microsoft");
    if (calError) console.warn("[disconnect-calendar] calendar rows:", calError.message);

    return json({ disconnected: true });
  } catch (err) {
    console.error("[disconnect-calendar]", err);
    return json({ error: err instanceof Error ? err.message : "Something went wrong" }, 500);
  }
});
