# OmniSync — Phase 4: Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Detect new posts from each user's Master Source on a schedule and persist them as
`source_posts`, ready for AI variation generation (Phase 5) — polling-first and
ownership-agnostic, with a pluggable `SourceConnector` and a `poll-sources` Edge Function
run by `pg_cron`.

**Architecture:** A `poll-sources` Edge Function iterates active `master_source` rows, runs
the appropriate `SourceConnector` (Facebook in v1; reads via the Graph API using the
**server-side decrypted** token), compares results against `source_poll_state`, and inserts
new `source_posts`. `pg_cron` calls the function periodically through `pg_net`. The
payload-parsing logic (text / single-image / video → normalized shape) is a **pure function
in `@omnisync/shared`** so it is unit-tested in Node; the Deno function imports the same
logic.

**Tech Stack:** Supabase (Postgres + pgcrypto + RLS + Edge Functions + pg_cron + pg_net),
Deno, zod, Vitest.

**Reference:** design spec §2a (ingestion), §4 (data model), §5 (functions), §6 (custody).

**Builds on:** Phase 3 (merged) — `social_connections`, `master_source`, `source_poll_state`.

---

## Prerequisites (human, before live verification)

- The Phase 3 Meta app + a connected Facebook Page master source (so there's something to
  poll), migrations applied, `oauth-exchange` deployed.
- `poll-sources` deployed; `pg_cron` + `pg_net` extensions enabled (Supabase dashboard →
  Database → Extensions); `CONNECTION_ENC_KEY` available to the function.

If absent: implement code + unit tests, run lint/typecheck/test green, mark live polling as
"blocked: needs deployed function + cron + connected source."

---

## File Structure

```
packages/shared/src/
├─ sourcePost.ts            # SourcePost type + parseFacebookPost (pure) + zod
└─ sourcePost.test.ts
supabase/
├─ migrations/0005_posts_drafts.sql      # source_posts, drafts, draft_targets, publications, webhook_events + RLS
├─ migrations/0006_poll_cron.sql         # schedule poll-sources via pg_cron + pg_net
└─ functions/poll-sources/index.ts        # scheduled poller (Facebook connector inline for v1)
```

---

## Task 1: SourcePost parsing in shared (TDD)

**Files:** Create `packages/shared/src/sourcePost.ts`, `packages/shared/src/sourcePost.test.ts`; modify `packages/shared/src/index.ts`

- [ ] **Step 1: Failing test** — `packages/shared/src/sourcePost.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { parseFacebookPost } from './sourcePost';

describe('parseFacebookPost', () => {
  it('parses a text-only post', () => {
    const p = parseFacebookPost({ id: 'p1', message: 'hello' });
    expect(p).toEqual({ external_post_id: 'p1', type: 'text', text: 'hello', media: [] });
  });
  it('parses a single-image post', () => {
    const p = parseFacebookPost({ id: 'p2', message: 'pic', full_picture: 'http://img/1.jpg' });
    expect(p.type).toBe('image');
    expect(p.media).toEqual(['http://img/1.jpg']);
  });
  it('parses a video post', () => {
    const p = parseFacebookPost({ id: 'p3', message: 'vid', attachments: { data: [{ media_type: 'video', media: { source: 'http://v/1.mp4' } }] } });
    expect(p.type).toBe('video');
    expect(p.media).toEqual(['http://v/1.mp4']);
  });
  it('defaults empty message to empty text', () => {
    expect(parseFacebookPost({ id: 'p4' }).text).toBe('');
  });
});
```

- [ ] **Step 2: Run, verify fail.** `pnpm --filter @omnisync/shared test` → FAIL.

- [ ] **Step 3: Implement** — `packages/shared/src/sourcePost.ts`

```ts
import { z } from 'zod';

export const SourcePostTypeSchema = z.enum(['text', 'image', 'video']);
export type SourcePostType = z.infer<typeof SourcePostTypeSchema>;

export const SourcePostSchema = z.object({
  external_post_id: z.string().min(1),
  type: SourcePostTypeSchema,
  text: z.string(),
  media: z.array(z.string()),
});
export type SourcePost = z.infer<typeof SourcePostSchema>;

// Minimal shape of a Facebook Graph post we care about.
type FbPost = {
  id: string;
  message?: string;
  full_picture?: string;
  attachments?: { data?: Array<{ media_type?: string; media?: { source?: string } }> };
};

export function parseFacebookPost(post: FbPost): SourcePost {
  const text = post.message ?? '';
  const videoSrc = post.attachments?.data?.find((a) => a.media_type === 'video')?.media?.source;
  if (videoSrc) {
    return { external_post_id: post.id, type: 'video', text, media: [videoSrc] };
  }
  if (post.full_picture) {
    return { external_post_id: post.id, type: 'image', text, media: [post.full_picture] };
  }
  return { external_post_id: post.id, type: 'text', text, media: [] };
}
```

- [ ] **Step 4: Re-export** — append to `packages/shared/src/index.ts`: `export * from './sourcePost';`

- [ ] **Step 5: Run, verify pass + typecheck.** `pnpm --filter @omnisync/shared test` PASS; `pnpm --filter @omnisync/shared typecheck` clean.

- [ ] **Step 6: Commit** — `feat(shared): SourcePost schema + parseFacebookPost`

---

## Task 2: Posts/drafts data model (migration 0005)

**Files:** Create `supabase/migrations/0005_posts_drafts.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Commit** — `feat(supabase): source_posts, drafts, draft_targets, publications, webhook_events (RLS)`

---

## Task 3: poll-sources Edge Function

**Files:** Create `supabase/functions/poll-sources/index.ts`

- [ ] **Step 1: Implement** (decrypts token server-side, polls Facebook, inserts new posts)

```ts
// Scheduled poller. For each master source, fetch recent posts and insert new ones.
// Invoked by pg_cron (service-role). No user JWT.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { parseFacebookPost } from 'jsr:@omnisync/shared@0'; // NOTE: see Step 2 fallback

