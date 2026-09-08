/**
 * Zoho CRM connection actions for the signed-in user.
 *
 *   status     → is a CRM connected, which org, when did it last write
 *   test       → refresh the token and look up one email, so a broken grant is
 *                discovered here rather than silently at the end of a meeting
 *   disconnect → delete the row and revoke the refresh token at Zoho
 *
 * Service-role client behind a user JWT: `zoho_connections` is SELECT-only for
 * `authenticated`, because a browser must never UPDATE a token column. Every
 * read and write is scoped to `caller.userId`, taken from the JWT.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { openConnectionTokens, sealConnectionTokens } from "../_shared/oauth-tokens.ts";
import {
  accountsHost,
  findRecordByEmail,
  refreshAccessToken,
  FATAL_ZOHO_ERRORS,
  ZohoError,
} from "../_shared/zoho.ts";

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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

    const limit = await checkRateLimit(`zoho-manage:${userId}`, RATE_LIMITS.API);
    if (!limit.allowed) return createRateLimitResponse(limit, corsHeaders);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = typeof body.action === "string" ? body.action : "status";

    const { data: row } = await supabase
      .from("zoho_connections")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    /** What the UI may see. Never a token, sealed or not. */
    const publicView = (r: Record<string, any> | null) =>
      r
        ? {
            connected: true,
            org_name: r.org_name,
            location: r.location,
            needs_reconnect: !!r.needs_reconnect,
            last_synced_at: r.last_synced_at,
            connected_at: r.created_at,
          }
        : { connected: false };

    if (action === "status") return json(publicView(row));
    if (!row) return json({ error: "Zoho is not connected" }, 404);

    const conn = await openConnectionTokens(row);
    if (!conn?.refresh_token) return json({ error: "Connection is missing its token. Reconnect." }, 409);

    const clientId = Deno.env.get("ZOHO_CLIENT_ID");
    const clientSecret = Deno.env.get("ZOHO_CLIENT_SECRET");
    if (!clientId || !clientSecret) return json({ error: "Zoho is not configured yet." }, 503);

    if (action === "disconnect") {
      const { error: delError } = await supabase
        .from("zoho_connections").delete().eq("id", row.id).eq("user_id", userId);
      if (delError) {
        console.error("[manage-zoho] delete failed:", delError);
        return json({ error: "Could not disconnect. Try again." }, 500);
      }
      // Courtesy half, after the row is already gone: revoking is what stops the
      // refresh token working, but the disconnect the user asked for must not
      // depend on Zoho being reachable.
      try {
        await fetch(`${accountsHost(conn.location)}/oauth/v2/token/revoke`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: conn.refresh_token }).toString(),
        });
      } catch (err) {
        console.warn("[manage-zoho] revoke failed (row already deleted):", err);
      }
      return json({ connected: false });
    }

    if (action === "test") {
      // Exercises the whole chain the delivery path uses — refresh, then a real
      // search against the stored api_domain — so a dead grant surfaces in
      // Settings instead of at the end of somebody's next meeting.
      try {
        const fresh = await refreshAccessToken(clientId, clientSecret, conn.refresh_token, conn.location);
        const sealed = await sealConnectionTokens({ access_token: fresh.access_token });
        await supabase.from("zoho_connections").update({
          access_token: sealed.access_token,
          token_expiry: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
          needs_reconnect: false,
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);

        const probe = typeof body.email === "string" ? body.email.trim() : "";
        const match = probe ? await findRecordByEmail(conn.api_domain, fresh.access_token, probe) : null;
        return json({
          ok: true,
          api_domain: conn.api_domain,
          // A probe that matches nothing is a valid answer, not a failure.
          match: match ? { module: match.module, name: match.name } : null,
        });
      } catch (err) {
        const code = err instanceof ZohoError ? err.code : "unknown";
        if (FATAL_ZOHO_ERRORS.has(code)) {
          await supabase.from("zoho_connections")
            .update({ needs_reconnect: true }).eq("id", row.id);
          return json({ error: "Zoho rejected the stored grant. Please reconnect.", code }, 409);
        }
        console.error("[manage-zoho] test failed:", code);
        return json({ error: "Zoho request failed.", code }, 502);
      }
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[manage-zoho]", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
