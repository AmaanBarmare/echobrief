/**
 * Caller identity for user-facing edge functions that also need a
 * service-role path (backfills, other functions).
 *
 *   - `Authorization: Bearer <user JWT>`  → { userId, isService: false }
 *   - `Authorization: Bearer <service key>` → { userId: null, isService: true }
 *
 * Functions using this must set `verify_jwt = false` in config.toml (the
 * gateway would otherwise reject the service key) and MUST scope every read by
 * `userId` when `isService` is false.
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

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export async function authenticate(req: Request, supabase: any): Promise<Caller> {
  const header = req.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, response: json({ error: "Missing authorization" }, 401) };
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceKey && token === serviceKey) return { ok: true, userId: null, isService: true };
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { ok: false, response: json({ error: "Invalid or expired session" }, 401) };
  return { ok: true, userId: data.user.id, isService: false };
}
