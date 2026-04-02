-- Add onboarding tracking to profiles

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS preferred_languages TEXT[] DEFAULT ARRAY['English']::text[],
ADD COLUMN IF NOT EXISTS notification_frequency TEXT DEFAULT 'daily';
