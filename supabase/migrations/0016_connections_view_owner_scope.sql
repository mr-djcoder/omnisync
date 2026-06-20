-- The token-free view bypassed RLS (views run as owner), exposing every user's
-- connections to every client. Scope it to the calling user so each account
-- only sees its own connections.
create or replace view public.social_connections_public as
  select id, user_id, provider, external_id, handle, scopes, is_owned, connector_type,
         status, sync_mode, created_at
  from public.social_connections
  where user_id = auth.uid();
