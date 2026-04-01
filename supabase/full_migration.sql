-- ============ 20260108094551_a8bc452f-929d-488d-b999-a07447853bb8.sql ============
-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT,
  google_calendar_connected BOOLEAN DEFAULT FALSE,
  slack_connected BOOLEAN DEFAULT FALSE,
  slack_channel_id TEXT,
  slack_channel_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create meetings table
CREATE TABLE public.meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source TEXT DEFAULT 'manual', -- 'google_meet', 'zoom', 'teams', 'manual', 'calendar'
  calendar_event_id TEXT,
  meeting_link TEXT,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  end_time TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  status TEXT DEFAULT 'scheduled', -- 'scheduled', 'recording', 'processing', 'completed', 'failed'
  audio_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create transcripts table
CREATE TABLE public.transcripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  speakers JSONB DEFAULT '[]',
  word_timestamps JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create meeting_insights table
CREATE TABLE public.meeting_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  summary_short TEXT,
  summary_detailed TEXT,
  key_points JSONB DEFAULT '[]',
  action_items JSONB DEFAULT '[]',
  decisions JSONB DEFAULT '[]',
  risks JSONB DEFAULT '[]',
  follow_ups JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create slack_messages table to track sent messages
CREATE TABLE public.slack_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  message_ts TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slack_messages ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Meetings policies
CREATE POLICY "Users can view their own meetings"
  ON public.meetings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own meetings"
  ON public.meetings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own meetings"
  ON public.meetings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own meetings"
  ON public.meetings FOR DELETE
  USING (auth.uid() = user_id);

-- Transcripts policies (access through meeting ownership)
CREATE POLICY "Users can view transcripts of their meetings"
  ON public.transcripts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = transcripts.meeting_id 
    AND meetings.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert transcripts for their meetings"
  ON public.transcripts FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = transcripts.meeting_id 
    AND meetings.user_id = auth.uid()
  ));

-- Meeting insights policies
CREATE POLICY "Users can view insights of their meetings"
  ON public.meeting_insights FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = meeting_insights.meeting_id 
    AND meetings.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert insights for their meetings"
  ON public.meeting_insights FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = meeting_insights.meeting_id 
    AND meetings.user_id = auth.uid()
  ));

-- Slack messages policies
CREATE POLICY "Users can view slack messages of their meetings"
  ON public.slack_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = slack_messages.meeting_id 
    AND meetings.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert slack messages for their meetings"
  ON public.slack_messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = slack_messages.meeting_id 
    AND meetings.user_id = auth.uid()
  ));

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_meetings_updated_at
  BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for auto profile creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Storage bucket "recordings" must be created in Supabase Dashboard: Storage > New bucket > name: recordings (private)
-- Storage policies are applied in a later migration once the bucket exists

-- ============ 20260108101740_ae5c74f7-4437-4e7d-ba76-fca50fef650c.sql ============
-- Add columns to store Google OAuth tokens
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS google_access_token TEXT,
ADD COLUMN IF NOT EXISTS google_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS google_token_expiry TIMESTAMP WITH TIME ZONE;

-- Update RLS to ensure tokens are protected (already has user-only access)

-- ============ 20260108121042_3451b72b-931e-4025-b77a-7d85779c4733.sql ============
-- Create table to store OAuth states for secure Google Calendar connection
CREATE TABLE public.google_oauth_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  state TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  return_to TEXT NOT NULL DEFAULT '/settings',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.google_oauth_states ENABLE ROW LEVEL SECURITY;

-- Users can only see their own states
CREATE POLICY "Users can view their own oauth states"
ON public.google_oauth_states
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own states
CREATE POLICY "Users can create their own oauth states"
ON public.google_oauth_states
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own states
CREATE POLICY "Users can delete their own oauth states"
ON public.google_oauth_states
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for fast state lookups
CREATE INDEX idx_google_oauth_states_state ON public.google_oauth_states(state);

-- Auto-cleanup old states (older than 10 minutes)
CREATE OR REPLACE FUNCTION public.cleanup_old_oauth_states()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.google_oauth_states 
  WHERE created_at < now() - interval '10 minutes';
  RETURN NEW;
