/**
 * Handler-level tests for the endpoint's pre-auth behaviour.
 *
 * These need no database: every path here is rejected before `authenticate`
 * reaches Supabase. What they actually prove is that the whole import graph
 * loads and the error contract holds — which is how the TypeScript parameter
 * property in AuthError was caught (esbuild accepts it, Node's type-stripping
 * does not, so it would have failed only for anyone trying to test this file).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import handler from "../../mcp.ts";

function startServer(): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      // Minimal stand-ins for the Vercel request/response helpers.
      (req as any).body = raw ? JSON.parse(raw) : undefined;
      (res as any).status = (code: number) => { res.statusCode = code; return res; };
      (res as any).json = (obj: unknown) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(obj));
        return res;
      };
      void (handler as any)(req, res).catch(() => {
        res.statusCode = 500;
        res.end();
      });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, () => {
      resolve({ server, port: (server.address() as { port: number }).port });
    });
  });
}

async function withServer<T>(fn: (port: number) => Promise<T>): Promise<T> {
  const { server, port } = await startServer();
  try {
    return await fn(port);
  } finally {
    server.close();
  }
}

const toolsList = (port: number, headers: Record<string, string> = {}) =>
  fetch(`http://127.0.0.1:${port}/api/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });

test("a request with no token is rejected with a bearer challenge", async () => {
  await withServer(async (port) => {
    const response = await toolsList(port);
    assert.equal(response.status, 401);
    assert.match(response.headers.get("www-authenticate") ?? "", /Bearer/);
    const body = (await response.json()) as { jsonrpc?: string; error?: unknown };
    assert.equal(body.jsonrpc, "2.0");
    assert.ok(body.error, "expected a JSON-RPC error object");
  });
});

test("a Supabase JWT pasted into the header is not accepted as a token", async () => {
  await withServer(async (port) => {
    const response = await toolsList(port, {
      authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.fake.signature",
    });
    assert.equal(response.status, 401);
  });
});

test("GET is refused, because a stateless server has no stream to open", async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/mcp`, { method: "GET" });
    assert.equal(response.status, 405);
  });
});

test("OPTIONS preflight succeeds and advertises the auth header", async () => {
  await withServer(async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/mcp`, { method: "OPTIONS" });
    assert.equal(response.status, 204);
    assert.match(response.headers.get("access-control-allow-headers") ?? "", /authorization/);
  });
});
