-- Schedule monitor-stuck-meetings every 5 minutes.
-- Detects meetings stuck in non-terminal states for >15 min, attempts known
-- recoveries, logs to monitor_events, and emails admin@oltaflock.ai when
-- recovery fails or a new error pattern is encountered.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'monitor-stuck-meetings',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lekkpfpojlspbuwrtmzt.supabase.co/functions/v1/monitor-stuck-meetings',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
