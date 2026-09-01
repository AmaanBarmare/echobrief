/**
 * Rate limiting for edge functions.
 *
 * This used to be a module-level `Map`. Supabase runs many edge isolates and
 * recycles them on cold start, so that counter was per-instance and reset
 * constantly: the real limit was the configured one multiplied by however many
 * isolates happened to be warm. The authority is now a single Postgres row per
 * key, consumed atomically by `public.consume_rate_limit` (migration
 * 20260901150000), so every isolate counts against the same number.
 *
 * The in-memory map survives only as a fallback for when the database call
 * itself fails — a degraded limit beats no limit, and beats locking every user
 * out because Postgres hiccuped.
 *
 * `checkRateLimit` is now ASYNC. Call sites must await it.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface RateLimitConfig {
  /** Maximum requests allowed in the window. */
  maxRequests: number;
  /** Window duration in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  resetIn: number;
}

// ---------------------------------------------------------------------------
// Fallback counter. Only consulted when the database is unreachable.
// ---------------------------------------------------------------------------
interface MemoryEntry {
  count: number;
  resetTime: number;
}
const memoryStore = new Map<string, MemoryEntry>();

function checkInMemory(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  let entry = memoryStore.get(key);

  if (!entry || now > entry.resetTime) {
    entry = { count: 1, resetTime: now + windowMs };
    memoryStore.set(key, entry);
    // Opportunistic sweep — the fallback map must not grow without bound.
    if (memoryStore.size > 5000) {
      for (const [k, v] of memoryStore) if (now > v.resetTime) memoryStore.delete(k);
    }
    return { allowed: true, remaining: config.maxRequests - 1, resetIn: config.windowSeconds };
  }

  entry.count += 1;
  const resetIn = Math.max(0, Math.ceil((entry.resetTime - now) / 1000));
  return {
    allowed: entry.count <= config.maxRequests,
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetIn,
  };
}

let cachedClient: any = null;
function serviceClient(): any {
  if (cachedClient) return cachedClient;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  cachedClient = createClient(url, key);
  return cachedClient;
}

/**
 * Consume one unit against `key`. Shared across isolates.
 *
 * `key` should already be namespaced by endpoint — `oauth-start:<ip>`,
 * `chat:<userId>`. Prefer a user id over an IP wherever the caller is
 * authenticated: IPs are shared by whole offices and trivially rotated.
 */
export async function checkRateLimit(
  key: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const supabase = serviceClient();
  if (!supabase) return checkInMemory(key, config);

  try {
    const { data, error } = await supabase.rpc("consume_rate_limit", {
      p_key: key,
      p_max: config.maxRequests,
      p_window_seconds: config.windowSeconds,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("consume_rate_limit returned no row");
    return {
      allowed: Boolean(row.allowed),
      remaining: Number(row.remaining) || 0,
      resetIn: Number(row.reset_in) || config.windowSeconds,
    };
  } catch (err) {
    console.error("[rate-limit] falling back to in-memory:", err);
    return checkInMemory(key, config);
  }
}

export function getClientIdentifier(req: Request): string {
  // Real IP from whichever proxy header is present (Cloudflare, Envoy, …).
  const cfConnectingIp = req.headers.get("cf-connecting-ip");
  const xRealIp = req.headers.get("x-real-ip");
  const xForwardedFor = req.headers.get("x-forwarded-for");
  const remoteAddr = req.headers.get("x-envoy-external-address");

  if (cfConnectingIp) return cfConnectingIp;
  if (xRealIp) return xRealIp;
  if (xForwardedFor) return xForwardedFor.split(",")[0].trim();
  if (remoteAddr) return remoteAddr;
  return "unknown";
}

export function createRateLimitResponse(
  result: RateLimitResult,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests", retryAfter: result.resetIn }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": result.resetIn.toString(),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": result.resetIn.toString(),
      },
    },
  );
}

export const RATE_LIMITS = {
  // Auth endpoints — stricter.
  AUTH: { maxRequests: 10, windowSeconds: 60 },
  // OAuth flows — moderate.
  OAUTH: { maxRequests: 20, windowSeconds: 60 },
  // General API endpoints.
  API: { maxRequests: 60, windowSeconds: 60 },
  // Public endpoints (serving a client ID, etc.).
  PUBLIC: { maxRequests: 100, windowSeconds: 60 },
  // Endpoints that call OpenAI on demand. Deliberately tight: each request
  // costs real money, and no human works faster than this.
  LLM: { maxRequests: 20, windowSeconds: 60 },
  // Multi-pass regeneration and account briefs — a whole GPT chain per call.
  LLM_HEAVY: { maxRequests: 6, windowSeconds: 60 },
} as const;