END;
$$;

CREATE TRIGGER cleanup_oauth_states_trigger
AFTER INSERT ON public.google_oauth_states
FOR EACH STATEMENT
EXECUTE FUNCTION public.cleanup_old_oauth_states();

-- ============ 20260108121946_805d36d3-28ff-48be-8a20-724478ac9204.sql ============
ALTER TABLE public.google_oauth_states
ADD COLUMN origin TEXT;

CREATE INDEX IF NOT EXISTS idx_google_oauth_states_user_id ON public.google_oauth_states(user_id);

-- ============ 20260109081903_26482d65-d841-473a-8793-f90da82cbeb1.sql ============
-- Add attendees column to meetings table
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS attendees jsonb DEFAULT '[]'::jsonb;

-- ============ 20260109082434_226ef6c3-8fe5-4036-9dbf-0a230d8781aa.sql ============
-- Create a secure table for OAuth tokens (only accessible by service role)
CREATE TABLE public.user_oauth_tokens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  google_access_token text,
  google_refresh_token text,
  google_token_expiry timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS but with NO client-side policies (service role only)
ALTER TABLE public.user_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- No RLS policies = only service role can access this table
-- This is intentional - tokens should never be accessible from client-side

-- Add updated_at trigger
CREATE TRIGGER update_user_oauth_tokens_updated_at
BEFORE UPDATE ON public.user_oauth_tokens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing tokens from profiles to new table
INSERT INTO public.user_oauth_tokens (user_id, google_access_token, google_refresh_token, google_token_expiry)
SELECT user_id, google_access_token, google_refresh_token, google_token_expiry
FROM public.profiles
WHERE google_access_token IS NOT NULL OR google_refresh_token IS NOT NULL;

-- Remove sensitive token columns from profiles table
ALTER TABLE public.profiles 
  DROP COLUMN IF EXISTS google_access_token,
  DROP COLUMN IF EXISTS google_refresh_token,
  DROP COLUMN IF EXISTS google_token_expiry;

-- ============ 20260109083342_83d66f03-a1a5-4859-8808-e2e60185b509.sql ============
-- Fix critical: user_oauth_tokens needs RLS policies (currently service-role only access is correct, but we need explicit policies)
-- The table should only be accessible by service role, not by regular users
-- We'll add a policy that denies all access to regular users (service role bypasses RLS)

-- First ensure RLS is enabled (it should be from previous migration)
ALTER TABLE public.user_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Add explicit deny-all policy for regular users (service role bypasses this)
-- This is already the default behavior when RLS is enabled with no policies, 
-- but adding an explicit comment policy for documentation
COMMENT ON TABLE public.user_oauth_tokens IS 'OAuth tokens - accessible only via service role (RLS enabled, no user policies intentionally)';

-- Fix missing UPDATE/DELETE policies for transcripts
CREATE POLICY "Users can update their own meeting transcripts"
ON public.transcripts
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = transcripts.meeting_id 
    AND meetings.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own meeting transcripts"
ON public.transcripts
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = transcripts.meeting_id 
    AND meetings.user_id = auth.uid()
  )
);

-- Fix missing UPDATE/DELETE policies for meeting_insights
CREATE POLICY "Users can update their own meeting insights"
ON public.meeting_insights
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = meeting_insights.meeting_id 
    AND meetings.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own meeting insights"
ON public.meeting_insights
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = meeting_insights.meeting_id 
    AND meetings.user_id = auth.uid()
  )
);

-- Fix missing UPDATE/DELETE policies for slack_messages
CREATE POLICY "Users can update their own slack messages"
ON public.slack_messages
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = slack_messages.meeting_id 
    AND meetings.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own slack messages"
ON public.slack_messages
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = slack_messages.meeting_id 
    AND meetings.user_id = auth.uid()
  )
);

-- Fix missing UPDATE policy for google_oauth_states
CREATE POLICY "Users can update their own oauth states"
ON public.google_oauth_states
FOR UPDATE
USING (auth.uid() = user_id);

