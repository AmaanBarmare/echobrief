-- Remove Slack integration.
--
-- Slack delivery was never finished as a product surface: the UI asked users to
-- paste a raw channel ID, the Disconnect button never wrote to the DB, and the
-- edge functions only posted when SLACK_BOT_TOKEN happened to be set. We are
-- cutting it entirely to focus on the core record -> transcribe -> summarise
-- pipeline. Email and WhatsApp remain the delivery channels.
--
-- DESTRUCTIVE: drops the slack_messages table and its rows.

DROP TABLE IF EXISTS public.slack_messages;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS slack_connected,
  DROP COLUMN IF EXISTS slack_channel_id,
  DROP COLUMN IF EXISTS slack_channel_name;

-- notification_preferences only exists where full_migration.sql was applied,
-- so guard the ALTER rather than failing the whole migration.
DO $$
BEGIN
  IF to_regclass('public.notification_preferences') IS NOT NULL THEN
    ALTER TABLE public.notification_preferences DROP COLUMN IF EXISTS slack_channel_id;
  END IF;
END $$;

-- Strip any Slack destination left behind in in-flight meeting configs.
UPDATE public.meetings
SET processing_config = processing_config - 'slackDestination'
WHERE processing_config ? 'slackDestination';
