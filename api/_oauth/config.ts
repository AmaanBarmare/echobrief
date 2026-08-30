/**
 * Fixed identities for the OAuth authorization server.
 *
 * ISSUER and RESOURCE are hardcoded rather than derived from the request host
 * on purpose: a client that reached us through a preview deployment or a bare
 * `echobrief.in` must still be told the canonical URLs, otherwise the resource
 * indicator it sends back will never match and every token request fails.
 */
export const ISSUER = "https://www.echobrief.in";
export const RESOURCE = "https://www.echobrief.in/api/mcp";
export const PROTECTED_RESOURCE_METADATA_URL = `${ISSUER}/.well-known/oauth-protected-resource`;

export const SCOPES = ["read", "write:action_items"];

/** SPA route that renders the consent screen. Vercel's catch-all rewrite serves it. */
export const CONSENT_PATH = "/oauth/consent";

export const CODE_TTL_MS = 5 * 60 * 1000;
export const ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