-- Fix missing DELETE policy for profiles
CREATE POLICY "Users can delete their own profile"
ON public.profiles
FOR DELETE
USING (auth.uid() = user_id);

-- ============ 20260109130108_7869e273-627c-4052-8cf2-c3778b5edf2d.sql ============
-- Add RLS policies to user_oauth_tokens table to protect sensitive OAuth tokens
-- This table contains Google access/refresh tokens and must be strictly protected

-- Ensure RLS is enabled (should already be, but confirming)
ALTER TABLE public.user_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only view their own OAuth tokens
CREATE POLICY "Users can view their own OAuth tokens"
ON public.user_oauth_tokens
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can only insert their own OAuth tokens
CREATE POLICY "Users can insert their own OAuth tokens"
ON public.user_oauth_tokens
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can only update their own OAuth tokens
CREATE POLICY "Users can update their own OAuth tokens"
ON public.user_oauth_tokens
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Users can only delete their own OAuth tokens
CREATE POLICY "Users can delete their own OAuth tokens"
ON public.user_oauth_tokens
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Add comment documenting security requirements
COMMENT ON TABLE public.user_oauth_tokens IS 'Stores Google OAuth tokens. Access restricted to token owner only via RLS. Service role used for server-side operations.';

-- ============ 20260109130736_fcf3910a-e60d-4232-b1dc-0f54a024fe0f.sql ============
-- Remove SELECT policy from user_oauth_tokens table
-- OAuth tokens must NEVER be readable by end users - only via service role
-- Service role bypasses RLS, so tokens remain accessible server-side

-- Drop the SELECT policy that allows authenticated users to read tokens
DROP POLICY IF EXISTS "Users can view their own OAuth tokens" ON public.user_oauth_tokens;

-- Drop additional policies added in recent migration that also allowed user access
DROP POLICY IF EXISTS "Users can insert their own OAuth tokens" ON public.user_oauth_tokens;
DROP POLICY IF EXISTS "Users can update their own OAuth tokens" ON public.user_oauth_tokens;
DROP POLICY IF EXISTS "Users can delete their own OAuth tokens" ON public.user_oauth_tokens;

-- RLS stays enabled - with NO policies, only service role can access
-- This is the correct security posture for OAuth tokens

-- Update the table comment to document the security model
COMMENT ON TABLE public.user_oauth_tokens IS 'Stores Google OAuth tokens. RLS enabled with NO user policies - accessible ONLY via service role (edge functions). This ensures tokens never leak to client-side code.';

-- ============ 20260109143348_a4f63ddb-734c-4abd-9c19-906270af8835.sql ============
-- Ensure RLS is enabled on user_oauth_tokens (this is idempotent)
ALTER TABLE public.user_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies that might allow user access
DROP POLICY IF EXISTS "Users can view their own OAuth tokens" ON public.user_oauth_tokens;
DROP POLICY IF EXISTS "Users can insert their own OAuth tokens" ON public.user_oauth_tokens;
DROP POLICY IF EXISTS "Users can update their own OAuth tokens" ON public.user_oauth_tokens;
DROP POLICY IF EXISTS "Users can delete their own OAuth tokens" ON public.user_oauth_tokens;

-- Add comment explaining the security model
COMMENT ON TABLE public.user_oauth_tokens IS 'OAuth tokens - RLS enabled with NO user policies. Only service role (edge functions) can access this table. This is intentional for security.';

-- ============ 20260110051915_e1aeed28-dbbb-4b75-96f3-891655ec4574.sql ============
-- Add new columns for decision-grade insights
ALTER TABLE public.meeting_insights
ADD COLUMN IF NOT EXISTS strategic_insights jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS open_questions jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS speaker_highlights jsonb DEFAULT '[]'::jsonb;

-- ============ 20260122071757_cee0ae15-7cf7-4a50-89ce-4139005c1c3a.sql ============
-- Add meeting_metrics column to meeting_insights table for storing analytics
ALTER TABLE public.meeting_insights 
ADD COLUMN IF NOT EXISTS meeting_metrics JSONB DEFAULT '{}'::jsonb;

