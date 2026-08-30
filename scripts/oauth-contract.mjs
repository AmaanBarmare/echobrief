#!/usr/bin/env node
/**
 * Proves the deployed OAuth server is discoverable and rejects what it should,
 * without a human in the loop. Stops at the consent redirect; the actual
 * approve → token round-trip is exercised by connecting claude.ai.
 *
 * Usage: node scripts/oauth-contract.mjs [origin]
 */
const ORIGIN = (process.argv[2] ?? "https://www.echobrief.in").replace(/\/+$/, "");
const RESOURCE = `${ORIGIN}/api/mcp`;
const failures = [];
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name} ${ok ? "" : detail}`);
  if (!ok) failures.push(name);
};

console.log(`OAuth contract check against ${ORIGIN}\n`);

// 1. 401 challenge on the MCP endpoint
const unauth = await fetch(RESOURCE, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
const challenge = unauth.headers.get("www-authenticate") ?? "";
check("MCP 401 carries resource_metadata", unauth.status === 401 && challenge.includes("resource_metadata="), `status=${unauth.status} header=${challenge}`);

// 2. Discovery
const prm = await (await fetch(`${ORIGIN}/.well-known/oauth-protected-resource`)).json().catch(() => null);
check("protected resource metadata resolves", prm?.resource === RESOURCE && prm?.authorization_servers?.[0] === ORIGIN, JSON.stringify(prm));
const prmSuffixed = await (await fetch(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`)).json().catch(() => null);
check("path-suffixed protected resource metadata resolves", prmSuffixed?.resource === RESOURCE);
const asm = await (await fetch(`${ORIGIN}/.well-known/oauth-authorization-server`)).json().catch(() => null);
check("authorization server metadata resolves", asm?.issuer === ORIGIN && asm?.registration_endpoint && asm?.code_challenge_methods_supported?.includes("S256"), JSON.stringify(asm));
if (!asm?.registration_endpoint) {
  console.log("\nCannot continue without authorization server metadata.");
  process.exit(1);
}

// 3. Dynamic client registration
const reg = await fetch(asm.registration_endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ client_name: "oauth-contract-check", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], token_endpoint_auth_method: "none" }),
});
const client = await reg.json().catch(() => null);
check("DCR returns a client_id", reg.status === 201 && typeof client?.client_id === "string", `status=${reg.status} ${JSON.stringify(client)}`);

const badReg = await fetch(asm.registration_endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ client_name: "x", redirect_uris: ["http://evil.example/cb"] }),
});
check("DCR rejects a non-loopback http redirect", badReg.status === 400);

// 4. Authorize → consent redirect
const authz = new URL(asm.authorization_endpoint);
authz.searchParams.set("response_type", "code");
authz.searchParams.set("client_id", client?.client_id ?? "");
authz.searchParams.set("redirect_uri", "https://claude.ai/api/mcp/auth_callback");
authz.searchParams.set("code_challenge", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
authz.searchParams.set("code_challenge_method", "S256");
authz.searchParams.set("resource", RESOURCE);
authz.searchParams.set("state", "contract");
const a = await fetch(authz, { redirect: "manual" });
const loc = a.headers.get("location") ?? "";
check("authorize redirects to the consent page", a.status === 302 && loc.startsWith(`${ORIGIN}/oauth/consent?`), `status=${a.status} location=${loc}`);

const badAuthz = new URL(authz);
badAuthz.searchParams.set("redirect_uri", "https://attacker.example/cb");
const b = await fetch(badAuthz, { redirect: "manual" });
check("authorize refuses an unregistered redirect_uri with 400", b.status === 400, `status=${b.status}`);

const noPkce = new URL(authz);
noPkce.searchParams.delete("code_challenge");
const c = await fetch(noPkce, { redirect: "manual" });
const cLoc = c.headers.get("location") ?? "";
check("authorize without PKCE redirects back with invalid_request", c.status === 302 && cLoc.includes("error=invalid_request") && cLoc.includes("state=contract"), `status=${c.status} location=${cLoc}`);

// 5. Token endpoint error codes
const tok = async (form) => {
  const r = await fetch(asm.token_endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString() });
  return { status: r.status, body: await r.json().catch(() => null), cache: r.headers.get("cache-control") };
};
const t1 = await tok({ grant_type: "authorization_code", code: "A".repeat(43), code_verifier: "B".repeat(43), redirect_uri: "https://claude.ai/api/mcp/auth_callback", client_id: client?.client_id ?? "", resource: RESOURCE });
check("token rejects an unknown code with invalid_grant", t1.status === 400 && t1.body?.error === "invalid_grant" && t1.cache === "no-store", JSON.stringify(t1));
const t2 = await tok({ grant_type: "refresh_token", refresh_token: "eb_refresh_" + "C".repeat(43), client_id: client?.client_id ?? "" });
check("token rejects an unknown refresh token with invalid_grant", t2.status === 400 && t2.body?.error === "invalid_grant", JSON.stringify(t2));
const t3 = await tok({ grant_type: "client_credentials", client_id: client?.client_id ?? "" });
check("token rejects client_credentials with unsupported_grant_type", t3.status === 400 && t3.body?.error === "unsupported_grant_type");

console.log(failures.length ? `\n${failures.length} check(s) failed.` : "\nAll OAuth contract checks passed.");
process.exit(failures.length ? 1 : 0);
