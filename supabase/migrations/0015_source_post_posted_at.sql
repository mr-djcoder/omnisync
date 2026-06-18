-- Original publish time of the source post (distinct from created_at, which is
-- when OmniSync ingested it). Shown on Home post cards.
alter table public.source_posts add column if not exists posted_at timestamptz;
