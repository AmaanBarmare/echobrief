/**
 * Tokens for public share links.
 *
 * Same shape and the same reasoning as the MCP personal access tokens in
 * `api/_mcp/token.ts`: `ebs_live_` + 32 random bytes, stored only as an
 * unsalted sha256 hex digest. 256 bits of entropy is not brute-forceable, so a
 * KDF would add latency to every page view of a shared link and buy nothing.
 *
 * A different prefix from `eb_live_` on purpose. These two credentials grant
 * very different things — a PAT reads the whole account, a share token reads
 * one meeting's summary — and one being mistaken for the other in a log, a
 * support ticket or a lookup is worth a few characters to prevent.
 */

export const SHARE_TOKEN_PREFIX = "ebs_live_";
/** Enough of the token to identify it in a list without being usable. */
export const SHARE_PREFIX_DISPLAY_LENGTH = 15;

export interface GeneratedShareToken {
  token: string;
  hash: string;
  prefix: string;
}

export async function hashShareToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function generateShareToken(): Promise<GeneratedShareToken> {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const token = SHARE_TOKEN_PREFIX + base64url(raw);
  return {
    token,
    hash: await hashShareToken(token),
    prefix: token.slice(0, SHARE_PREFIX_DISPLAY_LENGTH),
  };
}

/**
 * True when the string could be one of our share tokens.
 *
 * Checked before hashing so that a Supabase JWT or an `eb_live_` PAT pasted
 * into a share URL is rejected outright rather than being hashed and looked
 * up — putting a real credential through a code path built for a different one
 * is how credentials end up in the wrong log.
 */
export function looksLikeShareToken(value: string | null | undefined): value is string {
  if (!value) return false;
  if (!value.startsWith(SHARE_TOKEN_PREFIX)) return false;
  const body = value.slice(SHARE_TOKEN_PREFIX.length);
  return /^[A-Za-z0-9_-]{40,48}$/.test(body);
}
