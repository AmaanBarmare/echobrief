/**
 * Slack connection actions for the signed-in user.
 *
 *   status      → is a workspace connected, which one, and where do summaries go
 *   channels    → the channels this bot token can actually post to
 *   set_channel → choose the destination (validated against `channels`)
 *   disconnect  → delete the row, and revoke the token in Slack
 *
 * Service-role client behind a user JWT: `slack_connections` has SELECT-only
 * RLS for `authenticated`, because a browser must never be able to UPDATE a
 * token column. Every read and write here is scoped to `caller.userId`, taken
 * from the JWT and never from the body.
 *
 * `set_channel` deliberately re-lists the channels and matches the requested id
 * against that list rather than writing whatever was posted. The integration
 * removed in 2026-08 let users paste a raw channel ID, which meant a typo was
 * indistinguishable from a working configuration until a meeting silently
 * failed to deliver weeks later.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { openConnectionTokens } from "../_shared/oauth-tokens.ts";
import { listChannels, revokeToken, SlackError, FATAL_SLACK_ERRORS } from "../_shared/slack.ts";

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

    const limit = await checkRateLimit(`slack-manage:${userId}`, RATE_LIMITS.API);
    if (!limit.allowed) return createRateLimitResponse(limit, corsHeaders);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = typeof body.action === "string" ? body.action : "status";

    const { data: row } = await supabase
      .from("slack_connections")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    /** What the UI is allowed to see. Never a token, sealed or not. */
    const publicView = (r: Record<string, any> | null) =>
      r
        ? {
            connected: true,
            team_id: r.team_id,
            team_name: r.team_name,
            channel_id: r.channel_id,
            channel_name: r.channel_name,
            needs_reconnect: !!r.needs_reconnect,
            last_posted_at: r.last_posted_at,
            connected_at: r.created_at,
          }
        : { connected: false };

    if (action === "status") return json(publicView(row));

    if (!row) return json({ error: "Slack is not connected" }, 404);

    if (action === "disconnect") {
      // Delete first. If the revoke fails we have still disconnected, which is
      // what the user asked for; the reverse order could leave a row the user
      // believes is gone.
      const { error: delError } = await supabase
        .from("slack_connections").delete().eq("id", row.id).eq("user_id", userId);
      if (delError) {
        console.error("[manage-slack] delete failed:", delError);
        return json({ error: "Could not disconnect. Try again." }, 500);
      }
      try {
        const open = await openConnectionTokens(row);
        if (open?.access_token) await revokeToken(open.access_token);
      } catch (err) {
        console.warn("[manage-slack] token revoke failed (row already deleted):", err);
      }
      return json({ connected: false });
    }

    // Both remaining actions talk to Slack, so they need the token open.
    const conn = await openConnectionTokens(row);
    if (!conn?.access_token) return json({ error: "Slack connection is missing its token. Reconnect." }, 409);

    const withSlack = async <T>(fn: () => Promise<T>): Promise<T | Response> => {
      try {
        return await fn();
      } catch (err) {
        const code = err instanceof SlackError ? err.slackCode : "unknown";
        if (FATAL_SLACK_ERRORS.has(code)) {
          // Same rule as the delivery path: a dead grant becomes a visible
          // "reconnect" state rather than a call that quietly keeps failing.
          await supabase.from("slack_connections")
            .update({ needs_reconnect: true }).eq("id", row.id);
          return json({ error: "Slack disconnected this app. Please reconnect.", code }, 409);
        }
        console.error(`[manage-slack] ${action} failed:`, code);
        return json({ error: "Slack request failed.", code }, 502);
      }
    };

    if (action === "channels") {
      const result = await withSlack(() => listChannels(conn.access_token as string));
      if (result instanceof Response) return result;
      return json({ channels: result });
    }

    if (action === "set_channel") {
      const channelId = typeof body.channel_id === "string" ? body.channel_id.trim() : "";
      if (!channelId) return json({ error: "channel_id is required" }, 400);

      const result = await withSlack(() => listChannels(conn.access_token as string));
      if (result instanceof Response) return result;

      const match = result.find((c) => c.id === channelId);
      if (!match) {
        return json(
          { error: "That channel is not one this app can post to. Pick it from the list, or invite the app to it in Slack." },
          400,
        );
      }

      const { error: updateError } = await supabase
        .from("slack_connections")
        .update({ channel_id: match.id, channel_name: match.name, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("user_id", userId);
      if (updateError) {
        console.error("[manage-slack] channel update failed:", updateError);
        return json({ error: "Could not save the channel. Try again." }, 500);
      }
      return json({ channel_id: match.id, channel_name: match.name });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("[manage-slack]", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
