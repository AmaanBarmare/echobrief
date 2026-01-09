-- Ensure RLS is enabled on user_oauth_tokens (this is idempotent)
ALTER TABLE public.user_oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies that might allow user access
DROP POLICY IF EXISTS "Users can view their own OAuth tokens" ON public.user_oauth_tokens;
DROP POLICY IF EXISTS "Users can insert their own OAuth tokens" ON public.user_oauth_tokens;
DROP POLICY IF EXISTS "Users can update their own OAuth tokens" ON public.user_oauth_tokens;
DROP POLICY IF EXISTS "Users can delete their own OAuth tokens" ON public.user_oauth_tokens;

-- Add comment explaining the security model
COMMENT ON TABLE public.user_oauth_tokens IS 'OAuth tokens - RLS enabled with NO user policies. Only service role (edge functions) can access this table. This is intentional for security.';