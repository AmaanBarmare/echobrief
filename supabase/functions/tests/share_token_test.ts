/**
 * Share-link tokens.
 *
 * The token in the URL is the entire credential for a public share, so the
 * properties worth pinning are: enough entropy, a stable hash, and a prefix
 * check that refuses other credentials before they reach a lookup.
 */
import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  generateShareToken,
  hashShareToken,
  looksLikeShareToken,
  SHARE_TOKEN_PREFIX,
} from "../_shared/share-token.ts";

Deno.test("a generated token carries the prefix and 256 bits of entropy", async () => {
  const { token, hash, prefix } = await generateShareToken();
  assert(token.startsWith(SHARE_TOKEN_PREFIX), token);
  // 32 random bytes as base64url is 43 characters.
  assertEquals(token.length, SHARE_TOKEN_PREFIX.length + 43);
  assert(/^[0-9a-f]{64}$/.test(hash), "hash must be sha256 hex");
  assert(token.startsWith(prefix));
});

Deno.test("tokens do not repeat", async () => {
  const seen = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const { token } = await generateShareToken();
    assert(!seen.has(token), "generated a duplicate token");
    seen.add(token);
  }
});

Deno.test("hashing is stable and collision-free across tokens", async () => {
  const a = await generateShareToken();
  const b = await generateShareToken();
  assertEquals(await hashShareToken(a.token), a.hash);
  assertNotEquals(a.hash, b.hash);
});

Deno.test("the hash never contains the plaintext", async () => {
  const { token, hash } = await generateShareToken();
  const body = token.slice(SHARE_TOKEN_PREFIX.length);
  assert(!hash.includes(body));
});

Deno.test("looksLikeShareToken accepts our tokens", async () => {
  for (let i = 0; i < 20; i++) {
    const { token } = await generateShareToken();
    assert(looksLikeShareToken(token), token);
  }
});

Deno.test("looksLikeShareToken refuses other credentials before they are hashed", () => {
  // The point of the guard: a PAT or a Supabase JWT pasted into a share URL
  // must not be put through a lookup built for a different credential.
  const rejects = [
    null,
    undefined,
    "",
    "eb_live_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHI", // an MCP PAT
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.sig", // a JWT
    SHARE_TOKEN_PREFIX, // prefix with no body
    SHARE_TOKEN_PREFIX + "short",
    SHARE_TOKEN_PREFIX + "has spaces in the body aaaaaaaaaaaaaaaaaaaaa",
    SHARE_TOKEN_PREFIX + "contains/slash+plus====aaaaaaaaaaaaaaaaaaaaaa",
    "ebs_test_" + "a".repeat(43), // right shape, wrong prefix
  ];
  for (const value of rejects) {
    assertEquals(looksLikeShareToken(value), false, String(value).slice(0, 40));
  }
});

Deno.test("the share prefix is distinct from the MCP token prefix", () => {
  // Both are bearer credentials for this product and grant very different
  // things; one being mistaken for the other in a log or a lookup is the risk.
  assert(!SHARE_TOKEN_PREFIX.startsWith("eb_live_"));
  assert(!"eb_live_".startsWith(SHARE_TOKEN_PREFIX));
});
