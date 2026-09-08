/**
 * Dodo Payments API client + webhook verification.
 *
 * Base URL is picked by DODO_ENVIRONMENT ("test_mode" | "live_mode"); every
 * request authenticates with `Authorization: Bearer DODO_PAYMENTS_API_KEY`.
 * Webhooks follow the Standard Webhooks spec (same scheme Recall uses):
 * HMAC-SHA256 over `${webhook-id}.${webhook-timestamp}.${rawBody}` keyed by
 * the base64-decoded secret (minus its `whsec_` prefix).
 */

const DODO_ENVIRONMENT = Deno.env.get("DODO_ENVIRONMENT") ?? "test_mode";

export const DODO_BASE_URL = Deno.env.get("DODO_API_BASE_URL") ??
  (DODO_ENVIRONMENT === "live_mode"
    ? "https://live.dodopayments.com"
    : "https://test.dodopayments.com");

/** Reject webhooks whose timestamp is further than this from now. */
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

function apiKey(): string {
  const key = Deno.env.get("DODO_PAYMENTS_API_KEY");
  if (!key) throw new Error("DODO_PAYMENTS_API_KEY not configured");
  return key;
}

async function dodoFetch(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${DODO_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Dodo ${init.method ?? "GET"} ${path} failed (${response.status}): ${text.slice(0, 500)}`);
  }
  return JSON.parse(text);
}

export interface CheckoutSessionResult {
  session_id: string;
  checkout_url: string | null;
}

export async function createCheckoutSession(opts: {
  productId: string;
  customer: { customer_id: string } | { email: string; name?: string };
  metadata: Record<string, string>;
  returnUrl: string;
  /** Seats, for a per-seat plan. Defaults to 1, which is every flat plan. */
  quantity?: number;
}): Promise<CheckoutSessionResult> {
  return await dodoFetch("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      product_cart: [{ product_id: opts.productId, quantity: Math.max(1, Math.floor(opts.quantity ?? 1)) }],
      customer: opts.customer,
      metadata: opts.metadata,
      return_url: opts.returnUrl,
    }),
  }) as CheckoutSessionResult;
}

export async function createCustomerPortalSession(customerId: string): Promise<string> {
  const result = await dodoFetch(
    `/customers/${customerId}/customer-portal/session`,
    { method: "POST" },
  ) as { link: string };
  return result.link;
}

/**
 * Map a Dodo webhook event type to the profiles.subscription_status it should
 * set, or null when the event carries no status change (payment.*,
 * subscription.updated, subscription.update_payment_method, unknown types).
 */
export function subscriptionStatusForEvent(eventType: string): string | null {
  switch (eventType) {
    case "subscription.active":
    case "subscription.renewed":
    case "subscription.unpaused":
    case "subscription.plan_changed":
      return "active";
    case "subscription.on_hold":
      return "on_hold";
    case "subscription.paused":
      return "paused";
    case "subscription.cancelled":
      return "cancelled";
    case "subscription.expired":
      return "expired";
    case "subscription.failed":
      return "failed";
    default:
      return null;
  }
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}

function decodeBase64(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/**
 * Verify a Standard Webhooks signature. Returns true only when one of the
 * (possibly several, space-separated, optionally `v1,`-prefixed) signatures
 * matches and the timestamp is within tolerance.
 */
export async function verifyStandardWebhook(
  secret: string,
  headers: WebhookHeaders,
  rawBody: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;

  const timestamp = Number(headers.timestamp);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(nowSeconds - timestamp) > TIMESTAMP_TOLERANCE_SECONDS) return false;

  const key = decodeBase64(
    secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret,
  );
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const payload = new TextEncoder().encode(
    `${headers.id}.${headers.timestamp}.${rawBody}`,
  );
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", cryptoKey, payload as BufferSource),
  );

  for (const candidate of headers.signature.split(" ")) {
    const raw = candidate.includes(",") ? candidate.split(",")[1] : candidate;
    if (!raw) continue;
    let provided: Uint8Array;
    try {
      provided = decodeBase64(raw);
    } catch {
      continue;
    }
    if (timingSafeEqual(expected, provided)) return true;
  }
  return false;
}
