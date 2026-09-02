-- A provider-neutral place to keep calendar OAuth grants.
--
-- Why a new table rather than generalising `user_oauth_tokens`: that table is
-- UNIQUE on `user_id` alone, and a dozen edge functions upsert against exactly
-- that constraint. Widening it to (user_id, provider) would break every one of
-- those upserts at once, on the only calendar integration that currently works
-- and that has already been broken once this month by a deleted OAuth client.
--
-- So `user_oauth_tokens` stays exactly as it is and remains the WRITE path for
-- Google. This table is the READ model the provider-neutral code uses, kept in
-- step by the trigger below. A second provider writes here directly, and needs
-- no change to any existing function.
--
-- When every Google call site has moved over, `user_oauth_tokens` and the
-- trigger can go. Until then, do not write Google tokens here directly — write
-- them to `user_oauth_tokens` and let the mirror carry them across, or the two
-- will disagree about which access token is current.

CREATE TABLE IF NOT EXISTS public.calendar_connections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider      text NOT NULL CHECK (provider IN ('google', 'microsoft')),
  access_token  text,
  refresh_token text,
  token_expiry  timestamptz,
  scopes        text,
  -- Set when a refresh fails in a way only the user can fix (revoked grant,
  -- changed password). The UI reads this to prompt a reconnect.
  needs_reconnect boolean NOT NULL DEFAULT false,
  last_synced_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- One grant per provider per user. This is the constraint user_oauth_tokens
-- could not have without breaking its existing upserts.
CREATE UNIQUE INDEX IF NOT EXISTS calendar_connections_user_provider_key
  ON public.calendar_connections (user_id, provider);

ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;

-- Users may see THAT a provider is connected and whether it needs reconnecting.
-- They must never read the tokens themselves from the browser, so the client
-- selects specific columns; the service role does all writing.
DROP POLICY IF EXISTS calendar_connections_select_own ON public.calendar_connections;
CREATE POLICY calendar_connections_select_own ON public.calendar_connections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Mirror: user_oauth_tokens (Google, legacy write path) -> calendar_connections
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mirror_google_oauth_tokens()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    DELETE FROM public.calendar_connections
     WHERE user_id = OLD.user_id AND provider = 'google';
    RETURN OLD;
  END IF;

  INSERT INTO public.calendar_connections AS cc
    (user_id, provider, access_token, refresh_token, token_expiry, scopes, updated_at)
  VALUES
    (NEW.user_id, 'google', NEW.google_access_token, NEW.google_refresh_token,
     NEW.google_token_expiry, NEW.google_scopes, now())
  ON CONFLICT (user_id, provider) DO UPDATE SET
    access_token  = EXCLUDED.access_token,
    -- Google only returns a refresh token on first consent. A later refresh
    -- response carries none, and overwriting the stored one with NULL is how
    -- an integration silently dies a week later.
    refresh_token = COALESCE(EXCLUDED.refresh_token, cc.refresh_token),
    token_expiry  = EXCLUDED.token_expiry,
    scopes        = COALESCE(EXCLUDED.scopes, cc.scopes),
    updated_at    = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mirror_google_oauth_tokens_trg ON public.user_oauth_tokens;
CREATE TRIGGER mirror_google_oauth_tokens_trg
AFTER INSERT OR UPDATE OR DELETE ON public.user_oauth_tokens
FOR EACH ROW EXECUTE FUNCTION public.mirror_google_oauth_tokens();

-- Backfill the grants that already exist.
INSERT INTO public.calendar_connections
  (user_id, provider, access_token, refresh_token, token_expiry, scopes)
SELECT user_id, 'google', google_access_token, google_refresh_token,
       google_token_expiry, google_scopes
  FROM public.user_oauth_tokens
ON CONFLICT (user_id, provider) DO NOTHING;

COMMENT ON TABLE public.calendar_connections IS
  'Provider-neutral calendar OAuth grants. Google rows are mirrored from '
  'user_oauth_tokens by trigger — write Google tokens there, not here.';
