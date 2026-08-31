-- profiles.google_needs_reconnect: the Google grant is dead and only the user
-- can fix it.
--
-- Set (together with google_calendar_connected = false) when a token refresh
-- comes back permanently broken — invalid_grant after the user revoked access,
-- or a refresh that yields no access_token — by _shared/google-token.ts and
-- auto-join-meetings. Transient failures (network errors, Google 5xx,
-- non-JSON bodies) never flip it. Cleared on every successful connect
-- (google-oauth-callback, google-oauth-redirect) and on disconnect-google.
-- Lets the UI show "reconnect Google Calendar" instead of silently doing
-- nothing every auto-join tick.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS google_needs_reconnect boolean NOT NULL DEFAULT false;