const enc = (s: string) => new TextEncoder().encode(s);

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const encKey = Deno.env.get('CONNECTION_ENC_KEY')!;

  // master_source joined to its connection (facebook only in v1).
  const { data: masters, error } = await admin
    .from('master_source')
    .select('user_id, connection_id, social_connections!inner(id, provider, external_id, user_id)');
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  let inserted = 0;
  for (const m of masters ?? []) {
    const conn = (m as unknown as { social_connections: { id: string; provider: string; external_id: string; user_id: string } }).social_connections;
    if (conn.provider !== 'facebook') continue;

    // Decrypt the page token via an RPC (pgp_sym_decrypt server-side).
    const { data: tokenRow } = await admin.rpc('get_connection_token', {
      p_connection_id: conn.id,
      p_enc_key: encKey,
    });
    const token = tokenRow as string | null;
    if (!token) continue;

    // Cursor.
    const { data: state } = await admin
      .from('source_poll_state')
      .select('last_external_post_id')
      .eq('connection_id', conn.id)
      .maybeSingle();
    const lastSeen = (state as { last_external_post_id?: string } | null)?.last_external_post_id;

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${conn.external_id}/posts` +
        `?fields=id,message,full_picture,attachments{media_type,media}&limit=10` +
        `&access_token=${encodeURIComponent(token)}`,
    );
    const json = await res.json();
    const posts: Array<{ id: string }> = json.data ?? [];

    let newest: string | undefined;
    for (const raw of posts) {
      if (lastSeen && raw.id === lastSeen) break; // reached previously seen
      newest = newest ?? raw.id;
      const parsed = parseFacebookPost(raw as never);
      await admin.from('source_posts').upsert(
        {
          user_id: conn.user_id,
          connection_id: conn.id,
          external_post_id: parsed.external_post_id,
          type: parsed.type,
          text: parsed.text,
          media: parsed.media,
        },
        { onConflict: 'connection_id,external_post_id', ignoreDuplicates: true },
      );
      inserted++;
    }

    if (newest) {
      await admin.from('source_poll_state').upsert(
        { connection_id: conn.id, last_external_post_id: newest, last_seen_at: new Date().toISOString() },
        { onConflict: 'connection_id' },
      );
    }
  }

  return new Response(JSON.stringify({ inserted }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Decryption RPC + token-getter** — append `supabase/migrations/0005b_token_rpc.sql`

```sql
create or replace function public.get_connection_token(p_connection_id uuid, p_enc_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enc bytea;
begin
  select access_token_enc into v_enc from public.social_connections where id = p_connection_id;
  if v_enc is null then
    return null;
  end if;
  return pgp_sym_decrypt(v_enc, p_enc_key);
end;
$$;
revoke all on function public.get_connection_token(uuid, text) from anon, authenticated;
```

> **Deno import note:** if `jsr:@omnisync/shared` is not published, inline a copy of
> `parseFacebookPost` at the top of the function file (it is tiny and pure). Prefer the
> shared import if a JSR/import-map mapping exists; otherwise inline and add a comment that
> it mirrors `packages/shared/src/sourcePost.ts`. The unit test still covers the shared copy.

- [ ] **Step 3: Commit** — `feat(supabase): poll-sources function + token decryption RPC`

---

## Task 4: Schedule with pg_cron (migration 0006)

**Files:** Create `supabase/migrations/0006_poll_cron.sql`

- [ ] **Step 1: Write the schedule**

```sql
-- Requires pg_cron + pg_net (enable in Supabase dashboard → Database → Extensions).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Invoke the poll-sources Edge Function every 5 minutes.
-- Replace <PROJECT_REF> and set the service-role key via a Vault secret in production;
-- this migration documents the schedule shape.
select cron.schedule(
  'omnisync-poll-sources',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/poll-sources',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);
```

> This migration is **environment-specific** (project ref + how the service-role key is
> supplied). Treat it as a documented template; the operator finalizes `<PROJECT_REF>` and
> the key source (Vault) when enabling cron. Do not attempt to apply locally.

- [ ] **Step 2: Commit** — `feat(supabase): pg_cron schedule for poll-sources (template)`

---

## Task 5: Verify, push, PR

- [ ] **Step 1:** `pnpm lint` · `pnpm format`/`format:check` · `pnpm typecheck` · `pnpm test` — all green (new: `sourcePost` tests). Do not lint/typecheck `supabase/functions/**` (Deno).
- [ ] **Step 2:** Live polling smoke test only if function deployed + cron enabled + a Facebook master source connected — otherwise mark blocked.
- [ ] **Step 3:** Push `phase4-ingestion`, open PR into `main`; summarize; paste check output; note live-blocked items.

---

## Self-Review (coverage vs. spec §2a / §4 / §5)

- `SourceConnector` polling (Facebook) + `poll-sources` + `pg_cron` → Tasks 3–4. ✓
- `source_posts` / `drafts` / `draft_targets` (post-targeting) / `publications` / `webhook_events` with RLS → Task 2. ✓
- Token **decrypted server-side only** (RPC, revoked from anon/authenticated) — never in app → Task 3. ✓
- Payload parsing (text/image/video) pure + unit-tested → Task 1. ✓
- `draft_targets.text_enc` encrypted (pgcrypto) → Task 2. ✓

**Deferred:** Gemini variation generation + Review Canvas (Phase 5); publish pipeline +
History + push + the webhook fast-path handler (Phase 6); non-Facebook connectors.
