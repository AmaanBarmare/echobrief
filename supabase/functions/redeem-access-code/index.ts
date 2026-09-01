/**
 * Redeem an early-access code.
 *
 * The signed-in user posts `{ code }`; everything that decides whether the
 * grant happens lives in the `redeem_access_code` SQL function, which takes a
 * row lock so two simultaneous redemptions of the last slot resolve to one.
 * This handler's only jobs are to establish WHO is asking (never trust a
 * user_id in the body) and to turn a refusal reason into a message a person
 * can act on.
 *
 * `verify_jwt = true` and a user JWT only: a service caller has no user to
 * grant to, and letting one pass would mean a bearer token could mint access.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { authenticate } from "../_shared/auth.ts";

/** Refusal reasons from the SQL function, in the words the user should read. */
const REASONS: Record<string, string> = {
  not_found: "That code isn't recognised. Check for typos and try again.",
  inactive: "That code has been turned off.",
  expired: "That code has expired.",
  exhausted: "That code has already been claimed by someone else.",
  invalid: "That code isn't valid.",
};

serve(async (req) => {
  const preflight = handleCorsPrelight(req);
  if (preflight) return preflight;
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const caller = await authenticate(req, admin, corsHeaders);
    if (!caller.ok) return caller.response;
    if (caller.isService || !caller.userId) {
      return json({ error: "A code is redeemed by a signed-in user." }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const code = String(body?.code ?? "").trim().toUpperCase();
    // Bound the input before it reaches Postgres: the column allows 32 chars,
    // and an unbounded string here is just a free write into the query plan.
    if (!code || code.length > 32) {
      return json({ error: "Enter the code you were sent." }, 400);
    }

    const { data, error } = await admin.rpc("redeem_access_code", {
      p_code: code,
      p_user_id: caller.userId,
    });
    if (error) {
      console.error("[redeem-access-code] rpc failed:", error);
      return json({ error: "Could not redeem that code right now." }, 500);
    }

    const result = (data ?? {}) as Record<string, unknown>;
    if (result.ok !== true) {
      const reason = String(result.reason ?? "invalid");
      // 404 only for a code that does not exist; everything else is a valid
      // code the caller cannot use, which is a 409, not a "wrong URL".
      return json(
        { error: REASONS[reason] ?? REASONS.invalid, reason },
        reason === "not_found" ? 404 : 409,
      );
    }

    console.log(
      `[redeem-access-code] ${caller.userId} → ${result.plan} until ${result.granted_until}` +
        (result.already ? " (already redeemed)" : ""),
    );

    return json({
      ok: true,
      plan: result.plan,
      granted_until: result.granted_until,
      already_redeemed: result.already === true,
      // The code was valid but an existing permanent override wins, so the
      // user's plan did not change. Say so rather than implying it did.
      superseded: result.superseded === true,
    });
  } catch (err) {
    console.error("[redeem-access-code] unhandled:", err);
    return json({ error: "Could not redeem that code right now." }, 500);
  }
});
