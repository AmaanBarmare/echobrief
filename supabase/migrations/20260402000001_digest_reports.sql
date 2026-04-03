-- Digest report scheduling and history

-- 1. Create digest_schedules table
CREATE TABLE IF NOT EXISTS public.digest_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'disabled')),
  day_of_week INTEGER DEFAULT 1, -- 0=Sunday, 1=Monday, etc
  day_of_month INTEGER DEFAULT 1, -- 1-31 for monthly
  hour_of_day INTEGER DEFAULT 9, -- 0-23
  minute_of_hour INTEGER DEFAULT 0, -- 0-59
  timezone TEXT DEFAULT 'UTC',
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create digest_reports table (audit log)
CREATE TABLE IF NOT EXISTS public.digest_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL, -- 'weekly', 'monthly', 'manual'
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  meetings_count INTEGER DEFAULT 0,
  insights_summary JSONB, -- Summary stats
  recipient_emails TEXT[] DEFAULT ARRAY[]::text[],
  status TEXT DEFAULT 'generated', -- 'generated', 'sent', 'failed'
  message_ids TEXT[] DEFAULT ARRAY[]::text[], -- Resend message IDs
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

-- 3. Enable RLS
ALTER TABLE public.digest_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digest_reports ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies for digest_schedules
CREATE POLICY "Users can view own digest schedule"
  ON public.digest_schedules FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own digest schedule"
  ON public.digest_schedules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own digest schedule"
  ON public.digest_schedules FOR UPDATE
  USING (auth.uid() = user_id);

-- 5. RLS policies for digest_reports
CREATE POLICY "Users can view own digest reports"
  ON public.digest_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own digest reports"
  ON public.digest_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 6. Create triggers for updated_at
CREATE TRIGGER update_digest_schedules_updated_at
  BEFORE UPDATE ON public.digest_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Create indexes
CREATE INDEX IF NOT EXISTS idx_digest_schedules_user_id ON public.digest_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_digest_reports_user_id ON public.digest_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_digest_reports_period ON public.digest_reports(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_digest_reports_status ON public.digest_reports(status);
