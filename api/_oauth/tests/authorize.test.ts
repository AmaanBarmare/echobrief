import test from "node:test";
import assert from "node:assert/strict";
import handler from "../../oauth/authorize.js";
import { serve } from "./_serve.js";

test("authorize without client_id is a 400, not a redirect", async () => {
  const { server, port } = await serve(handler);
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/oauth/authorize?redirect_uri=https://claude.ai/cb`, { redirect: "manual" });
    assert.equal(r.status, 400);
    assert.equal(((await r.json() as any)).error, "invalid_request");
  } finally { server.close(); }
});

test("authorize with a malformed client_id is a 400 before any DB call", async () => {
  const { server, port } = await serve(handler);
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/oauth/authorize?client_id=nope&redirect_uri=https://claude.ai/cb`, { redirect: "manual" });
    assert.equal(r.status, 400);
    assert.equal(((await r.json() as any)).error, "invalid_client");
  } finally { server.close(); }
});
