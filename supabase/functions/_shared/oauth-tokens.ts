/**
 * The only place OAuth token columns are read or written.
 *
 * Twelve functions touch Google and Microsoft tokens. If each one called
 * `seal()` and `open()` for itself, the thirteenth would forget, and a
 * forgotten `seal()` is a plaintext credential sitting in the database looking
 * exactly like a working one — the failure would be invisible until a dump
 * leaked. So the encryption lives here, on top of the two column sets, and call
 * sites ask for tokens rather than for columns.
 *
 * Two column sets exist because of the migration note in
 * 20260902120000_calendar_connections.sql: Google still writes
 * `user_oauth_tokens` (a dozen upserts depend on its UNIQUE (user_id)
 * constraint) and a trigger mirrors it into `calendar_connections`. The trigger
 * copies whatever text it is given, so it carries ciphertext across unchanged
 * and needed no migration of its own.
 */
import { openMaybe, sealMaybe } from "./crypto.ts";

/** Google's column names on `user_oauth_tokens`. */
export const GOOGLE_TOKEN_COLUMNS = ["google_access_token", "google_refresh_token"] as const;
/** Provider-neutral column names on `calendar_connections`. */
export const CONNECTION_TOKEN_COLUMNS = ["access_token", "refresh_token"] as const;

type Row = Record<string, unknown>;

/**
 * Decrypt the named columns of a row read from the database.
 *
 * Returns a copy — mutating the caller's row in place would make it impossible
 * to tell, at a glance in a call site, whether a value is still sealed.
 */
export async function openRow<T extends Row>(
  row: T | null | undefined,
  columns: readonly string[],
): Promise<T | null> {
  if (!row) return null;
  const out: Row = { ...row };
  for (const col of columns) {
    if (col in out) out[col] = await openMaybe(out[col] as string | null);
  }
  return out as T;
}

/** Decrypt the named columns of every row in a result set. */
export async function openRows<T extends Row>(
  rows: T[] | null | undefined,
  columns: readonly string[],
): Promise<T[]> {
  if (!rows?.length) return [];
  return await Promise.all(rows.map(async (r) => (await openRow(r, columns)) as T));
}

/**
 * Encrypt the named columns of a payload about to be written.
 *
 * A column that is absent stays absent — partial updates (refreshing only the
 * access token, leaving the refresh token alone) are the common case and must
 * not accidentally null out what they did not mention.
 */
export async function sealRow<T extends Row>(
  payload: T,
  columns: readonly string[],
): Promise<T> {
  const out: Row = { ...payload };
  for (const col of columns) {
    if (col in out) out[col] = await sealMaybe(out[col] as string | null);
  }
  return out as T;
}

/** Decrypt a row of Google tokens read from `user_oauth_tokens`. */
export function openGoogleTokens<T extends Row>(row: T | null | undefined): Promise<T | null> {
  return openRow(row, GOOGLE_TOKEN_COLUMNS);
}

/** Encrypt a payload about to be written to `user_oauth_tokens`. */
export function sealGoogleTokens<T extends Row>(payload: T): Promise<T> {
  return sealRow(payload, GOOGLE_TOKEN_COLUMNS);
}

/** Decrypt a row read from `calendar_connections`. */
export function openConnectionTokens<T extends Row>(row: T | null | undefined): Promise<T | null> {
  return openRow(row, CONNECTION_TOKEN_COLUMNS);
}

/** Encrypt a payload about to be written to `calendar_connections`. */
export function sealConnectionTokens<T extends Row>(payload: T): Promise<T> {
  return sealRow(payload, CONNECTION_TOKEN_COLUMNS);
}
