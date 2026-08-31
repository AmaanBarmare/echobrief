-- Record the scopes Google actually granted so the app can tell a read-only
-- calendar connection (pre-2026-08-31) from one that can create follow-up
-- events, and prompt a reconnect instead of failing at click time.
ALTER TABLE public.user_oauth_tokens
  ADD COLUMN IF NOT EXISTS google_scopes text;
