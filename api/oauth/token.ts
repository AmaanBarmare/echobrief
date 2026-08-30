/**
 * OAuth 2.1 token endpoint: authorization_code (with PKCE) and refresh_token.
 *
 * The access token handed out is an ordinary eb_live_ personal access token,
 * so api/mcp.ts authenticates it through exactly the same path as a token
 * minted in Settings → Developer. Nothing about RLS scoping changes.
 *
 * Error codes are RFC 6749's — claude.ai keys its refresh logic off
 * `invalid_grant` specifically, so a custom code here would leave users with a
 * connector that silently stops working after 30 days.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { timingSafeEqual } from "node:crypto";
import { hashToken } from "../_mcp/token.js";
import { RESOURCE } from "../_oauth/config.js";
import { noStore, oauthError, parseBody } from "../_oauth/http.js";
import { verifyPkce } from "../_oauth/pkce.js";
import {
  adminClient,
  consumeCode,
  getClient,
  issueTokens,
  rotateRefreshToken,
  type OAuthClient,
} from "../_oauth/store.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secretMatches(client: OAuthClient, presented: string | undefined): boolean {
  if (client.token_endpoint_auth_method === "none") return true;
  if (!presented || !client.client_secret_hash) return false;
  const a = Buffer.from(hashToken(presented));
  const b = Buffer.from(client.client_secret_hash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();
  noStore(res);

  const body = parseBody(req);
  const grantType = body.grant_type;
  if (grantType !== "authorization_code" && grantType !== "refresh_token") {
    return oauthError(res, 400, "unsupported_grant_type", "grant_type must be authorization_code or refresh_token");
  }

  if (grantType === "authorization_code") {
    if (!body.code || !body.code_verifier || !body.redirect_uri || !body.client_id) {
      return oauthError(res, 400, "invalid_request", "code, code_verifier, redirect_uri and client_id are required");
    }
  } else if (!body.refresh_token || !body.client_id) {
    return oauthError(res, 400, "invalid_request", "refresh_token and client_id are required");
  }

  if (!UUID_RE.test(body.client_id)) return oauthError(res, 401, "invalid_client", "Unknown client");
  const admin = adminClient();
  const client = await getClient(admin, body.client_id);
  if (!client || !secretMatches(client, body.client_secret)) {
    return oauthError(res, 401, "invalid_client", "Unknown client or bad client_secret");
  }

  if (grantType === "refresh_token") {
    const tokens = await rotateRefreshToken(admin, body.refresh_token, client);
    if (!tokens) return oauthError(res, 400, "invalid_grant", "refresh_token is invalid, expired or already used");
    return res.status(200).json({ token_type: "Bearer", ...tokens });
  }

  const stored = await consumeCode(admin, body.code);
  if (!stored) return oauthError(res, 400, "invalid_grant", "code is invalid, expired or already used");
  if (stored.client_id !== client.id) return oauthError(res, 400, "invalid_grant", "code was issued to a different client");
  if (stored.redirect_uri !== body.redirect_uri) return oauthError(res, 400, "invalid_grant", "redirect_uri does not match");
  if (!verifyPkce(body.code_verifier, stored.code_challenge)) return oauthError(res, 400, "invalid_grant", "PKCE verification failed");
  const resource = body.resource ?? RESOURCE;
  if (resource !== stored.resource || resource !== RESOURCE) {
    return oauthError(res, 400, "invalid_target", `resource must be ${RESOURCE}`);
  }

  const tokens = await issueTokens(admin, { userId: stored.user_id, client, scope: stored.scope });
  res.status(200).json({ token_type: "Bearer", ...tokens });
}
