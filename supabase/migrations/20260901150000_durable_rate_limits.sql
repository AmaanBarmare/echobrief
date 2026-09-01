-- Durable rate limiting.
--
-- `_shared/rate-limit.ts` kept its counters in a module-level Map. Supabase
-- runs many edge isolates and recycles them on cold start, so the limit was
-- per-instance and reset constantly — an attacker got roughly the limit
-- multiplied by however many isolates were warm. It was also wired into only
-- four OAuth functions, while `chat-transcripts`, `regenerate-insights`,
-- `account-brief` and `draft-followup-email` each called OpenAI on demand with
-- no limit at all.
--
-- IO note: this table holds ONE row per key, upserted in place, not one row per
-- request — it does not grow with traffic, so it does not repeat the pg_net
-- write churn that depleted the Disk IO Budget in June. The gated endpoints are
-- also the expensive ones: a row upsert costs nothing next to the LLM call it
-- guards.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key          text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count        integer NOT NULL DEFAULT 0
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies: service role only. A client that could write this table could
-- reset its own limit.

-- Atomic check-and-consume. The whole decision happens inside one statement, so
-- concurrent isolates cannot both read "9 of 10" and both proceed.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key text,
  p_max integer,
  p_window_seconds integer
)
RETURNS TABLE (allowed boolean, remaining integer, reset_in integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now    timestamptz := now();
  v_count  integer;
  v_start  timestamptz;
BEGIN
  INSERT INTO public.rate_limits AS rl (key, window_start, count)
  VALUES (p_key, v_now, 1)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE
          WHEN rl.window_start + make_interval(secs => p_window_seconds) <= v_now
          THEN 1 ELSE rl.count + 1 END,
        window_start = CASE
          WHEN rl.window_start + make_interval(secs => p_window_seconds) <= v_now
          THEN v_now ELSE rl.window_start END
  RETURNING rl.count, rl.window_start INTO v_count, v_start;

  reset_in := GREATEST(
    0,
    CEIL(EXTRACT(EPOCH FROM (v_start + make_interval(secs => p_window_seconds) - v_now)))::integer
  );
  allowed   := v_count <= p_max;
  remaining := GREATEST(0, p_max - v_count);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM public, anon, authenticated;

-- Keys stop being touched when a user goes quiet; sweep the abandoned ones.
CREATE INDEX IF NOT EXISTS rate_limits_window_start_idx
  ON public.rate_limits (window_start);
