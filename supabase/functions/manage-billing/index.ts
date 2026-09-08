/**
 * Billing actions for the signed-in user: report which plan they are on, start
 * a subscription checkout, or open the Dodo customer portal.
 *
 * The client names a PLAN ("starter" | "pro") and a billing period ("monthly" |
 * "annual"), never a product or a price — the pair is resolved to a Dodo product
 * server-side by `productForPlan`, off the same maps that decide entitlements,
 * so what a customer pays for and what they get can never drift apart. metadata.user_id on the
 * checkout session is what lets dodo-webhook attach the subscription to the
 * right profile.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import {
  createCheckoutSession,
  createCustomerPortalSession,
} from "../_shared/dodo.ts";
import {
  BILLING_PERIODS,
  planForProfile,
  productForPlan,
  SELLABLE_PLANS,
} from "../_shared/entitlements.ts";
import type { BillingPeriod, PlanKey } from "../_shared/entitlements.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "https://www.echobrief.in";

/**
 * How many people are already in this user's workspace.
 *
 * Members plus outstanding invites: an invite that has been sent is a seat that
 * is about to be used, and buying fewer seats than that would fail the moment
 * somebody accepted. Returns 1 (just the buyer) when there is no workspace, and
 * on any error — a billing page that cannot load the org must not block a sale.
 */
async function workspaceSize(supabase: any, userId: string): Promise<number> {
  try {
    const { data: membership } = await supabase
      .from("org_members").select("org_id").eq("user_id", userId).maybeSingle();
    if (!membership) return 1;
    const { count: members } = await supabase
      .from("org_members").select("user_id", { count: "exact", head: true })
      .eq("org_id", membership.org_id);
    const { count: invites } = await supabase
      .from("org_invites").select("id", { count: "exact", head: true })
      .eq("org_id", membership.org_id)
      .is("accepted_at", null)
      .is("revoked_at", null);
    return Math.max(1, (members ?? 1) + (invites ?? 0));
  } catch (err) {
    console.error("[manage-billing] workspace size lookup failed:", err);
    return 1;
  }
}

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
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: userError } = await admin.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userError || !userData?.user) {
      return json({ error: "Invalid session" }, 401);
    }
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    const { data: profile } = await admin
      .from("profiles")
      .select(
        "email, full_name, dodo_customer_id, subscription_status, subscription_product_id, subscription_renews_at, plan_override",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    // Which plan the caller is actually on. The client mirror in
    // src/lib/plans.ts cannot answer this — it has no product map, so it floors
    // every paid subscription to Starter. The billing page asks here instead,
    // and marks the right card "Current".
    if (action === "plan") {
      return json({ plan: planForProfile(profile) });
    }

    if (action === "checkout") {
      const plan = (body?.plan ?? SELLABLE_PLANS[0]) as PlanKey;
      if (!SELLABLE_PLANS.includes(plan)) {
        return json({ error: `Unknown plan: ${plan}` }, 400);
      }
      const period = (body?.billing ?? "monthly") as BillingPeriod;
      if (!BILLING_PERIODS.includes(period)) {
        return json({ error: `Unknown billing period: ${period}` }, 400);
      }
      const productId = productForPlan(plan, period);
      if (!productId) {
        return json({ error: "Billing is not configured yet" }, 503);
      }

      // Seats, for the one per-seat plan. The floor is the workspace as it
      // already stands: selling three seats to a workspace that has five
      // members would put it instantly over its own limit, and the first
      // symptom would be recordings refused for people who did nothing wrong.
      let quantity = 1;
      if (plan === "teams") {
        const requested = Math.floor(Number(body?.seats));
        const existing = await workspaceSize(admin, user.id);
        quantity = Math.max(Number.isFinite(requested) ? requested : 0, existing, 1);
        if (quantity > 200) {
          return json({ error: "That is more seats than checkout supports — talk to us." }, 400);
        }
      }
      if (profile?.subscription_status === "active") {
        return json({ error: "Subscription already active" }, 400);
      }

      const email = profile?.email ?? user.email;
      if (!email) return json({ error: "No email on account" }, 400);

      const session = await createCheckoutSession({
        productId,
        customer: profile?.dodo_customer_id
          ? { customer_id: profile.dodo_customer_id }
          : { email, name: profile?.full_name ?? undefined },
        // The seat count is on the metadata as well as the cart: the webhook
        // reads it back to stamp profiles.subscription_quantity, and a payload
        // that omits the cart quantity would otherwise leave us guessing.
        metadata: { user_id: user.id, plan, seats: String(quantity) },
        returnUrl: `${APP_URL}/settings?tab=billing&checkout=success`,
        quantity,
      });
      if (!session.checkout_url) {
        return json({ error: "Dodo returned no checkout URL" }, 502);
      }
      return json({ url: session.checkout_url });
    }

    if (action === "portal") {
      if (!profile?.dodo_customer_id) {
        return json({ error: "No billing profile yet" }, 400);
      }
      const link = await createCustomerPortalSession(profile.dodo_customer_id);
      return json({ url: link });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    console.error("manage-billing error:", error);
    return json({ error: "Internal error" }, 500);
  }
});
