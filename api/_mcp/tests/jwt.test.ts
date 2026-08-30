import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mintUserJwt, decodeJwtPayload } from "../jwt.js";

const SECRET = "test-secret";
const ISSUER = "https://example.supabase.co/auth/v1";
const USER = "11111111-2222-3333-4444-555555555555";
const NOW = 1_700_000_000_000;

test("mintUserJwt carries the claims Supabase RLS reads", () => {
  const { token } = mintUserJwt(USER, { secret: SECRET, issuer: ISSUER, now: NOW });
  const claims = decodeJwtPayload(token);
  assert.equal(claims.sub, USER);
  assert.equal(claims.role, "authenticated");
  assert.equal(claims.aud, "authenticated");
  assert.equal(claims.iss, ISSUER);
  assert.equal(claims.iat, NOW / 1000);
  assert.equal(claims.exp, NOW / 1000 + 60);
});

test("mintUserJwt honours a custom ttl", () => {
  const { token, expiresAt } = mintUserJwt(USER, {
    secret: SECRET, issuer: ISSUER, ttlSeconds: 5, now: NOW,
  });
  assert.equal(decodeJwtPayload(token).exp, NOW / 1000 + 5);
  assert.equal(expiresAt, NOW / 1000 + 5);
});

test("mintUserJwt signs HS256 over header.payload", () => {
  const { token } = mintUserJwt(USER, { secret: SECRET, issuer: ISSUER, now: NOW });
  const [header, payload, signature] = token.split(".");
  const expected = createHmac("sha256", SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
  assert.equal(signature, expected);
  assert.deepEqual(
    JSON.parse(Buffer.from(header, "base64url").toString("utf8")),
    { alg: "HS256", typ: "JWT" },
  );
});

test("mintUserJwt refuses to sign with a missing secret", () => {
  assert.throws(
    () => mintUserJwt(USER, { secret: "", issuer: ISSUER }),
    /SUPABASE_JWT_SECRET/,
  );
});
