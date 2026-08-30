import test from "node:test";
import assert from "node:assert/strict";
import handler from "../../oauth/approve.js";
import { serve } from "./_serve.js";

test("approve without a session is 401", async () => {
  const { server, port } = await serve(handler);
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/oauth/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "approve" }),
    });
    assert.equal(r.status, 401);
    assert.equal(((await r.json() as any)).error, "invalid_session");
  } finally { server.close(); }
});

test("approve rejects an unknown decision before touching auth", async () => {
  const { server, port } = await serve(handler);
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/oauth/approve`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer x" },
      body: JSON.stringify({ decision: "maybe" }),
    });
    assert.equal(r.status, 400);
    assert.equal(((await r.json() as any)).error, "invalid_request");
  } finally { server.close(); }
});
