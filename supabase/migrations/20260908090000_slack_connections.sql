-- Slack delivery, second attempt.
--
-- Slack was removed on 2026-08-20 (20260820130000_remove_slack.sql) because it
-- was never finished: the UI asked users to paste a raw channel ID, the
-- Disconnect button never wrote to the database, and posting only worked when a
-- single global SLACK_BOT_TOKEN happened to be set — one workspace's token for
-- every customer. This schema exists to make those three failures impossible.
--
--   1. A real per-user OAuth install. The token belongs to the connection row,
--      not to an environment variable, so one customer's Slack cannot receive
--      another's meetings.
--   2. channel_id is written by a picker that lists real channels; the name is
--      stored alongside so the UI can show what people actually chose.
--   3. Disconnect deletes the row. There is one row per user, so "connected"
--      is the existence of that row rather than a boolean that can disagree
--      with it.
--
-- Tokens are sealed with AES-256-GCM before they land here, exactly as the
-- calendar credentials are: the columns are named `access_token` /
-- `refresh_token` so `_shared/oauth-tokens.ts` `sealConnectionTokens` and
-- `openConnectionTokens` apply unchanged. With TOKEN_PLAINTEXT_READS=deny an
-- unsealed value here is a loud error rather than a silent leak.

CREATE TABLE IF NOT EXISTS public.slack_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Sealed. Slack's bot token (xoxb-). refresh_token is only populated when the
  -- workspace has token rotation enabled, which is why it is nullable.
  access_token    text,
  refresh_token   text,
  token_expiry    timestamptz,
  scopes          text,

  -- Which Slack workspace this is, so the UI can say "connected to Acme" rather
  -- than just "connected".
  team_id         text NOT NULL,
  team_name       text,
  bot_user_id     text,
  authed_user_id  text,

  -- The destination. Null until the user picks one: connecting the workspace
  -- and choosing where summaries land are two separate decisions, and a
  -- half-configured connection must not silently post somewhere unintended.
  channel_id      text,
  channel_name    text,

  needs_reconnect boolean NOT NULL DEFAULT false,
  last_posted_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One Slack workspace per user. Makes "connected" unambiguous and means the
-- delivery path never has to choose between two rows.
CREATE UNIQUE INDEX IF NOT EXISTS slack_connections_user_key
  ON public.slack_connections (user_id);

ALTER TABLE public.slack_connections ENABLE ROW LEVEL SECURITY;

-- Read your own connection. Writes are service-role only: every write happens
-- inside an edge function that has just verified who is asking, and a token
-- column is not something a browser should be able to UPDATE.
CREATE POLICY slack_connections_select_own ON public.slack_connections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Delivery ledger
-- ---------------------------------------------------------------------------
-- The same claim-before-send shape as `email_deliveries`, and for the same
-- reason: `afterInsightsSaved` runs on every completion path INCLUDING
-- regeneration, and Sarvam has been observed replaying one callback three
-- times. Without this, re-running insights posts the summary to the channel
-- again — and unlike a duplicate email, a duplicate Slack message is visible to
-- everyone in the room.
CREATE TABLE IF NOT EXISTS public.slack_deliveries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_id  text NOT NULL,
  -- Slack's message timestamp, which doubles as its id. Null until the post
  -- succeeds, so a claimed-but-failed row is distinguishable from a sent one.
  message_ts  text,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS slack_deliveries_once
  ON public.slack_deliveries (meeting_id, channel_id);

ALTER TABLE public.slack_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY slack_deliveries_select_own ON public.slack_deliveries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

COMMENT ON TABLE public.slack_connections IS
  'One Slack workspace install per user. Tokens are AES-256-GCM sealed by _shared/oauth-tokens.ts.';
COMMENT ON TABLE public.slack_deliveries IS
  'Claim-before-send ledger: one summary per meeting per channel, even when insights are regenerated.';
