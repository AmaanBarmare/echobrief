/**
 * Turns a personal access token into an RLS-scoped Supabase client.
 *
 * The service-role key is used for exactly one query — resolving the token hash
 * to a user — and never leaves this module. Tool handlers receive only the
 * scoped client, so a handler that forgets a filter returns nothing rather than
 * somebody else's meetings.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hashToken, parseBearer } from "./token.ts";
import { mintUserJwt } from "./jwt.ts";

/** One write per token per hour, not per request. See engineering-notes.md #22. */
const LAST_USED_THROTTLE_MS = 60 * 60 * 1000;

export interface McpSession {
  userId: string;
  tokenId: string;
  scopes: string[];
  supabase: SupabaseClient;
}

export class AuthError extends Error {
  // A plain field, not a TypeScript parameter property: Node's strip-only type
  // stripping (which is what runs these files under `node --test`) rejects
  // parameter properties, even though esbuild on Vercel accepts them.
  readonly status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) throw new AuthError(`${key} is not configured`, 500);
  return value;
}

export async function authenticate(
  authHeader: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<McpSession> {
  const token = parseBearer(authHeader);
  if (!token) {
    throw new AuthError(
      "Missing or malformed Authorization header. Expected: Bearer eb_live_…",
    );
  }

  const supabaseUrl = requireEnv(env, "SUPABASE_URL");
  const admin = createClient(supabaseUrl, requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const { data: row, error } = await admin
    .from("api_tokens")
    .select("id, user_id, scopes, revoked_at, expires_at, last_used_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (error) throw new AuthError(`Token lookup failed: ${error.message}`, 500);
  if (!row) throw new AuthError("Unknown token");
  if (row.revoked_at) throw new AuthError("This token has been revoked");
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    throw new AuthError("This token has expired");
  }

  const staleBy = row.last_used_at
    ? Date.now() - new Date(row.last_used_at).getTime()
    : Infinity;
  if (staleBy >= LAST_USED_THROTTLE_MS) {
    await admin
      .from("api_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", row.id);
  }

  const { token: userJwt } = mintUserJwt(row.user_id, {
    secret: requireEnv(env, "SUPABASE_JWT_SECRET"),
    issuer: `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`,
  });

  const supabase = createClient(supabaseUrl, requireEnv(env, "SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  });

  return {
    userId: row.user_id,
    tokenId: row.id,
    scopes: row.scopes ?? [],
    supabase,
  };
}