-- Add timeline_entries column for timestamped discussion points
ALTER TABLE public.meeting_insights 
ADD COLUMN IF NOT EXISTS timeline_entries JSONB DEFAULT '[]'::jsonb;

-- Create action_item_completions table to persist task completion state
CREATE TABLE IF NOT EXISTS public.action_item_completions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  action_item_index INTEGER NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, meeting_id, action_item_index)
);

-- Enable RLS on action_item_completions
ALTER TABLE public.action_item_completions ENABLE ROW LEVEL SECURITY;

-- RLS policies for action_item_completions
CREATE POLICY "Users can view their own completions" 
ON public.action_item_completions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own completions" 
ON public.action_item_completions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own completions" 
ON public.action_item_completions 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own completions" 
ON public.action_item_completions 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for updated_at on action_item_completions
CREATE TRIGGER update_action_item_completions_updated_at
BEFORE UPDATE ON public.action_item_completions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create table for Notion integration settings
CREATE TABLE IF NOT EXISTS public.notion_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  access_token TEXT,
  workspace_id TEXT,
  workspace_name TEXT,
  bot_id TEXT,
  reports_database_id TEXT,
  tasks_database_id TEXT,
  connected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on notion_connections - Service role only for security
ALTER TABLE public.notion_connections ENABLE ROW LEVEL SECURITY;

-- Add auto_join_enabled and notetaker_name columns to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS auto_join_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS notetaker_name TEXT DEFAULT 'Notetaker',
ADD COLUMN IF NOT EXISTS pre_meeting_notification_minutes INTEGER DEFAULT 5;

-- Create pre_meeting_notifications table to track sent notifications
CREATE TABLE IF NOT EXISTS public.meeting_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE,
  calendar_event_id TEXT,
  notification_type TEXT NOT NULL DEFAULT 'pre_meeting',
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on meeting_notifications
ALTER TABLE public.meeting_notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies for meeting_notifications
CREATE POLICY "Users can view their own notifications" 
ON public.meeting_notifications 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notifications" 
ON public.meeting_notifications 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" 
ON public.meeting_notifications 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create index for faster notification queries
CREATE INDEX IF NOT EXISTS idx_meeting_notifications_user_status 
ON public.meeting_notifications(user_id, status, scheduled_for);

-- ============ 20260122071809_7a5e04e9-3f13-42e2-9961-d5b0fc93e532.sql ============
-- Note: notion_connections table intentionally has NO user-facing RLS policies
-- It should ONLY be accessed by the service role (edge functions)
-- This is the same pattern as user_oauth_tokens

-- Add a comment to document this security decision
COMMENT ON TABLE public.notion_connections IS 'Notion OAuth tokens - access restricted to service role only for security. No RLS policies by design.';

-- ============ 20260206163811_9648208e-c430-4294-8559-9f8d89190821.sql ============

-- Add RLS policies to user_oauth_tokens (CRITICAL: currently exposed)
CREATE POLICY "Users can view their own oauth tokens"
ON public.user_oauth_tokens
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own oauth tokens"
ON public.user_oauth_tokens
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own oauth tokens"
ON public.user_oauth_tokens
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own oauth tokens"
ON public.user_oauth_tokens
FOR DELETE
USING (auth.uid() = user_id);

-- Add RLS policies to notion_connections (also missing policies)
CREATE POLICY "Users can view their own notion connections"
ON public.notion_connections
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own notion connections"
ON public.notion_connections
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notion connections"
ON public.notion_connections
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notion connections"
ON public.notion_connections
FOR DELETE
USING (auth.uid() = user_id);


