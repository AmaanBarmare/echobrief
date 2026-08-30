/**
 * Every database access the OAuth server makes, behind one service-role client.
 *
 * Three rules this module enforces so the handlers cannot get them wrong:
 *
 *  1. Nothing secret is stored in plaintext. Codes, refresh tokens and client
 *     secrets are looked up by sha256 hex, the same digest api_tokens uses.
 *  2. Codes are consumed atomically. `UPDATE … WHERE used_at IS NULL` returning
 *     the row is the single-use guarantee; two racing token requests get one
 *     winner and one invalid_grant.
 *  3. A refresh token is used once. Presenting it a second time is treated as
 *     theft: the access token it was rotated into is revoked (OAuth 2.1 §4.3.1).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { generateToken, hashToken } from "../_mcp/token.js";
import { ACCESS_TOKEN_TTL_MS, CODE_TTL_MS, REFRESH_TOKEN_TTL_MS } from "./config.js";

export const REFRESH_PREFIX = "eb_refresh_";

export interface OAuthClient {
  id: string;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: "none" | "client_secret_post";
  client_secret_hash: string | null;
}

export interface StoredCode {
  id: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  code_challenge: string;
  resource: string;
  scope: string;
  expires_at: string;
}

export interface IssuedTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
}

const random43 = () => randomBytes(32).toString("base64url");

export function generateRefreshToken() {
  const token = REFRESH_PREFIX + random43();
  return { token, hash: hashToken(token) };
}

export function generateCode() {
  const code = random43();
  return { code, hash: hashToken(code) };
}

export function generateClientSecret() {
  const secret = random43();
  return { secret, hash: hashToken(secret) };
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`${key} is not configured`);
  return value;
}

export function adminClient(env: NodeJS.ProcessEnv = process.env): SupabaseClient {
  return createClient(requireEnv(env, "SUPABASE_URL"), requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

const CLIENT_COLUMNS = "id, client_name, redirect_uris, token_endpoint_auth_method, client_secret_hash";

export async function registerClient(
  admin: SupabaseClient,
  input: { client_name: string; redirect_uris: string[]; token_endpoint_auth_method: "none" | "client_secret_post" },
): Promise<{ client: OAuthClient; client_secret?: string }> {
  const secret = input.token_endpoint_auth_method === "client_secret_post" ? generateClientSecret() : null;
  const { data, error } = await admin
    .from("oauth_clients")
    .insert({
      client_name: input.client_name,
      redirect_uris: input.redirect_uris,
      token_endpoint_auth_method: input.token_endpoint_auth_method,
      client_secret_hash: secret?.hash ?? null,
    })
    .select(CLIENT_COLUMNS)
    .single();
  if (error) throw new Error(`registerClient: ${error.message}`);
  return { client: data as OAuthClient, client_secret: secret?.secret };
}

export async function getClient(admin: SupabaseClient, id: string): Promise<OAuthClient | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await admin.from("oauth_clients").select(CLIENT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`getClient: ${error.message}`);
  return (data as OAuthClient | null) ?? null;
}

export async function createCode(
  admin: SupabaseClient,
  input: Omit<StoredCode, "id" | "expires_at">,
  now: number = Date.now(),
): Promise<string> {
  const { code, hash } = generateCode();
  const { error } = await admin.from("oauth_codes").insert({
    code_hash: hash,
    client_id: input.client_id,
    user_id: input.user_id,
    redirect_uri: input.redirect_uri,
    code_challenge: input.code_challenge,
    resource: input.resource,
    scope: input.scope,
    expires_at: new Date(now + CODE_TTL_MS).toISOString(),
  });
  if (error) throw new Error(`createCode: ${error.message}`);
  return code;
}

export async function consumeCode(
  admin: SupabaseClient,
  code: string,
  now: number = Date.now(),
): Promise<StoredCode | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) return null;
  const { data, error } = await admin
    .from("oauth_codes")
    .update({ used_at: new Date(now).toISOString() })
    .eq("code_hash", hashToken(code))
    .is("used_at", null)
    .gt("expires_at", new Date(now).toISOString())
    .select("id, client_id, user_id, redirect_uri, code_challenge, resource, scope, expires_at")
    .maybeSingle();
  if (error) throw new Error(`consumeCode: ${error.message}`);
  return (data as StoredCode | null) ?? null;
}

export async function issueTokens(
  admin: SupabaseClient,
  input: { userId: string; client: OAuthClient; scope: string },
  now: number = Date.now(),
): Promise<IssuedTokens> {
  const access = generateToken();
  const accessExpires = new Date(now + ACCESS_TOKEN_TTL_MS);
  const { data: tokenRow, error: tokenError } = await admin
    .from("api_tokens")
    .insert({
      user_id: input.userId,
      name: `${input.client.client_name} (OAuth)`.slice(0, 60),
      token_hash: access.hash,
      token_prefix: access.prefix,
      expires_at: accessExpires.toISOString(),
    })
    .select("id")
    .single();
  if (tokenError) throw new Error(`issueTokens/api_tokens: ${tokenError.message}`);

  const refresh = generateRefreshToken();
  const { error: refreshError } = await admin.from("oauth_refresh_tokens").insert({
    token_hash: refresh.hash,
    client_id: input.client.id,
    user_id: input.userId,
    api_token_id: tokenRow.id,
    scope: input.scope,
    expires_at: new Date(now + REFRESH_TOKEN_TTL_MS).toISOString(),
  });
  if (refreshError) throw new Error(`issueTokens/refresh: ${refreshError.message}`);

  await admin.from("oauth_clients").update({ last_used_at: new Date(now).toISOString() }).eq("id", input.client.id);

  return {
    access_token: access.token,
    refresh_token: refresh.token,
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    scope: input.scope,
  };
}

export async function rotateRefreshToken(
  admin: SupabaseClient,
  refreshToken: string,
  client: OAuthClient,
  now: number = Date.now(),
): Promise<IssuedTokens | null> {
  if (!refreshToken.startsWith(REFRESH_PREFIX)) return null;
  const hash = hashToken(refreshToken);
  const nowIso = new Date(now).toISOString();

  // Atomic claim: only one caller can flip used_at from null.
  const { data: claimed, error: claimError } = await admin
    .from("oauth_refresh_tokens")
    .update({ used_at: nowIso })
    .eq("token_hash", hash)
    .eq("client_id", client.id)
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .select("id, user_id, api_token_id, scope")
    .maybeSingle();
  if (claimError) throw new Error(`rotateRefreshToken/claim: ${claimError.message}`);

  if (!claimed) {
    // Reuse or unknown. If it is a real but already-used token for this client,
    // treat as theft and revoke the access token it was tied to.
    const { data: spent } = await admin
      .from("oauth_refresh_tokens")
      .select("api_token_id")
      .eq("token_hash", hash)
      .eq("client_id", client.id)
      .not("used_at", "is", null)
      .maybeSingle();
    if (spent?.api_token_id) {
      await admin.from("api_tokens").update({ revoked_at: nowIso }).eq("id", spent.api_token_id).is("revoked_at", null);
    }
    return null;
  }

  // Revoke the old access token, then mint a fresh pair.
  await admin.from("api_tokens").update({ revoked_at: nowIso }).eq("id", claimed.api_token_id).is("revoked_at", null);
  return issueTokens(admin, { userId: claimed.user_id, client, scope: claimed.scope }, now);
}
