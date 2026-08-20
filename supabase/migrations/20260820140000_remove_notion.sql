-- Remove the Notion integration.
--
-- The OAuth flow and sync-notion were deployed but nothing ever invoked
-- sync-notion after a meeting completed, so connecting a workspace did
-- nothing. Rather than finish the wiring, the integration is being dropped.
--
-- DESTRUCTIVE: this drops stored Notion OAuth tokens. Any user who had
-- connected a workspace will have to reconnect from scratch if the
-- integration is ever reinstated.
--
-- Before applying, undeploy the functions so nothing writes to the table
-- between the drop and the deploy:
--   supabase functions delete notion-oauth-start  --project-ref lekkpfpojlspbuwrtmzt
--   supabase functions delete notion-oauth-callback --project-ref lekkpfpojlspbuwrtmzt
--   supabase functions delete sync-notion         --project-ref lekkpfpojlspbuwrtmzt

DROP TABLE IF EXISTS public.notion_connections;