-- ============ 20260222180000_storage_recordings.sql ============
-- Storage bucket and policies for meeting recordings
-- Runs only if storage schema exists (new projects may need to create bucket via Dashboard first)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public) 
    VALUES ('recordings', 'recordings', false)
    ON CONFLICT (id) DO NOTHING;
    
    -- Drop existing policies if re-running
    DROP POLICY IF EXISTS "Users can upload their own recordings" ON storage.objects;
    DROP POLICY IF EXISTS "Users can view their own recordings" ON storage.objects;
    DROP POLICY IF EXISTS "Users can delete their own recordings" ON storage.objects;
    
    CREATE POLICY "Users can upload their own recordings"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

    CREATE POLICY "Users can view their own recordings"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);

    CREATE POLICY "Users can delete their own recordings"
      ON storage.objects FOR DELETE
      USING (bucket_id = 'recordings' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;


-- ============ 20260314010000_sarvam_migration.sql ============
-- Sarvam STT migration: add columns for async batch job tracking

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS sarvam_job_id TEXT,
  ADD COLUMN IF NOT EXISTS processing_config JSONB;

ALTER TABLE public.transcripts
  ADD COLUMN IF NOT EXISTS language_detected TEXT,
  ADD COLUMN IF NOT EXISTS stt_provider TEXT DEFAULT 'whisper';

CREATE INDEX IF NOT EXISTS idx_meetings_sarvam_job_id
  ON public.meetings (sarvam_job_id)
  WHERE sarvam_job_id IS NOT NULL;


-- ============ v2_bot_schema.sql ============
-- EchoBrief v2 — Bot-based recording schema changes
-- Run this against the echobrief Supabase project (qjhysesjocanowmdkeme)

-- 1. Add recording_source to meetings table
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS recording_source TEXT DEFAULT 'extension' CHECK (recording_source IN ('extension', 'bot'));
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en';

-- 2. Bot jobs table — tracks each bot container lifecycle
CREATE TABLE IF NOT EXISTS bot_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  meeting_id UUID REFERENCES meetings(id) ON DELETE SET NULL,
  meeting_url TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('google_meet', 'zoom', 'teams')),
  display_name TEXT DEFAULT 'EchoBrief Notetaker',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'joining', 'recording', 'processing', 'completed', 'failed', 'cancelled')),
  container_id TEXT,
  dispatch_reason TEXT CHECK (dispatch_reason IN ('calendar', 'manual', 'slack', 'api', 'extension')),
  preferred_language TEXT DEFAULT 'en',
  error_message TEXT,
  started_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for bot_jobs
ALTER TABLE bot_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own bot jobs" ON bot_jobs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own bot jobs" ON bot_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bot jobs" ON bot_jobs FOR UPDATE USING (auth.uid() = user_id);

-- 3. WhatsApp messages table — delivery tracking
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE NOT NULL,
  phone_number TEXT NOT NULL,
  template_name TEXT,
  language TEXT DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  provider TEXT DEFAULT 'gupshup' CHECK (provider IN ('gupshup', 'twilio')),
  provider_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for whatsapp_messages
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own whatsapp messages" ON whatsapp_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own whatsapp messages" ON whatsapp_messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 4. Notification preferences — per-user delivery channel settings
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  delivery_channels JSONB DEFAULT '["dashboard"]'::jsonb,
  preferred_language TEXT DEFAULT 'en',
  summary_detail_level TEXT DEFAULT 'standard' CHECK (summary_detail_level IN ('brief', 'standard', 'detailed')),
  whatsapp_number TEXT,
  whatsapp_verified BOOLEAN DEFAULT FALSE,
  slack_channel_id TEXT,
  email_enabled BOOLEAN DEFAULT TRUE,
  auto_record BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for notification_preferences
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own preferences" ON notification_preferences FOR ALL USING (auth.uid() = user_id);

-- 5. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_bot_jobs_user_id ON bot_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_bot_jobs_status ON bot_jobs(status);
CREATE INDEX IF NOT EXISTS idx_bot_jobs_meeting_url ON bot_jobs(meeting_url);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_meeting ON whatsapp_messages(meeting_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_user ON whatsapp_messages(user_id);

-- 6. Update meetings table to support bot metadata
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS bot_job_id UUID REFERENCES bot_jobs(id) ON DELETE SET NULL;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS platform TEXT CHECK (platform IN ('google_meet', 'zoom', 'teams', 'unknown'));



