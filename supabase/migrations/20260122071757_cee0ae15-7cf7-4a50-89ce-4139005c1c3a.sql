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