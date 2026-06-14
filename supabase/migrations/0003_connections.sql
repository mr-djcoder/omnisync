-- Connected provider accounts. Access token stored ENCRYPTED (pgcrypto).
create table if not exists public.social_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null,                     -- 'facebook' | 'instagram' | 'tiktok' | 'snapchat'
  external_id text not null,                  -- page/account id at the provider
  handle text,                                -- display handle, non-sensitive
  scopes text[] not null default '{}',
  is_owned boolean not null default true,
  connector_type text not null default 'owned_api', -- owned_api | external_api | scrape
  status text not null default 'active',      -- active | revoked | error
  access_token_enc bytea,                     -- pgp_sym_encrypt output; null for scrape sources
  created_at timestamptz not null default now(),
  unique (user_id, provider, external_id)
);

alter table public.social_connections enable row level security;

create policy "connections selectable by owner"
  on public.social_connections for select using (auth.uid() = user_id);
create policy "connections insertable by owner"
  on public.social_connections for insert with check (auth.uid() = user_id);
create policy "connections updatable by owner"
  on public.social_connections for update using (auth.uid() = user_id);
create policy "connections deletable by owner"
  on public.social_connections for delete using (auth.uid() = user_id);

-- Token-free view for client reads (never exposes access_token_enc).
create or replace view public.social_connections_public as
  select id, user_id, provider, external_id, handle, scopes, is_owned, connector_type, status, created_at
  from public.social_connections;

-- The single master source per user.
create table if not exists public.master_source (
  user_id uuid primary key references auth.users (id) on delete cascade,
  connection_id uuid not null references public.social_connections (id) on delete cascade,
  updated_at timestamptz not null default now()
);
alter table public.master_source enable row level security;
create policy "master selectable by owner" on public.master_source for select using (auth.uid() = user_id);
create policy "master insertable by owner" on public.master_source for insert with check (auth.uid() = user_id);
create policy "master updatable by owner" on public.master_source for update using (auth.uid() = user_id);

-- Polling cursor per source (used in Phase 4).
create table if not exists public.source_poll_state (
  connection_id uuid primary key references public.social_connections (id) on delete cascade,
  last_external_post_id text,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.source_poll_state enable row level security;
create policy "poll state selectable by owner"
  on public.source_poll_state for select
  using (exists (select 1 from public.social_connections c
                 where c.id = connection_id and c.user_id = auth.uid()));
