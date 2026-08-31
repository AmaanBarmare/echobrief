/**
 * Server-side Google access token for a user, refreshed when expired.
 *
 * Mirrors the refresh dance in sync-google-calendar / auto-join-meetings so
 * new features (follow-up event creation) do not grow a fourth copy of it.
 * Tokens live in user_oauth_tokens (service-role only).
 */
export type GoogleTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; code: "NOT_CONNECTED" | "TOKEN_REFRESH_FAILED" | "SERVER_CONFIG"; error: string };

export async function getGoogleAccessToken(
  supabase: any,
  userId: string,
): Promise<GoogleTokenResult> {
  const { data: tokens } = await supabase
    .from("user_oauth_tokens")
    .select("google_access_token, google_refresh_token, google_token_expiry")
    .eq("user_id", userId)
    .maybeSingle();

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
  const refreshed = await res.json().catch(() => ({}));
  if (!refreshed.access_token) {
    return { ok: false, code: "TOKEN_REFRESH_FAILED", error: "Google token expired and refresh failed. Reconnect Google Calendar in Settings." };
  }
  const newExpiry = new Date(Date.now() + (Number(refreshed.expires_in) || 3600) * 1000);
  await supabase.from("user_oauth_tokens").upsert(
    { user_id: userId, google_access_token: refreshed.access_token, google_token_expiry: newExpiry.toISOString() },
    { onConflict: "user_id" },
  );
  return { ok: true, accessToken: refreshed.access_token };
}
