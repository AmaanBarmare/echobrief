/**
 * Minimal stand-in for Vercel's request/response helpers so the api/oauth/*
 * handlers can be exercised over real HTTP under node:test without a database
 * (every path tested here is rejected before the store is touched).
 */
import { createServer, type Server } from "node:http";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (req: any, res: any) => unknown;

export function serve(handler: Handler): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://x");
      (req as any).query = Object.fromEntries(url.searchParams);
      (req as any).body = raw;
      (res as any).status = (code: number) => { res.statusCode = code; return res; };
      (res as any).json = (obj: unknown) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(obj));
        return res;
      };
      (res as any).redirect = (code: number, to: string) => {
        res.statusCode = code;
        res.setHeader("location", to);
        res.end();
        return res;
      };
      Promise.resolve()
        .then(() => handler(req, res))
        .catch(() => { res.statusCode = 500; res.end(); });
    });
  });
  return new Promise((resolve) =>
    server.listen(0, () => resolve({ server, port: (server.address() as { port: number }).port })),
  );
}
