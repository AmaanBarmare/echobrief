/**
 * The consent page's only backend call.
 *
 * Identifies the user from their Supabase session JWT (the same check
 * manage-api-tokens does), re-validates every OAuth parameter against the
 * registered client — the SPA is not trusted to have done so — and either
 * writes a single-use authorization code or builds an access_denied redirect.
 * Returns the redirect as JSON so the browser, not a cross-origin fetch,
 * performs the navigation.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { RESOURCE, SCOPES } from "../_oauth/config.js";
import { noStore, oauthError, parseBody } from "../_oauth/http.js";
import { isValidCodeChallenge } from "../_oauth/pkce.js";
import { redirectUriMatches } from "../_oauth/redirect.js";
import { adminClient, createCode, getClient } from "../_oauth/store.js";

const ALLOWED_ORIGINS = new Set(["https://www.echobrief.in", "https://echobrief.in", "http://localhost:8080"]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = String(req.headers.origin ?? "");
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).end();
  noStore(res);

  const body = parseBody(req);
  if (body.decision !== "approve" && body.decision !== "deny") {
    return oauthError(res, 400, "invalid_request", "decision must be approve or deny");
  }

  const auth = String(req.headers.authorization ?? "");
  const jwt = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!jwt) return oauthError(res, 401, "invalid_session", "Sign in to continue");

  const admin = adminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(jwt);
  if (userError || !userData?.user) return oauthError(res, 401, "invalid_session", "Sign in to continue");
  const userId = userData.user.id;

  const client = body.client_id ? await getClient(admin, body.client_id) : null;
  if (!client) return oauthError(res, 400, "invalid_client", "Unknown client_id");
  const redirectUri = body.redirect_uri ?? "";
  if (!redirectUriMatches(client.redirect_uris, redirectUri)) {
    return oauthError(res, 400, "invalid_request", "redirect_uri is not registered for this client");
  }

  const target = new URL(redirectUri);
  if (body.state) target.searchParams.set("state", body.state);

  if (body.decision === "deny") {
    target.searchParams.set("error", "access_denied");
    target.searchParams.set("error_description", "The user declined the request");
    return res.status(200).json({ redirect_to: target.toString() });
  }

  const codeChallenge = body.code_challenge ?? "";
  if (body.code_challenge_method !== "S256" || !isValidCodeChallenge(codeChallenge)) {
    return oauthError(res, 400, "invalid_request", "PKCE S256 code_challenge is required");
  }
  const resource = body.resource ?? RESOURCE;
  if (resource !== RESOURCE) return oauthError(res, 400, "invalid_target", `resource must be ${RESOURCE}`);
  const requested = (body.scope ?? "").split(/\s+/).filter(Boolean);
  if (requested.some((s) => !SCOPES.includes(s))) return oauthError(res, 400, "invalid_scope", "Unknown scope");
  const scope = (requested.length ? SCOPES.filter((s) => requested.includes(s)) : SCOPES).join(" ");

  const code = await createCode(admin, {
    client_id: client.id,
    user_id: userId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    resource,
    scope,
  });

  target.searchParams.set("code", code);
  res.status(200).json({ redirect_to: target.toString() });
}
