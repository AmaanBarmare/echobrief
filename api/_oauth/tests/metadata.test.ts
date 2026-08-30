import test from "node:test";
import assert from "node:assert/strict";
import {
  authorizationServerMetadata,
  protectedResourceMetadata,
  wwwAuthenticate,
} from "../metadata.js";
import { ISSUER, RESOURCE, SCOPES } from "../config.js";

test("constants have no trailing slash", () => {
  assert.equal(ISSUER, "https://www.echobrief.in");
  assert.equal(RESOURCE, "https://www.echobrief.in/api/mcp");
});

test("protected resource metadata names the resource and the issuer", () => {
  const doc = protectedResourceMetadata() as Record<string, unknown>;
  assert.equal(doc.resource, RESOURCE);
  assert.deepEqual(doc.authorization_servers, [ISSUER]);
  assert.deepEqual(doc.scopes_supported, SCOPES);
  assert.deepEqual(doc.bearer_methods_supported, ["header"]);
});

test("authorization server metadata advertises S256, DCR and both grants", () => {
  const doc = authorizationServerMetadata() as Record<string, unknown>;
  assert.equal(doc.issuer, ISSUER);
  assert.equal(doc.authorization_endpoint, `${ISSUER}/api/oauth/authorize`);
  assert.equal(doc.token_endpoint, `${ISSUER}/api/oauth/token`);
  assert.equal(doc.registration_endpoint, `${ISSUER}/api/oauth/register`);
  assert.deepEqual(doc.response_types_supported, ["code"]);
  assert.deepEqual(doc.grant_types_supported, ["authorization_code", "refresh_token"]);
  assert.deepEqual(doc.code_challenge_methods_supported, ["S256"]);
  assert.deepEqual(doc.token_endpoint_auth_methods_supported, ["none", "client_secret_post"]);
  assert.deepEqual(doc.scopes_supported, SCOPES);
});

test("WWW-Authenticate points at the protected resource metadata", () => {
  const header = wwwAuthenticate();
  assert.ok(header.startsWith("Bearer "));
  assert.ok(header.includes('realm="echobrief"'));
  assert.ok(
    header.includes(
      'resource_metadata="https://www.echobrief.in/.well-known/oauth-protected-resource"',
    ),
  );
  assert.ok(header.includes('scope="read write:action_items"'));
});
