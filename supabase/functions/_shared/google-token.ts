/**
 * Server-side Google access token for a user, refreshed when expired.
 *
 * Mirrors the refresh dance in sync-google-calendar / auto-join-meetings so
 * new features (follow-up event creation) do not grow a fourth copy of it.
 * Tokens live in user_oauth_tokens (service-role only).
 */
import { openGoogleTokens, sealGoogleTokens } from "./oauth-tokens.ts";
export type GoogleTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; code: "NOT_CONNECTED" | "TOKEN_REFRESH_FAILED" | "SERVER_CONFIG"; error: string };

export async function getGoogleAccessToken(
  supabase: any,
  userId: string,
): Promise<GoogleTokenResult> {
  const { data: stored } = await supabase
    .from("user_oauth_tokens")
    .select("google_access_token, google_refresh_token, google_token_expiry")
    .eq("user_id", userId)
    .maybeSingle();
  // Columns are sealed at rest; every read of them goes through the chokepoint.
  const tokens = await openGoogleTokens(stored);

  if (!tokens?.google_access_token && !tokens?.google_refresh_token) {
    return { ok: false, code: "NOT_CONNECTED", error: "Google Calendar is not connected." };
  }

  const expiry = tokens.google_token_expiry ? new Date(tokens.google_token_expiry) : null;
  const isExpired = !expiry || expiry.getTime() < Date.now() + 60_000;
  if (!isExpired && tokens.google_access_token) {
    return { ok: true, accessToken: tokens.google_access_token };
  }

  if (!tokens.google_refresh_token) {
    return { ok: false, code: "TOKEN_REFRESH_FAILED", error: "Google token expired and no refresh token is stored." };
  }
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return { ok: false, code: "SERVER_CONFIG", error: "Google OAuth credentials are not configured." };
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.google_refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  let refreshed: any = null;
  try {
    refreshed = await res.json();
  } catch {
    refreshed = null;
  }
  if (!refreshed?.access_token) {
    // A parseable non-5xx answer with no access_token (typically
    // `invalid_grant` after the user revoked access) means the grant is dead —
    // flag the profile so the UI can ask for a reconnect. A 5xx or non-JSON
    // body is a transient Google-side failure: report it, but leave the
    // connection flags alone.
    const isPermanent = refreshed !== null && res.status < 500;
    if (isPermanent) {
      await supabase
        .from("profiles")
        .update({ google_calendar_connected: false, google_needs_reconnect: true })
        .eq("user_id", userId);
    }
    return { ok: false, code: "TOKEN_REFRESH_FAILED", error: "Google token expired and refresh failed. Reconnect Google Calendar in Settings." };
  }
  const newExpiry = new Date(Date.now() + (Number(refreshed.expires_in) || 3600) * 1000);
  await supabase.from("user_oauth_tokens").upsert(
    await sealGoogleTokens({
      user_id: userId,
      google_access_token: refreshed.access_token,
      google_token_expiry: newExpiry.toISOString(),
    }),
    { onConflict: "user_id" },
  );
  return { ok: true, accessToken: refreshed.access_token };
}

const CALENDAR_WRITE_SCOPES = [
  // Current grant (narrowed 2026-08-31). We only insert on `primary`, which
  // the user owns, so events.owned is sufficient.
  "https://www.googleapis.com/auth/calendar.events.owned",
  // Still honoured for grants issued before the narrowing.
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar",
];

/**
 * Can this grant create events? `null` scopes (recorded before we stored
 * them) are unknown — callers should try and translate Google's 403.
 */
export function hasCalendarWriteScope(scopes: string | null | undefined): boolean | null {
  if (typeof scopes !== "string" || !scopes.trim()) return null;
  const granted = new Set(scopes.split(/\s+/).filter(Boolean));
  return CALENDAR_WRITE_SCOPES.some((s) => granted.has(s));
}

export const RECONNECT_MESSAGE =
  "Your Google Calendar connection is read-only. Reconnect it under Settings → Integrations to let EchoBrief create follow-up events.";
