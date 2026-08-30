import test from "node:test";
import assert from "node:assert/strict";
import {
  TOKEN_PREFIX,
  generateToken,
  hashToken,
  parseBearer,
} from "../token.js";

test("generateToken produces a 51-character prefixed token", () => {
  const { token, prefix } = generateToken();
  assert.ok(token.startsWith(TOKEN_PREFIX));
  assert.equal(token.length, 51);
  assert.equal(prefix, token.slice(0, 14));
});

test("generateToken is not deterministic", () => {
  assert.notEqual(generateToken().token, generateToken().token);
});

test("hashToken matches a known sha256 vector", () => {
  assert.equal(
    hashToken("eb_live_TESTVECTOR"),
    "508340794122ab56cb8727312867f7a3d9c80d46bd80fa4b0d6384b5f2e90510",
  );
});

test("generateToken returns the hash of its own token", () => {
  const { token, hash } = generateToken();
  assert.equal(hash, hashToken(token));
});

test("parseBearer accepts a well-formed header", () => {
  assert.equal(parseBearer("Bearer eb_live_abc"), "eb_live_abc");
  assert.equal(parseBearer("bearer eb_live_abc"), "eb_live_abc");
  assert.equal(parseBearer("  Bearer   eb_live_abc  "), "eb_live_abc");
});

test("parseBearer rejects anything that is not an EchoBrief token", () => {
  assert.equal(parseBearer(null), null);
  assert.equal(parseBearer(""), null);
  assert.equal(parseBearer("eb_live_abc"), null, "missing scheme");
  assert.equal(parseBearer("Basic eb_live_abc"), null, "wrong scheme");
  assert.equal(parseBearer("Bearer eyJhbGciOi"), null, "a JWT is not a PAT");
});
