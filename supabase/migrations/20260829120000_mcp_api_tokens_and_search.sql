-- MCP server: personal access tokens + full-text search over meeting content.
--
-- Two unrelated-looking things in one migration because they ship together and
-- neither is useful alone: the MCP endpoint needs a token to authenticate and a
-- search index to answer its most-used tool.
--
-- Tokens are stored ONLY as an unsalted sha256 hex digest. The plaintext carries
-- 256 bits of entropy, so it is not brute-forceable and a KDF would buy nothing
-- but latency on every request. The plaintext is returned once at creation and
-- is unrecoverable afterwards.

CREATE TABLE IF NOT EXISTS public.api_tokens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  token_hash   text NOT NULL UNIQUE,
  token_prefix text NOT NULL,
  scopes       text[] NOT NULL DEFAULT '{read,write:action_items}',
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT api_tokens_name_length CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  CONSTRAINT api_tokens_hash_format  CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS api_tokens_user_id_idx ON public.api_tokens (user_id);

ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;

-- Users may see and revoke their own tokens. There is deliberately no INSERT
-- policy: only `manage-api-tokens` (service role) can produce a valid hash, so a
-- browser cannot mint itself a token with someone else's user_id.
DROP POLICY IF EXISTS api_tokens_select_own ON public.api_tokens;
CREATE POLICY api_tokens_select_own ON public.api_tokens
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS api_tokens_update_own ON public.api_tokens;
CREATE POLICY api_tokens_update_own ON public.api_tokens
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS api_tokens_delete_own ON public.api_tokens;
CREATE POLICY api_tokens_delete_own ON public.api_tokens
  FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Full-text search.
--
-- GENERATED columns, not a trigger and not an external pipeline: Postgres
-- maintains them inside the same write that inserts the transcript. There is no
-- sync step to drift and no backfill to go stale -- which is the whole reason
-- this is FTS and not embeddings (see the design doc).
-- ---------------------------------------------------------------------------

ALTER TABLE public.transcripts
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS transcripts_search_idx
  ON public.transcripts USING gin (search_vector);

ALTER TABLE public.meeting_insights
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(summary_detailed, '') || ' ' || coalesce(summary_short, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS meeting_insights_search_idx
  ON public.meeting_insights USING gin (search_vector);

-- ---------------------------------------------------------------------------
-- search_meetings()
--
-- SECURITY INVOKER (the default, stated explicitly because it is load-bearing):
-- RLS is evaluated as the caller, so this function cannot return another user's
-- meetings even though the MCP server calls it for everyone.
--
-- The three WHERE clauses on transcripts are the retrieval hygiene currently
-- duplicated in chat-transcripts/index.ts: harness fixtures, sub-threshold
-- fragments, and the "no clear speech" sentinel all make answers worse by being
-- retrievable.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_meetings(q text, max_results int DEFAULT 10)
RETURNS TABLE (
  meeting_id uuid,
  title      text,
  start_time timestamptz,
  snippet    text,
  rank       real,
  source     text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $fn$
  WITH tsq AS (SELECT websearch_to_tsquery('english', coalesce(q, '')) AS query)
  SELECT hits.meeting_id, hits.title, hits.start_time, hits.snippet, hits.rank, hits.source
  FROM (
    SELECT
      t.meeting_id,
      m.title,
      m.start_time,
      ts_headline('english', t.content, tsq.query,
        'MaxWords=45, MinWords=20, MaxFragments=2, FragmentDelimiter=" … "') AS snippet,
      ts_rank(t.search_vector, tsq.query) AS rank,
      'transcript'::text AS source
    FROM public.transcripts t
    JOIN public.meetings m ON m.id = t.meeting_id
    CROSS JOIN tsq
    WHERE t.search_vector @@ tsq.query
      AND m.title NOT LIKE '[harness]%'
      AND length(btrim(t.content)) >= 250
      AND lower(left(btrim(t.content), 120)) NOT LIKE '%no clear speech was detected%'

    UNION ALL

    SELECT
      i.meeting_id,
      m.title,
      m.start_time,
      ts_headline('english',
        coalesce(i.summary_detailed, i.summary_short, ''), tsq.query,
        'MaxWords=45, MinWords=20, MaxFragments=2, FragmentDelimiter=" … "') AS snippet,
      ts_rank(i.search_vector, tsq.query) AS rank,
      'summary'::text AS source
    FROM public.meeting_insights i
    JOIN public.meetings m ON m.id = i.meeting_id
    CROSS JOIN tsq
    WHERE i.search_vector @@ tsq.query
      AND m.title NOT LIKE '[harness]%'
  ) hits
  ORDER BY hits.rank DESC, hits.start_time DESC
  LIMIT greatest(1, least(coalesce(max_results, 10), 25));
$fn$;

GRANT EXECUTE ON FUNCTION public.search_meetings(text, int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.search_meetings(text, int) FROM anon;
