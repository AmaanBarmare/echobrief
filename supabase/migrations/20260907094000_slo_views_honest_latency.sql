-- Correct the latency objective to measure from a real zero point.
--
-- 20260907092000 measured insight latency from `meetings.end_time`, which is
-- written when insights are saved. The objective therefore compared an event to
-- itself and reported a p95 of one second across every day of production.
-- Numbers like that are worse than no numbers: they would have been the
-- evidence behind a published SLA.
--
-- The zero point is now `recording_ended_at` (20260907093000), stamped by
-- recall-webhook when the audio is ready. It is NULL for everything recorded
-- before today, so the views expose `measurable` alongside every percentage —
-- a rate over three meetings should not read the same as a rate over three
-- hundred.

-- The base view gains a column and loses one, and CREATE OR REPLACE cannot
-- rename a view column. Dropped in dependency order and rebuilt; these are
-- views over live tables, so nothing but the definitions is lost.
DROP VIEW IF EXISTS public.slo_summary_30d;
DROP VIEW IF EXISTS public.slo_daily;
DROP VIEW IF EXISTS public.slo_meeting_facts;

CREATE VIEW public.slo_meeting_facts AS
SELECT
  m.id,
  m.user_id,
  m.created_at,
  m.status,
  m.recording_ended_at,
  i.created_at                                                              AS insights_at,
  -- NULL, not a guess, when the meeting predates the instrumentation.
  CASE
    WHEN m.recording_ended_at IS NOT NULL AND i.created_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (i.created_at - m.recording_ended_at))
  END                                                                       AS insight_seconds,
  d.sent_at                                                                 AS email_at,
  EXTRACT(EPOCH FROM (d.sent_at - i.created_at))                            AS email_seconds
FROM public.meetings m
LEFT JOIN public.meeting_insights i ON i.meeting_id = m.id
LEFT JOIN LATERAL (
  SELECT MIN(ed.created_at) AS sent_at
  FROM public.email_deliveries ed
  WHERE ed.meeting_id = m.id
) d ON true
WHERE m.title IS NULL OR m.title NOT LIKE '[harness]%';

CREATE VIEW public.slo_daily AS
SELECT
  date_trunc('day', created_at)::date                                    AS day,
  COUNT(*)                                                               AS meetings,
  COUNT(*) FILTER (WHERE status = 'failed')                              AS failed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'failed')
    / NULLIF(COUNT(*), 0), 2)                                            AS failure_pct,
  -- How many meetings the latency objective can actually be computed on.
  COUNT(*) FILTER (WHERE insight_seconds IS NOT NULL)                    AS latency_measurable,
  ROUND(100.0 * COUNT(*) FILTER (WHERE insight_seconds <= 900)
    / NULLIF(COUNT(*) FILTER (WHERE insight_seconds IS NOT NULL), 0), 2) AS insight_latency_pct,
  ROUND((percentile_cont(0.95) WITHIN GROUP (
    ORDER BY insight_seconds) FILTER (WHERE insight_seconds IS NOT NULL))::numeric, 0)
                                                                         AS insight_p95_seconds,
  COUNT(*) FILTER (WHERE email_at IS NOT NULL)                           AS emails_sent,
  ROUND(100.0 * COUNT(*) FILTER (WHERE email_seconds <= 300)
    / NULLIF(COUNT(*) FILTER (WHERE email_at IS NOT NULL), 0), 2)        AS email_within_5m_pct
FROM public.slo_meeting_facts
GROUP BY 1
ORDER BY 1 DESC;

CREATE VIEW public.slo_summary_30d AS
WITH w AS (
  SELECT * FROM public.slo_meeting_facts
  WHERE created_at >= now() - interval '30 days'
)
SELECT
  (SELECT COUNT(*) FROM w)                                                     AS meetings_30d,
  (SELECT COUNT(*) FROM w WHERE insight_seconds IS NOT NULL)                   AS latency_measurable_30d,
  (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE insight_seconds <= 900)
     / NULLIF(COUNT(*) FILTER (WHERE insight_seconds IS NOT NULL), 0), 2)
   FROM w)                                                                     AS insights_within_15m_pct,
  95.0                                                                         AS insights_target_pct,
  (SELECT ROUND((percentile_cont(0.95) WITHIN GROUP (ORDER BY insight_seconds)
     FILTER (WHERE insight_seconds IS NOT NULL))::numeric, 0) FROM w)          AS insight_p95_seconds,
  (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'failed')
     / NULLIF(COUNT(*), 0), 2) FROM w)                                         AS failure_pct,
  1.0                                                                          AS failure_target_pct,
  (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE email_seconds <= 300)
     / NULLIF(COUNT(*) FILTER (WHERE email_at IS NOT NULL), 0), 2) FROM w)     AS email_within_5m_pct,
  95.0                                                                         AS email_target_pct,
  (SELECT COUNT(*) FROM public.function_errors
    WHERE created_at >= now() - interval '30 days')                            AS function_errors_30d;

COMMENT ON VIEW public.slo_summary_30d IS
  'Rolling 30-day service levels. `latency_measurable_30d` is the sample the latency '
  'figure rests on — it starts at zero on 2026-09-07 and grows one meeting at a time. '
  'Do not publish an uptime number this view does not support.';

REVOKE ALL ON public.slo_meeting_facts FROM anon, authenticated;
REVOKE ALL ON public.slo_daily         FROM anon, authenticated;
REVOKE ALL ON public.slo_summary_30d   FROM anon, authenticated;
