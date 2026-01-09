-- Add attendees column to meetings table
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS attendees jsonb DEFAULT '[]'::jsonb;