/**
 * The two discovery documents (RFC 9728, RFC 8414) and the 401 challenge that
 * points clients at the first of them. Pure functions of config.ts.
 */
import { ISSUER, PROTECTED_RESOURCE_METADATA_URL, RESOURCE, SCOPES } from "./config.js";

export function protectedResourceMetadata() {
  return {
    resource: RESOURCE,
    authorization_servers: [ISSUER],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
    resource_name: "EchoBrief",
    resource_documentation: `${ISSUER}/docs`,
  };
}

export function authorizationServerMetadata() {
  return {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/api/oauth/authorize`,
    token_endpoint: `${ISSUER}/api/oauth/token`,
    registration_endpoint: `${ISSUER}/api/oauth/register`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    scopes_supported: SCOPES,
    service_documentation: `${ISSUER}/docs`,
  };
}

export function wwwAuthenticate(): string {
  return `Bearer realm="echobrief", resource_metadata="${PROTECTED_RESOURCE_METADATA_URL}", scope="${SCOPES.join(" ")}"`;
}
