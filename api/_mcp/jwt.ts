/**
 * Mints the short-lived Supabase user JWT that makes RLS the MCP server's access
 * control.
 *
 * This is the single most important function in the server. A personal access
 * token is not a Supabase credential, so the obvious implementation is a
 * service-role client plus `.eq("user_id", uid)` on every query — the pattern
 * docs/database.md warns about, where one forgotten filter leaks another user's
 * meetings. Minting a 60-second user JWT instead means a tool author who forgets
 * a filter gets an empty result, not somebody else's data.
 *
 * The project signs with the legacy symmetric secret (its anon and service-role
 * keys decode to alg: HS256). If the project is ever migrated to asymmetric
 * signing keys, this function switches to ES256 with the project's private key
 * and nothing else in the server changes.
 */
import { createHmac } from "node:crypto";

const encodeSegment = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

export interface MintOptions {
  secret: string;
  issuer: string;
  ttlSeconds?: number;
  now?: number;
}

export interface MintedJwt {
  token: string;
  expiresAt: number;
}

export function mintUserJwt(userId: string, opts: MintOptions): MintedJwt {
  if (!opts.secret) {
    throw new Error("SUPABASE_JWT_SECRET is not configured");
  }
  const issuedAt = Math.floor((opts.now ?? Date.now()) / 1000);
  const expiresAt = issuedAt + (opts.ttlSeconds ?? 60);

  const header = encodeSegment({ alg: "HS256", typ: "JWT" });
  const payload = encodeSegment({
    sub: userId,
    role: "authenticated",
    aud: "authenticated",
    iss: opts.issuer,
    iat: issuedAt,
    exp: expiresAt,
  });
  const signingInput = `${header}.${payload}`;
  const signature = createHmac("sha256", opts.secret)
    .update(signingInput)
    .digest("base64url");

  return { token: `${signingInput}.${signature}`, expiresAt };
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const segment = token.split(".")[1];
  if (!segment) throw new Error("malformed JWT");
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}
