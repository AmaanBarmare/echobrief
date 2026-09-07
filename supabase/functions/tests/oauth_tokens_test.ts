/**
 * Tests for the token column chokepoint.
 *
 * The operational properties: a partial update must not null the column it did
 * not mention (refreshing an access token would otherwise silently destroy the
 * refresh token, and the user would be asked to reconnect on the next tick),
 * and a mixed result set — some rows backfilled, some not — must read correctly
 * during the migration window.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { isSealed, seal } from "../_shared/crypto.ts";
import {
  CONNECTION_TOKEN_COLUMNS,
  GOOGLE_TOKEN_COLUMNS,
  openConnectionTokens,
  openGoogleTokens,
  openRows,
  sealConnectionTokens,
  sealGoogleTokens,
} from "../_shared/oauth-tokens.ts";

Deno.env.set("TOKEN_ENCRYPTION_KEY", "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8");

Deno.test("google tokens round-trip through the chokepoint", async () => {
  const written = await sealGoogleTokens({
    user_id: "u1",
    google_access_token: "ya29.access",
    google_refresh_token: "1//refresh",
  });
  assertEquals(written.user_id, "u1", "non-token columns pass through untouched");
  assert(isSealed(written.google_access_token as string));
  assert(isSealed(written.google_refresh_token as string));

  const read = await openGoogleTokens(written);
  assertEquals(read!.google_access_token, "ya29.access");
  assertEquals(read!.google_refresh_token, "1//refresh");
});

Deno.test("a partial update leaves unmentioned columns absent, not null", async () => {
  // sync-google-calendar refreshes only the access token. If sealRow added a
  // null refresh_token, that UPDATE would wipe the refresh token and the next
  // sync would ask the user to reconnect.
  const payload = await sealGoogleTokens({ google_access_token: "new-access" });
  assertEquals(Object.hasOwn(payload, "google_refresh_token"), false);
  assertEquals(Object.keys(payload), ["google_access_token"]);
});

Deno.test("an explicit null seals to null rather than to ciphertext", async () => {
  // google-oauth-redirect writes `google_refresh_token: null` when Google
  // declines to reissue one. Sealing the string "null" would be worse than
  // useless: it would look like a valid stored credential.
  const payload = await sealGoogleTokens({
    google_access_token: "a",
    google_refresh_token: null,
  });
  assertEquals(payload.google_refresh_token, null);
});

Deno.test("connection tokens use the provider-neutral column names", async () => {
  const written = await sealConnectionTokens({
    provider: "microsoft",
    access_token: "ms-access",
    refresh_token: "ms-refresh",
  });
  assertEquals(written.provider, "microsoft");
  assert(isSealed(written.access_token as string));
  const read = await openConnectionTokens(written);
  assertEquals(read!.access_token, "ms-access");
  assertEquals(read!.refresh_token, "ms-refresh");
});

Deno.test("a half-migrated result set reads correctly", async () => {
  // The state prod is in for 48 hours: some rows backfilled, some not.
  const rows = [
    { user_id: "a", access_token: await seal("sealed-one"), refresh_token: null },
    { user_id: "b", access_token: "plaintext-legacy", refresh_token: "plain-refresh" },
  ];
  const read = await openRows(rows, CONNECTION_TOKEN_COLUMNS);
  assertEquals(read[0].access_token, "sealed-one");
  assertEquals(read[1].access_token, "plaintext-legacy");
  assertEquals(read[1].refresh_token, "plain-refresh");
});

Deno.test("openRow tolerates a missing row and an empty set", async () => {
  assertEquals(await openGoogleTokens(null), null);
  assertEquals(await openGoogleTokens(undefined), null);
  assertEquals(await openRows(null, GOOGLE_TOKEN_COLUMNS), []);
  assertEquals(await openRows([], GOOGLE_TOKEN_COLUMNS), []);
});

Deno.test("a row selected without token columns is untouched", async () => {
  // get-user-calendars selects only `google_access_token`; other call sites
  // select neither. Neither shape may gain a column it did not ask for.
  const read = await openGoogleTokens({ user_id: "u1" });
  assertEquals(read, { user_id: "u1" });
});
