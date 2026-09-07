/**
 * Envelope encryption for credentials we store in Postgres.
 *
 * Why this exists: Google and Microsoft OAuth access and refresh tokens were
 * stored as plaintext columns in `user_oauth_tokens` and `calendar_connections`.
 * RLS protects those rows from other *users* — it protects nothing against a
 * database dump, a leaked service-role key, or a platform-side compromise, and
 * a leaked refresh token is live, refreshable calendar access for the customer
 * until they notice and revoke it. These are the only credentials in the system
 * we cannot re-mint on our own: re-issuing them means asking every customer to
 * re-authorise.
 *
 * The scheme is AES-256-GCM in the edge runtime (Web Crypto), key held as a
 * Supabase secret, never in the database. GCM is authenticated, so a tampered
 * ciphertext fails to open rather than decrypting to garbage.
 *
 * FORMAT — the version lives in the value, not in a sibling column:
 *
 *     v1.<base64url iv (12 bytes)>.<base64url ciphertext+tag>
 *
 * A `key_version` column would have to be kept in step with the value it
 * describes across every write path, and the two can disagree. A self-
 * describing value cannot. Rotation is therefore: add the new key as
 * TOKEN_ENCRYPTION_KEY_V2, deploy (v1 still opens, v2 is what seals), re-wrap
 * rows in the background, retire the v1 secret.
 *
 * LEGACY PLAINTEXT: `open()` returns an unprefixed value unchanged, which is
 * what makes the staged migration safe — encrypted and not-yet-encrypted rows
 * coexist while the backfill runs. Once the backfill is verified, set
 * TOKEN_PLAINTEXT_READS=deny and a plaintext read throws instead, so a row that
 * somehow escaped the backfill is an alert rather than a silent hole.
 */

const PREFIX = "v";
const IV_BYTES = 12;

/** Highest key version present in the environment; what `seal` uses. */
let cachedCurrentVersion: number | null = null;
const keyCache = new Map<number, CryptoKey>();

export class TokenCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenCryptoError";
  }
}

function envKeyName(version: number): string {
  // v1 keeps the unsuffixed name so the first deploy needs no rename.
  return version === 1 ? "TOKEN_ENCRYPTION_KEY" : `TOKEN_ENCRYPTION_KEY_V${version}`;
}

function rawKey(version: number): Uint8Array<ArrayBuffer> | null {
  const b64 = Deno.env.get(envKeyName(version));
  if (!b64) return null;
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = decodeBase64(b64.trim());
  } catch {
    throw new TokenCryptoError(`${envKeyName(version)} is not valid base64`);
  }
  if (bytes.length !== 32) {
    throw new TokenCryptoError(
      `${envKeyName(version)} must decode to 32 bytes, got ${bytes.length}`,
    );
  }
  return bytes;
}

/** The newest key version configured. Throws if none is. */
export function currentKeyVersion(): number {
  if (cachedCurrentVersion !== null) return cachedCurrentVersion;
  let found = 0;
  // Bounded scan: rotation adds one version at a time and old ones are retired.
  for (let v = 1; v <= 16; v++) {
    if (Deno.env.get(envKeyName(v))) found = v;
  }
  if (!found) {
    throw new TokenCryptoError(
      "No token encryption key configured. Set TOKEN_ENCRYPTION_KEY to a base64 32-byte key.",
    );
  }
  // Validate now rather than at first use. A mistyped secret should fail on the
  // first call into this module — not halfway through a calendar sync, where it
  // would look like a revoked Google grant and send the user to reconnect.
  rawKey(found);
  cachedCurrentVersion = found;
  return found;
}

async function keyFor(version: number): Promise<CryptoKey> {
  const cached = keyCache.get(version);
  if (cached) return cached;
  const raw = rawKey(version);
  if (!raw) {
    throw new TokenCryptoError(
      `Ciphertext needs key version ${version}, but ${envKeyName(version)} is not set. ` +
        "Do not retire a key version until every row using it has been re-wrapped.",
    );
  }
  const key = await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
  keyCache.set(version, key);
  return key;
}

/** Encrypt with the current key. Returns the self-describing sealed form. */
export async function seal(plaintext: string): Promise<string> {
  const version = currentKeyVersion();
  const key = await keyFor(version);
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(IV_BYTES)));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext)),
  );
  return `${PREFIX}${version}.${encodeBase64(iv)}.${encodeBase64(ct)}`;
}

/**
 * Decrypt a sealed value. An unprefixed value is legacy plaintext and is
 * returned unchanged unless TOKEN_PLAINTEXT_READS=deny.
 */
export async function open(value: string): Promise<string> {
  if (!isSealed(value)) {
    if (Deno.env.get("TOKEN_PLAINTEXT_READS") === "deny") {
      throw new TokenCryptoError(
        "Refusing to read a plaintext credential: the backfill missed a row, or something wrote around seal().",
      );
    }
    return value;
  }
  const [tag, ivB64, ctB64] = value.split(".");
  const version = Number(tag.slice(PREFIX.length));
  const key = await keyFor(version);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decodeBase64(ivB64) },
      key,
      decodeBase64(ctB64),
    );
  } catch {
    // GCM authentication failed: wrong key, or the stored bytes were altered.
    throw new TokenCryptoError(
      `Could not decrypt a credential sealed with key version ${version}. ` +
        "The key is wrong or the value was modified.",
    );
  }
  return new TextDecoder().decode(plain);
}

/** True when the value carries our envelope, i.e. is not legacy plaintext. */
export function isSealed(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  if (!parts[0].startsWith(PREFIX)) return false;
  const version = Number(parts[0].slice(PREFIX.length));
  return Number.isInteger(version) && version >= 1;
}

/** Seal that passes null/empty through — most token columns are nullable. */
export async function sealMaybe(value: string | null | undefined): Promise<string | null> {
  if (value === null || value === undefined || value === "") return null;
  return await seal(value);
}

/** Open that passes null/empty through. */
export async function openMaybe(value: string | null | undefined): Promise<string | null> {
  if (value === null || value === undefined || value === "") return null;
  return await open(value);
}

/** Test seam: forget the cached env lookups. */
export function _resetKeyCache(): void {
  cachedCurrentVersion = null;
  keyCache.clear();
}

// --- base64url, no padding -------------------------------------------------
// Deno's std/encoding would do, but every function in this repo imports its own
// std version and a mismatch here is a decryption failure in production. Two
// small local helpers are cheaper than that risk.

function encodeBase64(bytes: Uint8Array<ArrayBuffer>): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64(s: string): Uint8Array<ArrayBuffer> {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
