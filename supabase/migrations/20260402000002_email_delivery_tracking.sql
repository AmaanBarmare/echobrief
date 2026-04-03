-- Email delivery tracking table
-- Mirrors slack_messages structure for consistency

CREATE TABLE IF NOT EXISTS public.email_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
  message_id TEXT, -- Resend message ID
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies (access through meeting ownership)
CREATE POLICY "Users can view email messages of their meetings"
  ON public.email_messages FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = email_messages.meeting_id 
    AND meetings.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert email messages for their meetings"
  ON public.email_messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = email_messages.meeting_id 
    AND meetings.user_id = auth.uid()
  ));

CREATE POLICY "Users can update email messages of their meetings"
  ON public.email_messages FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.meetings 
    WHERE meetings.id = email_messages.meeting_id 
    AND meetings.user_id = auth.uid()
  ));

-- Create trigger for updated_at
CREATE TRIGGER update_email_messages_updated_at
  BEFORE UPDATE ON public.email_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_email_messages_meeting_id ON public.email_messages(meeting_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_status ON public.email_messages(status);
