-- Ingested source posts.
create table if not exists public.source_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  connection_id uuid not null references public.social_connections (id) on delete cascade,
  external_post_id text not null,
  type text not null,                       -- text | image | video
  text text not null default '',
  media jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (connection_id, external_post_id)
);
alter table public.source_posts enable row level security;
create policy "source_posts selectable by owner" on public.source_posts for select using (auth.uid() = user_id);

-- Drafts (a post being prepared).
create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_post_id uuid references public.source_posts (id) on delete set null,
  origin text not null default 'remix',     -- remix | original
  content_mode text not null default 'shared', -- shared | per_target
  status text not null default 'pending',   -- pending | edited | published
  created_at timestamptz not null default now()
);
alter table public.drafts enable row level security;
create policy "drafts selectable by owner" on public.drafts for select using (auth.uid() = user_id);
create policy "drafts insertable by owner" on public.drafts for insert with check (auth.uid() = user_id);
create policy "drafts updatable by owner" on public.drafts for update using (auth.uid() = user_id);
create policy "drafts deletable by owner" on public.drafts for delete using (auth.uid() = user_id);

-- One row per selected destination for a draft. Text stored ENCRYPTED.
create table if not exists public.draft_targets (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts (id) on delete cascade,
  connection_id uuid not null references public.social_connections (id) on delete cascade,
  text_enc bytea,
  media jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table public.draft_targets enable row level security;
create policy "draft_targets selectable by owner"
  on public.draft_targets for select
  using (exists (select 1 from public.drafts d where d.id = draft_id and d.user_id = auth.uid()));

-- Publication history.
create table if not exists public.publications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  draft_id uuid references public.drafts (id) on delete set null,
  connection_id uuid references public.social_connections (id) on delete set null,
  external_post_id text,
  status text not null,                     -- success | failed
  published_at timestamptz not null default now()
);
alter table public.publications enable row level security;
create policy "publications selectable by owner" on public.publications for select using (auth.uid() = user_id);

-- Raw webhook payloads (fast-path only); dedupe key.
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text unique,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.webhook_events enable row level security; -- no client policies: server-only
