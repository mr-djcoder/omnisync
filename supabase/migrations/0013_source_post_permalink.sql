-- Store the original post's public permalink so remixes can link back to the
-- source (link-preview share) instead of re-uploading scraped media.
alter table public.source_posts add column if not exists permalink text;
