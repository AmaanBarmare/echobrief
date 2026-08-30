/**
 * OAuth 2.1 authorization endpoint.
 *
 * Validates the request and hands the user to the SPA consent page with the
 * same parameters. Nothing is written here — the consent page posts back to
 * /api/oauth/approve with the user's Supabase session, and that endpoint
 * re-validates everything, so a tampered consent URL buys an attacker nothing.
 *
 * Error routing follows OAuth 2.1 §4.1.2.1: an unknown client or a redirect_uri
 * that does not match the registration is answered directly (never redirected,
 * that is how open redirectors are born); every other problem is sent back to
 * the registered redirect_uri as error=…
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CONSENT_PATH, ISSUER, RESOURCE, SCOPES } from "../_oauth/config.js";
import { firstString, oauthError } from "../_oauth/http.js";
import { isValidCodeChallenge } from "../_oauth/pkce.js";
import { redirectUriMatches } from "../_oauth/redirect.js";
import { adminClient, getClient } from "../_oauth/store.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function redirectWithError(
  res: VercelResponse,
  redirectUri: string,
  state: string | undefined,
  error: string,
  description: string,
) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  res.redirect(302, url.toString());
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).end();
  res.setHeader("Cache-Control", "no-store");

  const q = (req.query ?? {}) as Record<string, unknown>;
  const clientId = firstString(q.client_id);
  const redirectUri = firstString(q.redirect_uri);
  const state = firstString(q.state);

  if (!clientId || !redirectUri) {
    return oauthError(res, 400, "invalid_request", "client_id and redirect_uri are required");
  }
  if (!UUID_RE.test(clientId)) {
    return oauthError(res, 400, "invalid_client", "Unknown client_id");
  }

  const client = await getClient(adminClient(), clientId);
  if (!client) return oauthError(res, 400, "invalid_client", "Unknown client_id");
  if (!redirectUriMatches(client.redirect_uris, redirectUri)) {
    return oauthError(res, 400, "invalid_request", "redirect_uri is not registered for this client");
  }

  // From here on, errors go back to the (now trusted) redirect_uri.
  if (firstString(q.response_type) !== "code") {
    return redirectWithError(res, redirectUri, state, "unsupported_response_type", "response_type must be code");
  }
  const codeChallenge = firstString(q.code_challenge) ?? "";
  const method = firstString(q.code_challenge_method) ?? "";
  if (method !== "S256" || !isValidCodeChallenge(codeChallenge)) {
    return redirectWithError(res, redirectUri, state, "invalid_request", "PKCE with code_challenge_method=S256 is required");
  }
  const resource = firstString(q.resource) ?? RESOURCE;
  if (resource !== RESOURCE) {
    return redirectWithError(res, redirectUri, state, "invalid_target", `resource must be ${RESOURCE}`);
  }
  const requested = (firstString(q.scope) ?? SCOPES.join(" ")).split(/\s+/).filter(Boolean);
  const unknown = requested.filter((s) => !SCOPES.includes(s));
  if (unknown.length) {
    return redirectWithError(res, redirectUri, state, "invalid_scope", `Unknown scope: ${unknown.join(" ")}`);
  }
  const scope = SCOPES.filter((s) => requested.includes(s)).join(" ") || SCOPES.join(" ");

  const consent = new URL(CONSENT_PATH, ISSUER);
  consent.searchParams.set("client_id", client.id);
  consent.searchParams.set("client_name", client.client_name);
  consent.searchParams.set("redirect_uri", redirectUri);
  consent.searchParams.set("code_challenge", codeChallenge);
  consent.searchParams.set("code_challenge_method", "S256");
  consent.searchParams.set("resource", resource);
  consent.searchParams.set("scope", scope);
  if (state) consent.searchParams.set("state", state);
  res.redirect(302, consent.toString());
}
