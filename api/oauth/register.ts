/**
 * RFC 7591 Dynamic Client Registration.
 *
 * Open by design — the MCP spec expects any client to be able to register
 * without a human in the loop. What keeps it from being an open write endpoint
 * on the database: strict metadata validation, a per-IP rate limit, and the
 * daily prune of clients that never completed a grant.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkRateLimit } from "../_mcp/ratelimit.js";
import { noStore, oauthError, parseBody } from "../_oauth/http.js";
import { isRegistrableRedirectUri } from "../_oauth/redirect.js";
import { adminClient, registerClient } from "../_oauth/store.js";

const AUTH_METHODS = new Set(["none", "client_secret_post"]);

function clientIp(req: VercelRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
  return first || req.socket?.remoteAddress || "unknown";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();
  noStore(res);

  const limit = checkRateLimit(`register:${clientIp(req)}`);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSeconds));
    return oauthError(res, 429, "invalid_request", "Too many registrations. Try again later.");
  }

  const body = parseBody(req);

  let redirectUris: unknown;
  try {
    redirectUris = body.redirect_uris ? JSON.parse(body.redirect_uris) : undefined;
  } catch {
    redirectUris = undefined;
  }
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    redirectUris.length > 20 ||
    !redirectUris.every((u) => typeof u === "string")
  ) {
    return oauthError(res, 400, "invalid_client_metadata", "redirect_uris must be a non-empty array of strings");
  }
  const bad = (redirectUris as string[]).find((u) => !isRegistrableRedirectUri(u));
  if (bad) {
    return oauthError(res, 400, "invalid_redirect_uri", `redirect_uri must be https or http loopback: ${bad}`);
  }

  const method = body.token_endpoint_auth_method ?? "none";
  if (!AUTH_METHODS.has(method)) {
    return oauthError(res, 400, "invalid_client_metadata", "token_endpoint_auth_method must be none or client_secret_post");
  }

  const clientName = (body.client_name ?? "MCP client").trim().slice(0, 120) || "MCP client";

  const { client, client_secret } = await registerClient(adminClient(), {
    client_name: clientName,
    redirect_uris: redirectUris as string[],
    token_endpoint_auth_method: method as "none" | "client_secret_post",
  });

  res.status(201).json({
    client_id: client.id,
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
    token_endpoint_auth_method: client.token_endpoint_auth_method,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    client_id_issued_at: Math.floor(Date.now() / 1000),
    ...(client_secret ? { client_secret, client_secret_expires_at: 0 } : {}),
  });
}
