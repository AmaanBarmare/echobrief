import test from "node:test";
import assert from "node:assert/strict";
import { hashToken } from "../../_mcp/token.js";
import { generateClientSecret, generateCode, generateRefreshToken } from "../store.js";

test("refresh tokens are prefixed, 54 chars, and hash with the shared sha256", () => {
  const { token, hash } = generateRefreshToken();
  assert.ok(token.startsWith("eb_refresh_"));
  assert.equal(token.length, 54);
  assert.equal(hash, hashToken(token));
});

test("codes and client secrets are unprefixed 43-char base64url", () => {
  const { code, hash } = generateCode();
  assert.match(code, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(hash, hashToken(code));
  const { secret } = generateClientSecret();
  assert.match(secret, /^[A-Za-z0-9_-]{43}$/);
});

test("generators are not deterministic", () => {
  assert.notEqual(generateCode().code, generateCode().code);
});
