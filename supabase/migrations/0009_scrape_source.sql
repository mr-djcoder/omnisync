alter table public.social_connections
  add column if not exists sync_mode text not null default 'manual'
  check (sync_mode in ('manual', 'auto'));
-- expose sync_mode on the token-free view
create or replace view public.social_connections_public as
  select id, user_id, provider, external_id, handle, scopes, is_owned, connector_type,
         status, sync_mode, created_at
  from public.social_connections;
