/**
 * Create and run a team workspace.
 *
 * Service-role client behind a user JWT. Every action re-derives the caller's
 * org and role from `org_members` rather than trusting an org_id in the body —
 * the body is where an attacker puts somebody else's workspace.
 *
 * Membership is one org per user (unique index on org_members.user_id), so
 * "the caller's org" is a single value and there is no org_id parameter at all.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";
import { checkRateLimit, createRateLimitResponse, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { generateShareToken } from "../_shared/share-token.ts";
import { sendInviteEmail } from "../_shared/org-invite-email.ts";
import {
  planForProfile,
  seatsForProfile,
  TEAM_SEAT_PLANS,
  type BillingProfile,
} from "../_shared/entitlements.ts";

const APP_URL = Deno.env.get("APP_URL") || "https://www.echobrief.in";
/** A workspace that can add members without limit is a billing hole. */
const MAX_MEMBERS = 25;

/**
 * Is there a paid seat free for one more person?
 *
 * Only per-seat plans are gated. Every other plan — including a workspace on a
 * flat plan or an internal `plan_override` — is limited by MAX_MEMBERS alone,
 * so this cannot accidentally start refusing invites for accounts that never
 * bought seats.
 *
 * Fails OPEN on a lookup error, exactly as `checkRecordingAllowed` does: a
 * database hiccup must not stop a customer growing their team.
 */
