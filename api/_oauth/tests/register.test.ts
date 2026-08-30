import test from "node:test";
import assert from "node:assert/strict";
import handler from "../../oauth/register.js";
import { serve } from "./_serve.js";

async function post(port: number, body: unknown) {
  const r = await fetch(`http://127.0.0.1:${port}/api/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json() as any) };
}

test("register rejects a missing redirect_uris with invalid_client_metadata", async () => {
  const { server, port } = await serve(handler);
  try {
    const r = await post(port, { client_name: "Claude" });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "invalid_client_metadata");
  } finally { server.close(); }
});

test("register rejects a non-loopback http redirect", async () => {
  const { server, port } = await serve(handler);
  try {
    const r = await post(port, { client_name: "Claude", redirect_uris: ["http://evil.example/cb"] });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "invalid_redirect_uri");
  } finally { server.close(); }
});

test("register rejects an unsupported auth method", async () => {
  const { server, port } = await serve(handler);
  try {
    const r = await post(port, {
      client_name: "Claude",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      token_endpoint_auth_method: "private_key_jwt",
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "invalid_client_metadata");
  } finally { server.close(); }
});

test("register answers GET with 405", async () => {
  const { server, port } = await serve(handler);
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/oauth/register`);
    assert.equal(r.status, 405);
  } finally { server.close(); }
});
