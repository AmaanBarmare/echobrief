-- Multi-calendar support for EchoBrief
-- Allows users to connect multiple calendar sources (Google, Outlook, iCal, etc)

-- 1. Create calendars table to track connected calendars
CREATE TABLE IF NOT EXISTS calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'outlook', 'ical', 'other')),
  calendar_id TEXT NOT NULL,
  calendar_name TEXT NOT NULL,
  email TEXT,
  is_primary BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  sync_enabled BOOLEAN DEFAULT TRUE,
  credentials JSONB, -- Encrypted OAuth tokens stored here
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider, calendar_id)
);

-- 2. Add RLS for calendars
ALTER TABLE calendars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own calendars" ON calendars FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own calendars" ON calendars FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own calendars" ON calendars FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own calendars" ON calendars FOR DELETE USING (auth.uid() = user_id);

-- 3. Create calendar_events table for synced events
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_id UUID NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  location TEXT,
  meeting_link TEXT,
  organizer_name TEXT,
  organizer_email TEXT,
  attendees JSONB DEFAULT '[]',
  is_recurring BOOLEAN DEFAULT FALSE,
  sync_status TEXT DEFAULT 'synced' CHECK (sync_status IN ('synced', 'pending', 'failed')),
  raw_data JSONB, -- Store full event data for reference
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(calendar_id, event_id)
);

-- 4. Add RLS for calendar_events
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own calendar events" ON calendar_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own calendar events" ON calendar_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own calendar events" ON calendar_events FOR UPDATE USING (auth.uid() = user_id);

-- 5. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_calendars_user_id ON calendars(user_id);
CREATE INDEX IF NOT EXISTS idx_calendars_provider ON calendars(provider);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_calendar_id ON calendar_events(calendar_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events(start_time);

-- 6. Backfill: Add google_calendar_id to profiles table if not exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;

-- 7. Backfill: Migrate existing Google Calendar connection to new calendars table
-- (This will be handled by application code to preserve existing credentials)