async function seatsAvailable(
  supabase: any,
  orgId: string,
  memberCount: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { data: owner } = await supabase
      .from("org_members").select("user_id").eq("org_id", orgId).eq("role", "owner").maybeSingle();
    if (!owner) return { ok: true };

    const { data: profile } = await supabase
      .from("profiles")
      .select("subscription_status, subscription_product_id, subscription_renews_at, plan_override, plan_override_expires_at, subscription_quantity")
      .eq("user_id", owner.user_id)
      .maybeSingle();

    const plan = planForProfile(profile as BillingProfile | null);
    if (!TEAM_SEAT_PLANS.includes(plan)) return { ok: true };

    const seats = seatsForProfile(profile as BillingProfile | null);
    const { count: pending } = await supabase
      .from("org_invites").select("id", { count: "exact", head: true })
      .eq("org_id", orgId).is("accepted_at", null).is("revoked_at", null);

    const taken = memberCount + (pending ?? 0);
    if (taken < seats) return { ok: true };
    return {
      ok: false,
      message: `All ${seats} of your seats are in use or invited. Add seats from Settings → Billing to invite more people.`,
    };
  } catch (err) {
    console.error("[manage-organization] seat check failed, allowing the invite:", err);
    return { ok: true };
  }
}

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

    const limit = await checkRateLimit(`org-manage:${userId}`, RATE_LIMITS.API);
    if (!limit.allowed) return createRateLimitResponse(limit, corsHeaders);

    const body = await req.json().catch(() => ({}));
    const action = body.action || "get";

    // The caller's membership, read from the database every time. Nothing about
    // which org this request touches comes from the client.
    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", userId)
      .maybeSingle();

    const isAdmin = membership?.role === "owner" || membership?.role === "admin";

    // ---- create -----------------------------------------------------------
    if (action === "create") {
      if (membership) return json({ error: "You are already in a workspace." }, 409);
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (name.length < 1 || name.length > 80) {
        return json({ error: "Give the workspace a name of 1–80 characters." }, 400);
      }

      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .insert({ name, created_by: userId })
        .select("id, name, created_at")
        .single();
      if (orgError) throw orgError;

      const { error: memberError } = await supabase
        .from("org_members")
        .insert({ org_id: org.id, user_id: userId, role: "owner" });
      if (memberError) {
        // Never leave an ownerless workspace behind.
        await supabase.from("organizations").delete().eq("id", org.id);
        throw memberError;
      }
      return json({ organization: org, role: "owner" });
    }

    // `get` is the only action that is meaningful without a workspace — it is
    // how the UI decides whether to show the "create one" state. Every other
    // action needs to say so rather than returning an empty workspace, which
    // reads as success.
    if (!membership) {
      return action === "get"
        ? json({ organization: null })
        : json({ error: "You are not in a workspace yet." }, 409);
    }
    const orgId = membership.org_id;

    // ---- get --------------------------------------------------------------
    if (action === "get") {
      const [{ data: org }, { data: members }, { data: invites }] = await Promise.all([
        supabase.from("organizations").select("id, name, created_at").eq("id", orgId).maybeSingle(),
        supabase.from("org_members").select("user_id, role, joined_at").eq("org_id", orgId),
        isAdmin
          ? supabase
              .from("org_invites")
              .select("id, email, role, expires_at, created_at")
              .eq("org_id", orgId)
              .is("accepted_at", null)
              .is("revoked_at", null)
          : Promise.resolve({ data: [] as unknown[] }),
      ]);

      // Names and emails live on profiles, which the caller cannot read for
      // other users — resolve them here with the service role.
      const ids = (members ?? []).map((m: Record<string, string>) => m.user_id);
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("user_id, email, full_name").in("user_id", ids)
        : { data: [] };
      const byId = new Map((profiles ?? []).map((p: Record<string, string>) => [p.user_id, p]));

      return json({
        organization: org,
        role: membership.role,
        members: (members ?? []).map((m: Record<string, string>) => ({
          ...m,
          email: byId.get(m.user_id)?.email ?? null,
          full_name: byId.get(m.user_id)?.full_name ?? null,
          is_you: m.user_id === userId,
        })),
        invites: invites ?? [],
      });
    }

    // ---- invite -----------------------------------------------------------
    if (action === "invite") {
      if (!isAdmin) return json({ error: "Only workspace admins can invite people." }, 403);
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
        return json({ error: "That does not look like an email address." }, 400);
      }
      const role = body.role === "admin" ? "admin" : "member";

      const { count } = await supabase
        .from("org_members")
        .select("user_id", { count: "exact", head: true })
        .eq("org_id", orgId);
      if ((count ?? 0) >= MAX_MEMBERS) {
        return json({ error: `Workspaces are limited to ${MAX_MEMBERS} people. Talk to us if you need more.` }, 409);
      }

      // Seats. Teams is priced per seat, so an invite past the paid count is
      // refused HERE rather than at the sixth person's first recording — a
      // colleague who joined a workspace and then cannot record has no idea why,
      // and no way to fix it. Pending invites count: they are seats about to be
      // taken, and letting five invites out against three seats just moves the
      // failure to whoever accepts last.
      const seatCheck = await seatsAvailable(supabase, orgId, count ?? 0);
      if (!seatCheck.ok) return json({ error: seatCheck.message }, 402);

      const { token, hash } = await generateShareToken();
      const { data: invite, error } = await supabase
        .from("org_invites")
        .insert({ org_id: orgId, email, role, invited_by: userId, token_hash: hash })
        .select("id, email, role, expires_at, created_at")
        .single();
      // 23505 = there is already a live invite for this address.
      if (error?.code === "23505") {
        return json({ error: "That person already has a pending invite." }, 409);
      }
      if (error) throw error;

      const { data: org } = await supabase
        .from("organizations").select("name").eq("id", orgId).maybeSingle();
      const { data: inviter } = await supabase
        .from("profiles").select("full_name, email").eq("user_id", userId).maybeSingle();

      // The email is the only place the plaintext token exists. If it cannot be
      // sent the invite is unreachable, so drop it rather than leaving a row
      // that looks pending and can never be accepted.
      const sent = await sendInviteEmail({
        to: email,
        orgName: org?.name ?? "an EchoBrief workspace",
        inviterName: inviter?.full_name || inviter?.email || "A colleague",
        acceptUrl: `${APP_URL}/invite/${token}`,
      });
      if (!sent.ok) {
        await supabase.from("org_invites").delete().eq("id", invite.id);
        return json({ error: `Could not send the invite: ${sent.error}` }, 502);
      }

      return json({ invite });
    }

    // ---- revoke_invite ----------------------------------------------------
    if (action === "revoke_invite") {
      if (!isAdmin) return json({ error: "Only workspace admins can do that." }, 403);
      const inviteId = body.invite_id;
      if (typeof inviteId !== "string") return json({ error: "invite_id is required" }, 400);
      const { error } = await supabase
        .from("org_invites")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", inviteId)
        .eq("org_id", orgId);
      if (error) throw error;
      return json({ revoked: true });
    }

    // ---- remove_member ----------------------------------------------------
    if (action === "remove_member") {
      if (!isAdmin) return json({ error: "Only workspace admins can do that." }, 403);
      const target = body.user_id;
      if (typeof target !== "string") return json({ error: "user_id is required" }, 400);
      if (target === userId) {
        return json({ error: "Use “leave workspace” to remove yourself." }, 400);
      }
      const { data: targetMember } = await supabase
        .from("org_members").select("role").eq("org_id", orgId).eq("user_id", target).maybeSingle();
      if (!targetMember) return json({ error: "That person is not in this workspace." }, 404);
      // Only an owner can remove another admin, so an admin cannot depose the
      // owner or their peers.
      if (targetMember.role !== "member" && membership.role !== "owner") {
        return json({ error: "Only the workspace owner can remove an admin." }, 403);
      }
      const { error } = await supabase
        .from("org_members").delete().eq("org_id", orgId).eq("user_id", target);
      if (error) throw error;
      return json({ removed: true });
    }

    // ---- leave ------------------------------------------------------------
    if (action === "leave") {
      if (membership.role === "owner") {
        return json({
          error: "The owner cannot leave. Transfer ownership first, or delete the workspace.",
        }, 400);
      }
      const { error } = await supabase
        .from("org_members").delete().eq("org_id", orgId).eq("user_id", userId);
      if (error) throw error;
      return json({ left: true });
    }

    return json({ error: `Unknown action "${action}"` }, 400);
  } catch (err) {
    console.error("[manage-organization]", err);
    return json({ error: err instanceof Error ? err.message : "Something went wrong" }, 500);
  }
});
