import { assertEquals, assertMatch } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { generateToken, sha256Hex } from "../manage-api-tokens/token.ts";

Deno.test("sha256Hex matches the Node vector used by api/_mcp/token.ts", async () => {
  assertEquals(
    await sha256Hex("eb_live_TESTVECTOR"),
    "508340794122ab56cb8727312867f7a3d9c80d46bd80fa4b0d6384b5f2e90510",
  );
});

Deno.test("generateToken matches the format api/_mcp/token.ts parses", async () => {
  const { token, hash, prefix } = await generateToken();
  assertMatch(token, /^eb_live_[A-Za-z0-9_-]{43}$/);
  assertEquals(token.length, 51);
  assertEquals(prefix, token.slice(0, 14));
  assertEquals(hash, await sha256Hex(token));
  assertMatch(hash, /^[0-9a-f]{64}$/);
});

Deno.test("generateToken is not deterministic", async () => {
  const a = await generateToken();
  const b = await generateToken();
  assertEquals(a.token === b.token, false);
});
