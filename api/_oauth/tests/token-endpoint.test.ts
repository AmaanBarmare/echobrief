import test from "node:test";
import assert from "node:assert/strict";
import handler from "../../oauth/token.js";
import { serve } from "./_serve.js";

async function post(port: number, form: Record<string, string>) {
  const r = await fetch(`http://127.0.0.1:${port}/api/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  return { status: r.status, body: (await r.json() as any), cache: r.headers.get("cache-control") };
}

test("token: unsupported grant_type", async () => {
  const { server, port } = await serve(handler);
  try {
    const r = await post(port, { grant_type: "password" });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "unsupported_grant_type");
    assert.equal(r.cache, "no-store");
  } finally { server.close(); }
});

test("token: authorization_code without a verifier is invalid_request", async () => {
  const { server, port } = await serve(handler);
  try {
    const r = await post(port, { grant_type: "authorization_code", code: "x", client_id: "00000000-0000-0000-0000-000000000000", redirect_uri: "https://claude.ai/cb" });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "invalid_request");
  } finally { server.close(); }
});

test("token: malformed client_id is invalid_client", async () => {
  const { server, port } = await serve(handler);
  try {
    const r = await post(port, { grant_type: "refresh_token", refresh_token: "eb_refresh_x", client_id: "nope" });
    assert.equal(r.status, 401);
    assert.equal(r.body.error, "invalid_client");
  } finally { server.close(); }
});
