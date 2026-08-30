/**
 * Token generation for MCP personal access tokens.
 *
 * Kept separate from index.ts so it can be unit-tested without starting the
 * function's HTTP listener.
 *
 * These three constants and the hash format are shared with api/_mcp/token.ts,
 * which runs on Node with no compiler between the two. If they ever disagree,
 * every token silently fails to authenticate — which is why the parity test in
 * supabase/functions/tests/api_tokens_test.ts pins the same sha256 vector the
 * Node test uses.
 */
export const TOKEN_PREFIX = "eb_live_";
export const TOKEN_PREFIX_DISPLAY_LENGTH = 14;

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface GeneratedToken {
  token: string;
  hash: string;
  prefix: string;
}

export async function generateToken(): Promise<GeneratedToken> {
  const token = TOKEN_PREFIX +
    base64url(crypto.getRandomValues(new Uint8Array(32)));
  return {
    token,
    hash: await sha256Hex(token),
    prefix: token.slice(0, TOKEN_PREFIX_DISPLAY_LENGTH),
  };
}
