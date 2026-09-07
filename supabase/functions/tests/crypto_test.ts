/**
 * Tests for the credential envelope.
 *
 * The properties that matter operationally, in the order they would hurt:
 *  - a sealed value round-trips (or every calendar sync breaks at once),
 *  - legacy plaintext still reads (or the staged migration breaks live syncs
 *    the moment the code deploys and before the backfill has run),
 *  - a wrong key FAILS rather than returning garbage (garbage would be sent to
 *    Google as a refresh token and look like a revoked grant),
 *  - a tampered ciphertext fails the same way,
 *  - two seals of the same token differ, so the column cannot be used to tell
 *    whether two users hold the same credential.
 */
import { assert, assertEquals, assertNotEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import {
  _resetKeyCache,
  currentKeyVersion,
  isSealed,
  open,
  openMaybe,
  seal,
  sealMaybe,
  TokenCryptoError,
} from "../_shared/crypto.ts";

const KEY_A = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"; // 32 bytes, base64url
const KEY_B = "f39-fX57eXd1c3FvbWtpZ2VjYV9dW1lXVVNRT01LSUc"; // a different 32 bytes

function setKeys(keys: Record<string, string | null>) {
  for (const [name, value] of Object.entries(keys)) {
    if (value === null) Deno.env.delete(name);
    else Deno.env.set(name, value);
  }
  _resetKeyCache();
}

function reset() {
  setKeys({
    TOKEN_ENCRYPTION_KEY: KEY_A,
    TOKEN_ENCRYPTION_KEY_V2: null,
    TOKEN_PLAINTEXT_READS: null,
  });
}

Deno.test("seal then open round-trips a refresh token", async () => {
  reset();
  const token = "1//0gV3ry-L0ng.Google_Refresh~Token_value";
  const sealed = await seal(token);
  assertNotEquals(sealed, token);
  assertEquals(await open(sealed), token);
});

Deno.test("sealed values are self-describing and versioned", async () => {
  reset();
  const sealed = await seal("hello");
  assert(sealed.startsWith("v1."), `expected a v1 envelope, got ${sealed.slice(0, 8)}`);
  assertEquals(sealed.split(".").length, 3);
  assert(isSealed(sealed));
});

Deno.test("plaintext is not mistaken for an envelope", () => {
  reset();
  // Real Google tokens contain dots and slashes; none of these may be treated
  // as sealed, or the backfill would skip them.
  for (const plain of [
    "ya29.a0AfH6SMB-token",
    "1//04abc.def.ghi",
    "",
    "v.x.y",
    "vX.aa.bb",
    "plain",
  ]) {
    assertEquals(isSealed(plain), false, `${plain} should not read as sealed`);
  }
});

Deno.test("open passes legacy plaintext through during the backfill window", async () => {
  reset();
  assertEquals(await open("ya29.legacy-plaintext-token"), "ya29.legacy-plaintext-token");
});

Deno.test("open refuses plaintext once TOKEN_PLAINTEXT_READS=deny", async () => {
  reset();
  Deno.env.set("TOKEN_PLAINTEXT_READS", "deny");
  await assertRejects(() => open("ya29.legacy"), TokenCryptoError);
  Deno.env.delete("TOKEN_PLAINTEXT_READS");
});

Deno.test("a wrong key fails loudly instead of returning garbage", async () => {
  reset();
  const sealed = await seal("secret-token");
  setKeys({ TOKEN_ENCRYPTION_KEY: KEY_B });
  await assertRejects(() => open(sealed), TokenCryptoError);
  reset();
});

Deno.test("a tampered ciphertext fails authentication", async () => {
  reset();
  const sealed = await seal("secret-token");
  const [v, iv, ct] = sealed.split(".");
  const flipped = ct[0] === "A" ? "B" + ct.slice(1) : "A" + ct.slice(1);
  await assertRejects(() => open(`${v}.${iv}.${flipped}`), TokenCryptoError);
});

Deno.test("the same token seals differently every time", async () => {
  reset();
  const a = await seal("same-token");
  const b = await seal("same-token");
  assertNotEquals(a, b, "a fixed IV would leak that two rows hold the same credential");
  assertEquals(await open(a), await open(b));
});

Deno.test("rotation: v2 seals, v1 still opens", async () => {
  reset();
  const oldSealed = await seal("token-from-before-rotation");
  assert(oldSealed.startsWith("v1."));

  setKeys({ TOKEN_ENCRYPTION_KEY: KEY_A, TOKEN_ENCRYPTION_KEY_V2: KEY_B });
  assertEquals(currentKeyVersion(), 2);

  const newSealed = await seal("token-after-rotation");
  assert(newSealed.startsWith("v2."));
  assertEquals(await open(newSealed), "token-after-rotation");
  // The whole point of rotation being a background re-wrap rather than an
  // outage: rows still on the old key keep working meanwhile.
  assertEquals(await open(oldSealed), "token-from-before-rotation");
  reset();
});

Deno.test("retiring a key version that rows still use is caught, not silent", async () => {
  reset();
  const sealed = await seal("token");
  setKeys({ TOKEN_ENCRYPTION_KEY: null, TOKEN_ENCRYPTION_KEY_V2: KEY_B });
  await assertRejects(() => open(sealed), TokenCryptoError, "key version 1");
  reset();
});

Deno.test("null and empty pass through the Maybe helpers", async () => {
  reset();
  assertEquals(await sealMaybe(null), null);
  assertEquals(await sealMaybe(""), null);
  assertEquals(await sealMaybe(undefined), null);
  assertEquals(await openMaybe(null), null);
  assertEquals(await openMaybe(""), null);
  const sealed = await sealMaybe("x");
  assertEquals(await openMaybe(sealed), "x");
});

Deno.test("a missing key is a startup-shaped error, not a decryption error", () => {
  setKeys({ TOKEN_ENCRYPTION_KEY: null, TOKEN_ENCRYPTION_KEY_V2: null });
  assertThrows(() => currentKeyVersion(), TokenCryptoError, "No token encryption key");
  reset();
});

Deno.test("a malformed key is rejected with the variable named", () => {
  setKeys({ TOKEN_ENCRYPTION_KEY: "too-short" });
  assertThrows(() => currentKeyVersion(), TokenCryptoError);
  reset();
});
