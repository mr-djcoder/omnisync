create table if not exists public.push_tokens (
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
alter table public.push_tokens enable row level security;
create policy "push tokens upsertable by owner" on public.push_tokens for insert with check (auth.uid() = user_id);
create policy "push tokens selectable by owner" on public.push_tokens for select using (auth.uid() = user_id);
create policy "push tokens deletable by owner" on public.push_tokens for delete using (auth.uid() = user_id);
