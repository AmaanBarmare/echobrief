-- Cron jobs authenticate to the edge functions they invoke.
--
-- The cron-invoked functions (auto-join-meetings, monitor-stuck-meetings,
-- prune-recordings) now have verify_jwt = true and require a service-role
-- bearer, so the pg_cron jobs must send one. The service-role JWT lives in
-- Supabase Vault under the name 'service_role_key' (created with
-- `select vault.create_secret('<service role jwt>', 'service_role_key')`) and
-- is read AT EACH TICK inside the job command — no secret literal is ever
-- stored in cron.job or in this migration, and rotating the Vault secret takes
-- effect on the next tick without rescheduling.
--
-- Schedules and URLs are copied verbatim from what is live right now
-- (auto-join */5 from 20260613120000, monitor */15 from 20260613120000,
-- prune-recordings 0 22 * * * from 20260821070000). Per CLAUDE.md, do NOT
-- raise these frequencies without checking the Disk IO Budget.
--
-- prune-job-logs and prune-oauth are pure-SQL jobs (no net.http_post) and are
-- deliberately untouched.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Fail loudly if the Vault secret is missing: scheduling jobs that would send
-- 'Bearer ' + NULL (a NULL header object, in fact) silently breaks every cron
-- tick with a 401 nobody sees.
DO $check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'service_role_key'
  ) THEN
    RAISE EXCEPTION
      'Vault secret ''service_role_key'' is missing. Create it first: '
      'select vault.create_secret(''<service role jwt>'', ''service_role_key'');';
  END IF;
END
$check$;

-- Unschedule-then-schedule (rather than relying on schedule-in-place) so a
-- half-applied earlier state can never leave two jobs with the same name.
DO $unsched$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-join-meetings') THEN
    PERFORM cron.unschedule('auto-join-meetings');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monitor-stuck-meetings') THEN
    PERFORM cron.unschedule('monitor-stuck-meetings');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-recordings') THEN
    PERFORM cron.unschedule('prune-recordings');
  END IF;
  -- Created by hand in prod (no migration in the repo); the function it called
  -- (send-scheduled-emails) is parked and undeployed, so the job goes too.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-onboarding-emails') THEN
    PERFORM cron.unschedule('send-onboarding-emails');
  END IF;
END
$unsched$;

SELECT cron.schedule(
  'auto-join-meetings',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lekkpfpojlspbuwrtmzt.supabase.co/functions/v1/auto-join-meetings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'monitor-stuck-meetings',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://lekkpfpojlspbuwrtmzt.supabase.co/functions/v1/monitor-stuck-meetings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'prune-recordings',
  '0 22 * * *',   -- 03:30 IST (see 20260821070000_cron_schedules_in_ist.sql)
  $$
  SELECT net.http_post(
    url := 'https://lekkpfpojlspbuwrtmzt.supabase.co/functions/v1/prune-recordings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
