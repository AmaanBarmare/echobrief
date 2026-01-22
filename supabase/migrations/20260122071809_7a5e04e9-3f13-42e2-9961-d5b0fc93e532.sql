-- Note: notion_connections table intentionally has NO user-facing RLS policies
-- It should ONLY be accessed by the service role (edge functions)
-- This is the same pattern as user_oauth_tokens

-- Add a comment to document this security decision
COMMENT ON TABLE public.notion_connections IS 'Notion OAuth tokens - access restricted to service role only for security. No RLS policies by design.';