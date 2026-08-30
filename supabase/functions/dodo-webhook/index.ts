/**
 * Dodo Payments webhook receiver.
 *
 * Dodo redelivers the same event (same `webhook-id`) up to 8 times with
 * exponential backoff, so after signature verification the handler claims the
 * event by inserting into billing_events (UNIQUE on event_id) — a duplicate
 * delivery gets 23505 and returns 200 without touching the profile.
 *
 * User resolution order: metadata.user_id (set by manage-billing at checkout)
 * → profiles.dodo_subscription_id → profiles.dodo_customer_id. Every verified
 * event is logged to billing_events; only subscription.* events with a status
 * mapping update the profile.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  subscriptionStatusForEvent,
  verifyStandardWebhook,
} from "../_shared/dodo.ts";

interface DodoEvent {
  type?: string;
  data?: {
    payload_type?: string;
    subscription_id?: string;
    product_id?: string;
    next_billing_date?: string;
    customer?: { customer_id?: string; email?: string };
    metadata?: Record<string, unknown>;
  };
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const secret = Deno.env.get("DODO_WEBHOOK_SECRET");
  if (!secret) {
    console.error("DODO_WEBHOOK_SECRET not configured");
    return new Response("Webhook secret not configured", { status: 503 });
  }

  const rawBody = await req.text();
  const eventId = req.headers.get("webhook-id");
  const verified = await verifyStandardWebhook(secret, {
    id: eventId,
    timestamp: req.headers.get("webhook-timestamp"),
    signature: req.headers.get("webhook-signature"),
  }, rawBody);
  if (!verified || !eventId) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: DodoEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const eventType = event.type ?? "unknown";
  const data = event.data ?? {};
  const subscriptionId = data.subscription_id ?? null;
  const customerId = data.customer?.customer_id ?? null;
  const metadataUserId = typeof data.metadata?.user_id === "string"
    ? data.metadata.user_id
    : null;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Resolve the owning user before claiming, so the ledger row carries it.
  let userId = metadataUserId;
  if (!userId && subscriptionId) {
    const { data: row } = await admin
      .from("profiles")
      .select("user_id")
      .eq("dodo_subscription_id", subscriptionId)
      .maybeSingle();
    userId = row?.user_id ?? null;
  }
  if (!userId && customerId) {
    const { data: row } = await admin
      .from("profiles")
      .select("user_id")
      .eq("dodo_customer_id", customerId)
      .maybeSingle();
    userId = row?.user_id ?? null;
  }

  // Idempotency claim: exactly one delivery of this event gets past here.
  const { error: claimError } = await admin.from("billing_events").insert({
    event_id: eventId,
    event_type: eventType,
    subscription_id: subscriptionId,
    user_id: userId,
    payload: event,
  });
  if (claimError) {
    if (claimError.code === "23505") {
      return new Response(
        JSON.stringify({ skipped: true, reason: "already_processed" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    console.error("billing_events insert failed:", claimError.message);
    // Non-2xx so Dodo retries once the DB hiccup passes.
    return new Response("Failed to record event", { status: 500 });
  }

  const status = subscriptionStatusForEvent(eventType);
  if (status && userId) {
    const update: Record<string, unknown> = {
      subscription_status: status,
      updated_at: new Date().toISOString(),
    };
    if (subscriptionId) update.dodo_subscription_id = subscriptionId;
    if (customerId) update.dodo_customer_id = customerId;
    if (data.product_id) update.subscription_product_id = data.product_id;
    if (data.next_billing_date) {
      update.subscription_renews_at = data.next_billing_date;
    }

    const { error: updateError } = await admin
      .from("profiles")
      .update(update)
      .eq("user_id", userId);
    if (updateError) {
      // Release the claim so Dodo's retry can re-run the whole handler.
      console.error(
        `profiles update failed for ${eventType} ${eventId}:`,
        updateError.message,
      );
      await admin.from("billing_events").delete().eq("event_id", eventId);
      return new Response("Failed to apply event", { status: 500 });
    }
  } else if (status && !userId) {
    console.error(
      `Could not resolve user for ${eventType} ${eventId} (subscription ${subscriptionId}, customer ${customerId})`,
    );
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
