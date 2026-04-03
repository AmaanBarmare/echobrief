-- Create google_oauth_states table for OAuth state management
CREATE TABLE IF NOT EXISTS google_oauth_states (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  state text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  return_to text DEFAULT '/settings',
  origin text NOT NULL,
  created_at timestamp DEFAULT now(),
  expires_at timestamp DEFAULT (now() + interval '30 minutes')
);

-- Index on state for faster lookups
CREATE INDEX IF NOT EXISTS idx_google_oauth_states_state ON google_oauth_states(state);

-- Index on user_id for cleanup
CREATE INDEX IF NOT EXISTS idx_google_oauth_states_user_id ON google_oauth_states(user_id);

-- Enable RLS
ALTER TABLE google_oauth_states ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read/write their own state (service role bypass for functions)
CREATE POLICY "oauth_states_service_role" ON google_oauth_states
  USING (true)
  WITH CHECK (true);
