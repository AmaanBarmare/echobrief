-- Backend error history.
--
-- Sentry watched the browser; the 44 edge functions had nothing. An exception
-- in the pipeline became a 500 in a log nobody reads, and the only backstop was
-- monitor-stuck-meetings — which sees meetings and therefore cannot see a
-- failure in billing, sharing, or calendar sync at all.
--
-- This is the queryable half of _shared/observability.ts. Sentry (optional, via
-- SENTRY_DSN) is the alerting half; this is the history, and it is what makes
-- "has this happened before, and how often?" answerable — the question the
-- errors.md runbook exists to answer and currently answers from memory.
--
-- ERRORS ONLY, NEVER REQUESTS. The Disk IO budget is the binding constraint on
-- this instance (engineering-notes #22: net.http_post write churn was 94% of DB
-- execution time), so this table must stay near-empty in the healthy case. If
-- it ever grows fast, that is the signal, not the cost.
--
-- Service-role only, like monitor_events: these rows can name a user and a
-- meeting, and nothing here is a user-facing feature.

CREATE TABLE IF NOT EXISTS public.function_errors (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  function_name text NOT NULL,
  message       text NOT NULL,
  stack         text,
  -- Deliberately NOT foreign keys. An error row must survive the deletion of
  -- the meeting or account it refers to: the most interesting errors are the
  -- ones around a deletion, and a cascade would erase exactly those.
  meeting_id    uuid,
  user_id       uuid,
  context       jsonb
);

-- The two questions actually asked of this table: "what broke recently?" and
-- "what does this function keep doing?"
CREATE INDEX IF NOT EXISTS function_errors_created_idx
  ON public.function_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS function_errors_fn_created_idx
  ON public.function_errors (function_name, created_at DESC);

ALTER TABLE public.function_errors ENABLE ROW LEVEL SECURITY;
-- No policies: service role only, exactly like monitor_events.

COMMENT ON TABLE public.function_errors IS
  'Edge function exceptions, written by _shared/observability.ts. Service-role only. '
  'Errors only — never per-request logging; write churn is what depletes the Disk IO budget.';
