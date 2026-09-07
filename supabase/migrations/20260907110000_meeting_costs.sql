-- What each meeting costs us to produce.
--
-- `usage_events` records what the customer is billed FOR. Nothing recorded what
-- we PAY, so margin per meeting was invisible until the monthly invoices
-- arrived — and by then the pricing page had already been written. The specific
-- blind spots this opens up: a Whisper fallback costs roughly fifteen times
-- Sarvam for the same audio, and a regenerated meeting pays the whole LLM chain
-- a second time. Both are currently indistinguishable from an ordinary meeting.
--
-- RAW UNITS ONLY. Seconds and tokens are facts; rupees are an opinion that
-- changes with the next rate negotiation. Prices live in the `meeting_margin`
-- view below, so a new Recall rate is a view change rather than a silent
-- rewrite of what history claims to have cost.

CREATE TABLE IF NOT EXISTS public.meeting_costs (
  meeting_id     uuid PRIMARY KEY REFERENCES public.meetings(id) ON DELETE CASCADE,
  updated_at     timestamptz NOT NULL DEFAULT now(),

  recall_seconds integer NOT NULL DEFAULT 0,
  stt_seconds    integer NOT NULL DEFAULT 0,
  -- 'sarvam' | 'whisper'. Kept as text: a third provider should not need a
  -- migration before its costs can be recorded.
  stt_provider   text,

  llm_calls      integer NOT NULL DEFAULT 0,
  llm_tokens_in  bigint  NOT NULL DEFAULT 0,
  llm_tokens_out bigint  NOT NULL DEFAULT 0,
  llm_models     text[]  NOT NULL DEFAULT '{}',

  -- How many times the LLM chain ran for this meeting at all. A regeneration is
  -- a real cost the customer does not pay for, and it is invisible in any
  -- aggregate that only counts meetings.
  pipeline_runs  integer NOT NULL DEFAULT 1
);

ALTER TABLE public.meeting_costs ENABLE ROW LEVEL SECURITY;
-- Service-role only. This is our margin, not the customer's business.

/**
 * Accumulate one pipeline run's costs.
 *
 * Increments rather than replaces: a meeting that falls back to Whisper, or is
 * regenerated later, genuinely costs the sum of its runs. Recording the last
 * run would understate exactly the meetings worth finding.
 */
CREATE OR REPLACE FUNCTION public.record_meeting_cost(
  p_meeting_id     uuid,
  p_llm_calls      integer,
  p_tokens_in      bigint,
  p_tokens_out     bigint,
  p_models         text[],
  p_recall_seconds integer DEFAULT NULL,
  p_stt_seconds    integer DEFAULT NULL,
  p_stt_provider   text    DEFAULT NULL,
  p_regenerated    boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.meeting_costs AS mc (
    meeting_id, recall_seconds, stt_seconds, stt_provider,
    llm_calls, llm_tokens_in, llm_tokens_out, llm_models, pipeline_runs, updated_at
  ) VALUES (
    p_meeting_id,
    COALESCE(p_recall_seconds, 0), COALESCE(p_stt_seconds, 0), p_stt_provider,
    COALESCE(p_llm_calls, 0), COALESCE(p_tokens_in, 0), COALESCE(p_tokens_out, 0),
    COALESCE(p_models, '{}'), 1, now()
  )
  ON CONFLICT (meeting_id) DO UPDATE SET
    -- Audio is transcribed once per run, but a regeneration re-reads the STORED
    -- transcript and pays no audio cost at all — so these only grow on a run
    -- that actually touched audio, which is one that supplies the values.
    recall_seconds = GREATEST(mc.recall_seconds, COALESCE(p_recall_seconds, 0)),
    stt_seconds    = mc.stt_seconds + CASE WHEN p_regenerated THEN 0 ELSE COALESCE(p_stt_seconds, 0) END,
    stt_provider   = COALESCE(p_stt_provider, mc.stt_provider),
    llm_calls      = mc.llm_calls + COALESCE(p_llm_calls, 0),
    llm_tokens_in  = mc.llm_tokens_in + COALESCE(p_tokens_in, 0),
    llm_tokens_out = mc.llm_tokens_out + COALESCE(p_tokens_out, 0),
    llm_models     = ARRAY(SELECT DISTINCT unnest(mc.llm_models || COALESCE(p_models, '{}'))),
    pipeline_runs  = mc.pipeline_runs + 1,
    updated_at     = now();
END;
$$;

COMMENT ON FUNCTION public.record_meeting_cost IS
  'Accumulates one pipeline run into meeting_costs. Increments, because a Whisper '
  'fallback or a regeneration is a real additional cost.';

/**
 * Cost and margin in rupees.
 *
 * EVERY RATE BELOW IS IN ONE PLACE ON PURPOSE. Change them here when a contract
 * changes; do not scatter them into queries.
 *
 *   Recall.ai   $0.25/hr  (startup programme, first 10k hours)  ≈ ₹22/hr
 *   Sarvam      UNVERIFIED — assumed ₹20/hr. Check an invoice before quoting
 *               this to anyone; it is roughly 44% of marginal cost.
 *   Whisper     $0.006/min                                       ≈ ₹32/hr
 *   gpt-4o-mini $0.15 / 1M in, $0.60 / 1M out                    ≈ ₹13 / ₹53 per 1M
 *
 * USD→INR at 88. Values are paise (integers) so nothing rounds away.
 */
CREATE OR REPLACE VIEW public.meeting_margin AS
SELECT
  m.id                                            AS meeting_id,
  m.user_id,
  m.created_at,
  m.duration_seconds,
  c.stt_provider,
  c.pipeline_runs,
  c.llm_tokens_in,
  c.llm_tokens_out,

  ROUND(c.recall_seconds / 3600.0 * 2200)::bigint AS recall_paise,
  ROUND(
    c.stt_seconds / 3600.0 *
    CASE WHEN c.stt_provider = 'whisper' THEN 3200 ELSE 2000 END
  )::bigint                                       AS stt_paise,
  ROUND(
    c.llm_tokens_in  / 1000000.0 * 1320 +
    c.llm_tokens_out / 1000000.0 * 5280
  )::bigint                                       AS llm_paise,

  ROUND(
    c.recall_seconds / 3600.0 * 2200
    + c.stt_seconds / 3600.0 * CASE WHEN c.stt_provider = 'whisper' THEN 3200 ELSE 2000 END
    + c.llm_tokens_in  / 1000000.0 * 1320
    + c.llm_tokens_out / 1000000.0 * 5280
  )::bigint                                       AS total_paise
FROM public.meetings m
JOIN public.meeting_costs c ON c.meeting_id = m.id;

COMMENT ON VIEW public.meeting_margin IS
  'Per-meeting cost in paise. Rates are defined in this view only. The Sarvam '
  'rate is an ESTIMATE pending an invoice — treat any total containing it as '
  'indicative, not as a number to price against.';

REVOKE ALL ON public.meeting_costs  FROM anon, authenticated;
REVOKE ALL ON public.meeting_margin FROM anon, authenticated;
