/**
 * Caller identity for user-facing edge functions that also need a
 * service-role path (backfills, other functions).
 *
 *   - `Authorization: Bearer <user JWT>`         → { userId, isService: false }
 *   - `Authorization: Bearer <service-role JWT>` → { userId: null, isService: true }
 *
 * Functions using this keep `verify_jwt = true` (the default): the gateway
 * verifies the JWT signature for BOTH kinds of token, so reading the `role`
 * claim here is safe. (A project can have more than one valid service-role
 * JWT — the runtime-injected key and the one in .env differ — so comparing
 * the bearer to SUPABASE_SERVICE_ROLE_KEY is not enough; observed 2026-08-31.)
 * Functions MUST scope every read by `userId` when `isService` is false.
 */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type Caller =
  | { ok: true; userId: string; isService: false }
  | { ok: true; userId: null; isService: true }
  | { ok: false; response: Response };

export function json(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, ...headers, "Content-Type": "application/json" },
  });
}

/**
 * `corsHeaders` (optional) is merged into any 401 response — pass the result of
 * `getCorsHeaders(origin)` from `_shared/cors.ts` in browser-facing functions so
 * an auth failure still carries the origin-allowlisted CORS headers instead of
 * this module's permissive `*`.
 */
export async function authenticate(
  req: Request,
  supabase: any,
  corsHeaders?: Record<string, string>,
): Promise<Caller> {
  const header = req.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, response: json({ error: "Missing authorization" }, 401, corsHeaders) };
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey && token === serviceKey) return { ok: true, userId: null, isService: true };
  // Signature already verified by the gateway (verify_jwt = true); the claim is trustworthy.
  if (jwtRole(token) === "service_role") return { ok: true, userId: null, isService: true };
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { ok: false, response: json({ error: "Invalid or expired session" }, 401, corsHeaders) };
  return { ok: true, userId: data.user.id, isService: false };
}

/** The `role` claim of a JWT, or null. Does NOT verify — callers rely on the gateway for that. */
export function jwtRole(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "="));
    const role = JSON.parse(json)?.role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}
