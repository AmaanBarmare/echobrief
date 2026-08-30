-- MCP OAuth 2.1 authorization server storage.
--
-- Three service-role-only tables. Nothing here is user-readable through RLS:
-- the browser never touches these rows, only the Vercel functions under
-- api/oauth/ do, and they hold the service-role key.
--
-- Access tokens themselves are NOT stored here. An OAuth grant produces an
-- ordinary eb_live_ personal access token in public.api_tokens, so the MCP
-- endpoint's auth path is unchanged. oauth_refresh_tokens.api_token_id points
-- at that row so rotation can revoke it.

CREATE TABLE IF NOT EXISTS public.oauth_clients (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name                text NOT NULL,
  redirect_uris              text[] NOT NULL,
  token_endpoint_auth_method text NOT NULL DEFAULT 'none',
  client_secret_hash         text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  last_used_at               timestamptz,
  CONSTRAINT oauth_clients_name_length CHECK (length(btrim(client_name)) BETWEEN 1 AND 120),
  CONSTRAINT oauth_clients_redirects_nonempty CHECK (cardinality(redirect_uris) BETWEEN 1 AND 20),
  CONSTRAINT oauth_clients_auth_method CHECK (token_endpoint_auth_method IN ('none', 'client_secret_post')),
  CONSTRAINT oauth_clients_secret_hash_format CHECK (client_secret_hash IS NULL OR client_secret_hash ~ '^[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS public.oauth_codes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash      text NOT NULL UNIQUE,
  client_id      uuid NOT NULL REFERENCES public.oauth_clients(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  redirect_uri   text NOT NULL,
  code_challenge text NOT NULL,
  resource       text NOT NULL,
  scope          text NOT NULL,
  expires_at     timestamptz NOT NULL,
  used_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oauth_codes_hash_format CHECK (code_hash ~ '^[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS public.oauth_refresh_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    text NOT NULL UNIQUE,
  client_id     uuid NOT NULL REFERENCES public.oauth_clients(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_token_id  uuid NOT NULL REFERENCES public.api_tokens(id) ON DELETE CASCADE,
  scope         text NOT NULL,
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oauth_refresh_tokens_hash_format CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS oauth_codes_expires_idx          ON public.oauth_codes (expires_at);
CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_user_idx    ON public.oauth_refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_expires_idx ON public.oauth_refresh_tokens (expires_at);

-- Service-role only: RLS on, no policies.
ALTER TABLE public.oauth_clients        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_codes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_refresh_tokens ENABLE ROW LEVEL SECURITY;

-- Daily prune, 03:45 UTC, after prune-job-logs (03:15) and prune-recordings
-- (03:30). Dynamic client registration lets anyone on the internet create a
-- client row, and claude.ai registers a fresh client on every new connection,
-- so clients that never completed a grant are dropped after 7 days. Spent and
-- expired codes go after a day; expired refresh tokens after 7 days.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'prune-oauth',
  '45 3 * * *',
  $$
  DELETE FROM public.oauth_codes
    WHERE expires_at < now() - interval '1 day';
  DELETE FROM public.oauth_refresh_tokens
    WHERE expires_at < now() - interval '7 days';
  DELETE FROM public.oauth_clients c
    WHERE c.created_at < now() - interval '7 days'
      AND NOT EXISTS (SELECT 1 FROM public.oauth_refresh_tokens r WHERE r.client_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.oauth_codes k WHERE k.client_id = c.id);
  $$
);
