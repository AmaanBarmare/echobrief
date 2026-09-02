/**
 * Create, list, update and revoke share links for a meeting.
 *
 * Service-role client behind a user JWT: only this function can mint a valid
 * token hash, which is why `meeting_shares` has no INSERT policy. Every read
 * and write is scoped to a meeting the caller actually owns — checked here
 * explicitly rather than trusted from the body.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { generateShareToken, SHARE_TOKEN_PREFIX } from "../_shared/share-token.ts";

const APP_URL = Deno.env.get("APP_URL") || "https://www.echobrief.in";

/** Expiry choices offered in the UI. `null` means the link does not expire. */
const ALLOWED_EXPIRY_DAYS = [1, 7, 30, 90, null] as const;

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

    const limit = await checkRateLimit(`share-manage:${userId}`, RATE_LIMITS.API);
    if (!limit.allowed) return createRateLimitResponse(limit, corsHeaders);

    const body = await req.json().catch(() => ({}));
    const action = body.action || "list";
    const meetingId = body.meeting_id;
    if (typeof meetingId !== "string" || !meetingId) {
      return json({ error: "meeting_id is required" }, 400);
    }

    // Ownership is established here, from the JWT, and never from the body.
    const { data: meeting } = await supabase
      .from("meetings")
      .select("id, title")
      .eq("id", meetingId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!meeting) return json({ error: "Meeting not found" }, 404);

    if (action === "list") {
      const { data, error } = await supabase
        .from("meeting_shares")
        .select("id, scope, org_id, token_prefix, expires_at, revoked_at, view_count, last_viewed_at, created_at, include_transcript, include_recording")
        .eq("meeting_id", meetingId)
        .eq("created_by", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const { data: membership } = await supabase
        .from("org_members").select("org_id").eq("user_id", userId).maybeSingle();

      return json({
        shares: (data ?? []).filter((row: Record<string, unknown>) => row.scope === "link"),
        in_workspace: Boolean(membership),
        shared_to_org: (data ?? []).some(
          (row: Record<string, unknown>) =>
            row.scope === "org" && row.org_id === membership?.org_id && !row.revoked_at,
        ),
      });
    }

    if (action === "create") {
      const days = body.expires_in_days === null || body.expires_in_days === undefined
        ? 7
        : Number(body.expires_in_days);
      const expiryChoice = ALLOWED_EXPIRY_DAYS.includes(days as never) ? days : 7;
      const expiresAt = expiryChoice === null
        ? null
        : new Date(Date.now() + Number(expiryChoice) * 86_400_000).toISOString();

      const { token, hash, prefix } = await generateShareToken();
      const { data, error } = await supabase
        .from("meeting_shares")
        .insert({
          meeting_id: meetingId,
          created_by: userId,
          scope: "link",
          token_hash: hash,
          token_prefix: prefix,
          expires_at: expiresAt,
          // What this particular link carries, decided when it is minted. Both
          // default to false, so an omitted flag narrows the link rather than
          // widening it.
          include_transcript: body.include_transcript === true,
          include_recording: body.include_recording === true,
        })
        .select("id, expires_at, created_at, include_transcript, include_recording")
        .single();
      if (error) throw error;

      // The only time the plaintext exists. It is not stored and cannot be
      // shown again — a lost link is revoked and replaced, not recovered.
      return json({
        share: data,
        url: `${APP_URL}/share/${token}`,
      });
    }

    // ---- share to / unshare from the caller's workspace --------------------
    // Same table, scope='org'. Grants colleagues the same surface a public link
    // does — summary, decisions, action items — and nothing more; the RLS
    // policies added in 20260901200000 deliberately stop short of transcripts.
    if (action === "share_to_org" || action === "unshare_from_org") {
      const { data: membership } = await supabase
        .from("org_members").select("org_id").eq("user_id", userId).maybeSingle();
      if (!membership) return json({ error: "You are not in a workspace." }, 409);

      if (action === "unshare_from_org") {
        const { error } = await supabase
          .from("meeting_shares")
          .delete()
          .eq("meeting_id", meetingId)
          .eq("org_id", membership.org_id)
          .eq("scope", "org");
        if (error) throw error;
        return json({ shared_to_org: false });
      }

      const { error } = await supabase.from("meeting_shares").insert({
        meeting_id: meetingId,
        created_by: userId,
        scope: "org",
        org_id: membership.org_id,
      });
      // 23505 = already shared to this workspace, which is the desired state.
      if (error && error.code !== "23505") throw error;
      return json({ shared_to_org: true });
    }

    // Change what an existing link carries, without invalidating it. Narrowing
    // takes effect on the next page view; widening one already in a stranger's
    // inbox is a real decision, which is why the dialog states it plainly.
    if (action === "update") {
      const shareId = body.share_id;
      if (typeof shareId !== "string" || !shareId) {
        return json({ error: "share_id is required" }, 400);
      }
      const patch: Record<string, boolean> = {};
      if (typeof body.include_transcript === "boolean") patch.include_transcript = body.include_transcript;
      if (typeof body.include_recording === "boolean") patch.include_recording = body.include_recording;
      if (Object.keys(patch).length === 0) {
        return json({ error: "Nothing to update" }, 400);
      }
      const { data, error } = await supabase
        .from("meeting_shares")
        .update(patch)
        .eq("id", shareId)
        .eq("meeting_id", meetingId)
        .eq("created_by", userId)
        .eq("scope", "link")
        .select("id, include_transcript, include_recording")
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Link not found" }, 404);
      return json({ share: data });
    }

    if (action === "revoke") {
      const shareId = body.share_id;
      if (typeof shareId !== "string" || !shareId) {
        return json({ error: "share_id is required" }, 400);
      }
      const { error } = await supabase
        .from("meeting_shares")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", shareId)
        .eq("meeting_id", meetingId)
        .eq("created_by", userId);
      if (error) throw error;
      return json({ revoked: true });
    }

    return json({ error: `Unknown action "${action}"` }, 400);
  } catch (err) {
    console.error("[manage-meeting-share]", err);
    return json({ error: err instanceof Error ? err.message : "Something went wrong" }, 500);
  }
});
