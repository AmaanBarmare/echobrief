-- Service level objectives, measured.
--
-- The eight-week plan ends with publishing an uptime commitment. A commitment
-- is a claim about something you measure, and nothing here was measured: the
-- data to answer "how often does a meeting actually reach the customer, and how
-- fast?" has been sitting in `meetings` since the beginning, unaggregated.
--
-- Three objectives, chosen because each maps to a promise a customer would
-- notice being broken:
--
--   1. LATENCY  — insights ready within 15 minutes of the recording finishing.
--                 Target 95%. This is the product's actual promise.
--   2. SUCCESS  — under 1% of started meetings end in `failed`.
--   3. DELIVERY — the summary email goes out within 5 minutes of insights.
--
-- Views, not tables. They read a few hundred rows on a dataset that is fully
-- cached, so there is nothing to precompute, and a materialised view would need
-- a refresh job — another cron tick against the Disk IO budget for no gain.
--
-- Harness rows are excluded everywhere. `[harness]` meetings are created and
-- deleted by scripts/pipeline-test, and counting a deliberately-failed test
-- scenario against the failure SLO would make the number meaningless.

-- Per-meeting facts, the base every SLO reads from.
CREATE OR REPLACE VIEW public.slo_meeting_facts AS
SELECT
  m.id,
  m.user_id,
  m.created_at,
  m.status,
  -- When the recording finished. Fall back to created_at for rows with no
  -- end_time, so older meetings are not silently dropped from the measurement.
  COALESCE(m.end_time, m.created_at)                        AS work_started_at,
  i.created_at                                              AS insights_at,
  EXTRACT(EPOCH FROM (i.created_at - COALESCE(m.end_time, m.created_at))) AS insight_seconds,
  d.sent_at                                                 AS email_at,
  EXTRACT(EPOCH FROM (d.sent_at - i.created_at))            AS email_seconds
FROM public.meetings m
LEFT JOIN public.meeting_insights i ON i.meeting_id = m.id
LEFT JOIN LATERAL (
  SELECT MIN(ed.created_at) AS sent_at
  FROM public.email_deliveries ed
  WHERE ed.meeting_id = m.id
) d ON true
WHERE m.title IS NULL OR m.title NOT LIKE '[harness]%';

-- One row per day: the three objectives, plus the volume they are computed on,
-- because a 100% success rate over two meetings is not a number to publish.
CREATE OR REPLACE VIEW public.slo_daily AS
SELECT
  date_trunc('day', created_at)::date                                   AS day,
  COUNT(*)                                                              AS meetings,
  COUNT(*) FILTER (WHERE status = 'failed')                             AS failed,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'failed') / NULLIF(COUNT(*), 0), 2
  )                                                                     AS failure_pct,
  COUNT(*) FILTER (WHERE insights_at IS NOT NULL)                       AS with_insights,
  COUNT(*) FILTER (WHERE insight_seconds <= 900)                        AS insights_within_15m,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE insight_seconds <= 900)
      / NULLIF(COUNT(*) FILTER (WHERE insights_at IS NOT NULL), 0), 2
  )                                                                     AS insight_latency_pct,
  ROUND(
    (percentile_cont(0.95) WITHIN GROUP (ORDER BY insight_seconds))::numeric, 0
  )                                                                     AS insight_p95_seconds,
  COUNT(*) FILTER (WHERE email_at IS NOT NULL)                          AS emails_sent,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE email_seconds <= 300)
      / NULLIF(COUNT(*) FILTER (WHERE email_at IS NOT NULL), 0), 2
  )                                                                     AS email_within_5m_pct
FROM public.slo_meeting_facts
GROUP BY 1
ORDER BY 1 DESC;

-- The rolling window an SLA would actually be written against, with an explicit
-- pass/fail per objective so the answer is not left to whoever reads the table.
CREATE OR REPLACE VIEW public.slo_summary_30d AS
WITH w AS (
  SELECT * FROM public.slo_meeting_facts
  WHERE created_at >= now() - interval '30 days'
)
SELECT
  (SELECT COUNT(*) FROM w)                                                       AS meetings_30d,
  (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE insight_seconds <= 900)
     / NULLIF(COUNT(*) FILTER (WHERE insights_at IS NOT NULL), 0), 2) FROM w)    AS insights_within_15m_pct,
  95.0                                                                          AS insights_target_pct,
  (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'failed')
     / NULLIF(COUNT(*), 0), 2) FROM w)                                           AS failure_pct,
  1.0                                                                           AS failure_target_pct,
  (SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE email_seconds <= 300)
     / NULLIF(COUNT(*) FILTER (WHERE email_at IS NOT NULL), 0), 2) FROM w)       AS email_within_5m_pct,
  95.0                                                                          AS email_target_pct,
  (SELECT COUNT(*) FROM public.function_errors
    WHERE created_at >= now() - interval '30 days')                              AS function_errors_30d;

COMMENT ON VIEW public.slo_summary_30d IS
  'The rolling 30-day service levels an SLA would be written against. '
  'Do not publish an uptime number that this view does not support.';

-- Service-role reads only, in line with monitor_events and function_errors:
-- these aggregate across every customer.
REVOKE ALL ON public.slo_meeting_facts FROM anon, authenticated;
REVOKE ALL ON public.slo_daily         FROM anon, authenticated;
REVOKE ALL ON public.slo_summary_30d   FROM anon, authenticated;
