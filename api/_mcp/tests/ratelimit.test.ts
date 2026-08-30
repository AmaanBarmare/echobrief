import test from "node:test";
import assert from "node:assert/strict";
import {
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  checkRateLimit,
  resetRateLimits,
} from "../ratelimit.js";

test("allows up to the limit then blocks", () => {
  resetRateLimits();
  const now = 1_000_000;
  for (let i = 0; i < RATE_LIMIT_MAX; i++) {
    assert.equal(checkRateLimit("tok", now).allowed, true, `request ${i + 1}`);
  }
  const blocked = checkRateLimit("tok", now);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(blocked.retryAfterSeconds, RATE_LIMIT_WINDOW_MS / 1000);
});

test("the window resets", () => {
  resetRateLimits();
  const now = 2_000_000;
  for (let i = 0; i < RATE_LIMIT_MAX; i++) checkRateLimit("tok", now);
  assert.equal(checkRateLimit("tok", now).allowed, false);
  assert.equal(checkRateLimit("tok", now + RATE_LIMIT_WINDOW_MS).allowed, true);
});

test("buckets are per token", () => {
  resetRateLimits();
  const now = 3_000_000;
  for (let i = 0; i < RATE_LIMIT_MAX; i++) checkRateLimit("a", now);
  assert.equal(checkRateLimit("a", now).allowed, false);
  assert.equal(checkRateLimit("b", now).allowed, true);
});

test("remaining counts down", () => {
  resetRateLimits();
  const now = 4_000_000;
  assert.equal(checkRateLimit("tok", now).remaining, RATE_LIMIT_MAX - 1);
  assert.equal(checkRateLimit("tok", now).remaining, RATE_LIMIT_MAX - 2);
});
