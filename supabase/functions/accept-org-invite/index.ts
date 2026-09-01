/**
 * Accept a workspace invitation.
 *
 * Requires a signed-in user: the invite names an email address, but the
 * membership row names a user id, and only a real session tells us which.
 * The token proves the invite; the JWT proves who is accepting it.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { hashShareToken, looksLikeShareToken } from "../_shared/share-token.ts";

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

    const limit = await checkRateLimit(`invite-accept:${userId}`, RATE_LIMITS.AUTH);
    if (!limit.allowed) return createRateLimitResponse(limit, corsHeaders);

    const { token } = await req.json().catch(() => ({}));
    if (!looksLikeShareToken(token)) {
      return json({ error: "This invitation link is not valid." }, 404);
    }

    const { data: invite } = await supabase
      .from("org_invites")
      .select("id, org_id, email, role, expires_at, accepted_at, revoked_at")
      .eq("token_hash", await hashShareToken(token))
      .maybeSingle();

    // One message for missing, revoked, expired and already-used: telling a
    // stranger which one it was is an enumeration oracle for no benefit.
    const unusable = !invite
      || invite.accepted_at !== null
      || invite.revoked_at !== null
      || Date.parse(invite.expires_at) <= Date.now();
    if (unusable) {
      return json({ error: "This invitation has expired or has already been used." }, 404);
    }

    // The invitation is addressed to a person, not to whoever holds the link.
    const { data: profile } = await supabase
      .from("profiles").select("email").eq("user_id", userId).maybeSingle();
    const callerEmail = (profile?.email || "").trim().toLowerCase();
    if (!callerEmail || callerEmail !== invite.email) {
      return json({
        error: `This invitation was sent to ${invite.email}. Sign in with that address to accept it.`,
      }, 403);
    }

    const { data: existing } = await supabase
      .from("org_members").select("org_id").eq("user_id", userId).maybeSingle();
    if (existing) {
      return json({
        error: existing.org_id === invite.org_id
          ? "You are already in this workspace."
          : "You are already in another workspace. Leave it before joining a new one.",
      }, 409);
    }

    const { error: joinError } = await supabase
      .from("org_members")
      .insert({ org_id: invite.org_id, user_id: userId, role: invite.role });
    if (joinError) throw joinError;

    await supabase
      .from("org_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    const { data: org } = await supabase
      .from("organizations").select("id, name").eq("id", invite.org_id).maybeSingle();

    return json({ joined: true, organization: org, role: invite.role });
  } catch (err) {
    console.error("[accept-org-invite]", err);
    return json({ error: err instanceof Error ? err.message : "Something went wrong" }, 500);
  }
});
