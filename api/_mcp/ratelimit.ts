/**
 * Per-token request ceiling.
 *
 * In-memory, so on Fluid Compute — which reuses instances and runs several of
 * them — this is approximate rather than a hard global cap. That is acceptable
 * for an endpoint where every caller is already identified by a revocable token:
 * the job here is to stop a runaway agent loop, not to resist an attacker who
 * would simply be revoked.
 *
 * The alternative, a counter in Postgres, would mean a write on every request —
 * exactly the churn that consumed 94.4% of database execution time in the cron
 * incident (engineering-notes.md #22).
 */
export const RATE_LIMIT_MAX = 60;
export const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 5_000;

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
}

function prune(now: number): void {
  if (buckets.size <= MAX_TRACKED_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

export function checkRateLimit(key: string, now = Date.now()): RateLimitResult {
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    prune(now);
    buckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0, remaining: RATE_LIMIT_MAX - 1 };
  }

  if (bucket.count >= RATE_LIMIT_MAX) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
      remaining: 0,
    };
  }

  bucket.count += 1;
  return {
    allowed: true,
    retryAfterSeconds: 0,
    remaining: RATE_LIMIT_MAX - bucket.count,
  };
}

export function resetRateLimits(): void {
  buckets.clear();
}
