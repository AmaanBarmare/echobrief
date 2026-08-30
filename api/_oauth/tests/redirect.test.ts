import test from "node:test";
import assert from "node:assert/strict";
import {
  isLoopbackRedirectUri,
  isRegistrableRedirectUri,
  redirectUriMatches,
} from "../redirect.js";

test("registrable: https anywhere, http only on loopback", () => {
  assert.equal(isRegistrableRedirectUri("https://claude.ai/api/mcp/auth_callback"), true);
  assert.equal(isRegistrableRedirectUri("http://localhost/callback"), true);
  assert.equal(isRegistrableRedirectUri("http://127.0.0.1:3118/callback"), true);
  assert.equal(isRegistrableRedirectUri("http://[::1]/callback"), true);
  assert.equal(isRegistrableRedirectUri("http://evil.example/callback"), false);
  assert.equal(isRegistrableRedirectUri("https://claude.ai/cb#frag"), false);
  assert.equal(isRegistrableRedirectUri("not a url"), false);
});

test("exact match for https", () => {
  const reg = ["https://claude.ai/api/mcp/auth_callback"];
  assert.equal(redirectUriMatches(reg, "https://claude.ai/api/mcp/auth_callback"), true);
  assert.equal(redirectUriMatches(reg, "https://claude.ai/api/mcp/auth_callback/"), false);
  assert.equal(redirectUriMatches(reg, "https://claude.ai/api/mcp/auth_callback?x=1"), false);
  assert.equal(redirectUriMatches(reg, "https://claude.ai.evil/api/mcp/auth_callback"), false);
});

test("loopback ignores the port but not the path or host", () => {
  const reg = ["http://localhost/callback", "http://127.0.0.1/callback"];
  assert.equal(redirectUriMatches(reg, "http://localhost:3118/callback"), true);
  assert.equal(redirectUriMatches(reg, "http://127.0.0.1:52345/callback"), true);
  assert.equal(redirectUriMatches(reg, "http://localhost:3118/other"), false);
  assert.equal(redirectUriMatches(reg, "http://[::1]:3118/callback"), false);
  assert.equal(redirectUriMatches(reg, "https://localhost:3118/callback"), false);
});

test("isLoopbackRedirectUri", () => {
  assert.equal(isLoopbackRedirectUri("http://localhost:1/cb"), true);
  assert.equal(isLoopbackRedirectUri("https://claude.ai/cb"), false);
});
