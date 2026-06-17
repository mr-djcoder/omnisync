-- History shows the published text, which platform/account it went to, and the
-- date — no media. Store a self-contained snapshot on each publication so it
-- survives even if the draft is later deleted.
alter table public.publications
  add column if not exists text text,
  add column if not exists provider text,
  add column if not exists handle text;
