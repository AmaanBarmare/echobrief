/**
 * EchoBrief's MCP endpoint.
 *
 * Stateless Streamable HTTP: every POST carries a complete JSON-RPC request and
 * nothing is retained between calls. Vercel function instances are ephemeral and
 * may be recycled at any point, so a session store here would be a correctness
 * bug waiting for its first cold start.
 *
 * Deploys go through GitHub auto-deploy. The Vercel account that owns
 * echobrief.in is separate from the local CLI login — do not use `vercel` here.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AuthError, authenticate, type McpSession } from "./_mcp/auth.js";
import { checkRateLimit } from "./_mcp/ratelimit.js";
import { registerTools } from "./_mcp/tools.js";

const SERVER_INFO = { name: "echobrief", version: "1.0.0" };

function setCors(res: VercelResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, content-type, mcp-session-id, mcp-protocol-version",
  );
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id, mcp-protocol-version");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // GET opens an SSE stream and DELETE closes a session; a stateless server has
  // neither. Answering 405 is what the spec expects from a server without them.
  if (req.method !== "POST") {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "This server is stateless. Use POST." },
      id: null,
    });
    return;
  }

  let session: McpSession;
  try {
    session = await authenticate(req.headers.authorization);
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    if (status === 401) res.setHeader("WWW-Authenticate", 'Bearer realm="echobrief"');
    res.status(status).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: (error as Error).message },
      id: null,
    });
    return;
  }

  const limit = checkRateLimit(session.tokenId);
  if (!limit.allowed) {
    res.setHeader("Retry-After", String(limit.retryAfterSeconds));
    res.status(429).json({
      jsonrpc: "2.0",
      error: {
        code: -32002,
        message: `Rate limit exceeded. Retry in ${limit.retryAfterSeconds}s.`,
      },
      id: null,
    });
    return;
  }

  const server = new McpServer(SERVER_INFO);
  registerTools(server, session);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("[mcp]", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: (error as Error).message },
        id: null,
      });
    }
  }
}
