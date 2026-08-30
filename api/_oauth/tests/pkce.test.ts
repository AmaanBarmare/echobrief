import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isValidCodeChallenge, isValidCodeVerifier, verifyPkce } from "../pkce.js";

const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const challenge = createHash("sha256").update(verifier).digest("base64url");

test("verifyPkce accepts the matching S256 pair", () => {
  assert.equal(verifyPkce(verifier, challenge), true);
});

test("verifyPkce rejects a wrong verifier", () => {
  assert.equal(verifyPkce(verifier + "x", challenge), false);
});

test("verifyPkce rejects a verifier that fails the length rule", () => {
  assert.equal(verifyPkce("short", createHash("sha256").update("short").digest("base64url")), false);
});

test("code verifier charset and length (RFC 7636 §4.1)", () => {
  assert.equal(isValidCodeVerifier("a".repeat(43)), true);
  assert.equal(isValidCodeVerifier("a".repeat(128)), true);
  assert.equal(isValidCodeVerifier("a".repeat(42)), false);
  assert.equal(isValidCodeVerifier("a".repeat(129)), false);
  assert.equal(isValidCodeVerifier("a".repeat(43) + "+"), false);
});

test("code challenge is 43 base64url characters", () => {
  assert.equal(isValidCodeChallenge(challenge), true);
  assert.equal(isValidCodeChallenge(challenge + "="), false);
  assert.equal(isValidCodeChallenge(""), false);
});
