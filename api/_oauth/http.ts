/**
 * Small request/response helpers shared by the api/oauth/* handlers.
 *
 * Vercel parses JSON and urlencoded bodies into `req.body` when the
 * Content-Type is right, but the node:test harness hands us raw strings, and a
 * client that forgets the header hands us a Buffer. parseBody flattens all of
 * those into one string map so the handlers never care.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";

export function firstString(value: unknown): string | undefined {
  if (Array.isArray(value)) value = value[0];
  return typeof value === "string" ? value : undefined;
}

export function parseBody(req: VercelRequest): Record<string, string> {
  let raw: unknown = req.body;
  if (Buffer.isBuffer(raw)) raw = raw.toString("utf8");

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    const contentType = String(req.headers["content-type"] ?? "");
    if (contentType.includes("application/json") || trimmed.startsWith("{")) {
      try {
        raw = JSON.parse(trimmed);
      } catch {
        return {};
      }
    } else {
      raw = Object.fromEntries(new URLSearchParams(trimmed));
    }
  }

  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) || typeof value === "object") {
      // redirect_uris and friends come as arrays; keep JSON so callers can parse.
      out[key] = JSON.stringify(value);
    } else {
      out[key] = String(value);
    }
  }
  return out;
}

export function noStore(res: VercelResponse): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
}

export function oauthError(
  res: VercelResponse,
  status: number,
  error: string,
  description?: string,
): void {
  noStore(res);
  res.status(status).json(description ? { error, error_description: description } : { error });
}
