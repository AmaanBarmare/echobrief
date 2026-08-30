/**
 * Personal access tokens for the MCP endpoint.
 *
 * The token is `eb_live_` + 32 random bytes base64url = 51 characters. Only its
 * sha256 hex digest is ever stored; the plaintext is shown once at creation and
 * is unrecoverable afterwards. 256 bits of entropy is not brute-forceable, so an
 * unsalted digest is correct here — a KDF would add latency to every request and
 * buy nothing.
 */
import { createHash, randomBytes } from "node:crypto";

export const TOKEN_PREFIX = "eb_live_";
export const TOKEN_PREFIX_DISPLAY_LENGTH = 14;

export interface GeneratedToken {
  token: string;
  hash: string;
  prefix: string;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateToken(): GeneratedToken {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return {
    token,
    hash: hashToken(token),
    prefix: token.slice(0, TOKEN_PREFIX_DISPLAY_LENGTH),
  };
}

/**
 * Returns the token from an Authorization header, or null.
 *
 * The prefix check is not cosmetic: it stops a client that pasted a Supabase
 * JWT into the header from having that JWT hashed and looked up, which would
 * otherwise put a real credential through a code path built for a different one.
 */
export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1];
  return token.startsWith(TOKEN_PREFIX) ? token : null;
}
