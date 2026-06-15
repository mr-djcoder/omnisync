# OmniSync — Phase 7: Public Scrape Source (Apify) + Manual/Auto Sync

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Checkbox (`- [ ]`) steps.

**Goal:** Let the user add a **public Facebook Page by URL** (not owned) as a source, scraped
via **Apify** (server-side), with per-source **manual or auto (daily)** sync and a **"Sync
now"** button on Home.

**Architecture:** A `scrape` source is a `social_connections` row (`connector_type='scrape'`,
`is_owned=false`, no token; `external_id`=page handle). A `scrape-sources` Edge Function calls
the Apify Facebook Posts Scraper (token is a server secret), maps posts → `source_posts`
(text + media URLs) — same downstream as polling. Sync is `manual` (button-only) or `auto`
(daily `pg_cron`), stored per source.

**Tech Stack:** Supabase (Edge Functions, Postgres, pg_cron), Apify API, Expo/NativeWind, Vitest.

**Reference:** spec §2a (scrape connector, ToS caveat), §4. **Direct FB fetch is blocked**
(verified — returns error pages); Apify handles FB anti-bot.

**Builds on:** Phases 3–6 (merged).

---

## Prerequisites (human)

- An **Apify account** + API token → set as the `scrape-sources` secret `APIFY_TOKEN`
  (server-only). At once/day, cost is negligible.
- The Apify actor: **`apify~facebook-posts-scraper`** (Facebook Posts Scraper). If a different
  actor/slug is chosen, update the actor id + input/output mapping in the function.

---

## Decision defaults

- **ToS:** scraping FB violates Meta ToS; this is an explicit, user-accepted, low-frequency
  (daily) opt-in, isolated to scrape sources. Keep the official OAuth path as primary.
- **Sync default:** new scrape sources default to `manual`.
- **Apify call:** `run-sync-get-dataset-items` (synchronous) with `resultsLimit: 10`.

---

## Task 1: Parse FB handle (TDD, shared)

**Files:** `packages/shared/src/fbUrl.ts`, `fbUrl.test.ts`; modify `index.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseFacebookHandle } from './fbUrl';

describe('parseFacebookHandle', () => {
  it('extracts a handle from a page url', () => {
    expect(parseFacebookHandle('https://www.facebook.com/nursenextdoor/')).toBe('nursenextdoor');
  });
  it('handles no trailing slash + query', () => {
    expect(parseFacebookHandle('https://facebook.com/nursenextdoor?ref=x')).toBe('nursenextdoor');
  });
  it('returns null for non-facebook url', () => {
    expect(parseFacebookHandle('https://example.com/x')).toBeNull();
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — `packages/shared/src/fbUrl.ts`

```ts
export function parseFacebookHandle(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return null;
    const seg = u.pathname.split('/').filter(Boolean)[0];
    return seg ? seg.toLowerCase() : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Re-export, run → PASS, typecheck.**
- [ ] **Step 5: Commit** — `feat(shared): parseFacebookHandle`

---

## Task 2: sync_mode column (migration 0009)

**Files:** `supabase/migrations/0009_scrape_source.sql`

```sql
alter table public.social_connections
  add column if not exists sync_mode text not null default 'manual'
  check (sync_mode in ('manual', 'auto'));
-- expose sync_mode on the token-free view
create or replace view public.social_connections_public as
  select id, user_id, provider, external_id, handle, scopes, is_owned, connector_type,
         status, sync_mode, created_at
  from public.social_connections;
```

- [ ] **Commit** — `feat(supabase): sync_mode on connections`

---

## Task 3: scrape-sources Edge Function (Apify)

**Files:** `supabase/functions/scrape-sources/index.ts`

- [ ] **Implement** (user-auth for manual `{connection_id}`; service for cron `{auto:true}`)

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Map one Apify FB post item to our source_posts shape.
function mapItem(it: Record<string, unknown>): {
  external_post_id: string;
  type: string;
  text: string;
  media: string[];
} | null {
  const id = (it.postId ?? it.id ?? it.url) as string | undefined;
  if (!id) return null;
  const text = (it.text ?? it.message ?? '') as string;
  const media: string[] = [];
  const imgs = (it.media ?? it.images ?? it.attachments ?? []) as Array<Record<string, unknown>>;
  for (const m of Array.isArray(imgs) ? imgs : []) {
    const url = (m.url ?? m.image ?? m.src ?? m.thumbnail) as string | undefined;
    if (url) media.push(url);
  }
  const videoUrl = (it.videoUrl ?? it.video) as string | undefined;
  if (videoUrl) media.push(videoUrl);
  const type = videoUrl ? 'video' : media.length ? 'image' : 'text';
  return { external_post_id: String(id), type, text, media };
}

async function scrapeOne(admin: ReturnType<typeof createClient>, conn: {
  id: string; user_id: string; external_id: string;
}) {
  const token = Deno.env.get('APIFY_TOKEN');
  if (!token) return;
  const pageUrl = `https://www.facebook.com/${conn.external_id}/`;
  const res = await fetch(
    `https://api.apify.com/v2/acts/apify~facebook-posts-scraper/run-sync-get-dataset-items?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startUrls: [{ url: pageUrl }], resultsLimit: 10 }),
    },
  );
  if (!res.ok) return;
  const items = (await res.json()) as Array<Record<string, unknown>>;
  for (const raw of Array.isArray(items) ? items : []) {
    const p = mapItem(raw);
    if (!p) continue;
    await admin.from('source_posts').upsert(
      {
        user_id: conn.user_id,
        connection_id: conn.id,
        external_post_id: p.external_post_id,
        type: p.type,
        text: p.text,
        media: p.media,
      },
      { onConflict: 'connection_id,external_post_id', ignoreDuplicates: true },
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const body = await req.json().catch(() => ({}));
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  if (body.auto === true) {
    // cron: all auto scrape sources
    const { data } = await admin
      .from('social_connections')
      .select('id, user_id, external_id')
      .eq('connector_type', 'scrape')
      .eq('sync_mode', 'auto')
      .eq('status', 'active');
    for (const c of data ?? []) await scrapeOne(admin, c as never);
    return new Response(JSON.stringify({ scraped: (data ?? []).length }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // manual: requires the user's JWT + ownership of the connection
  const auth = req.headers.get('Authorization') ?? '';
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u.user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors });
  const { connection_id } = body;
  const { data: conn } = await admin
    .from('social_connections')
    .select('id, user_id, external_id, connector_type')
    .eq('id', connection_id)
    .maybeSingle();
  if (!conn || conn.user_id !== u.user.id || conn.connector_type !== 'scrape') {
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: cors });
  }
  await scrapeOne(admin, conn as never);
  return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
```

> **Note:** Apify actor output keys vary; `mapItem` is best-effort and should be tuned against
> a real run. Deploy with `--no-verify-jwt` is NOT needed (manual path requires the user JWT;
> the cron path passes the service-role key).

- [ ] **Commit** — `feat(supabase): scrape-sources (Apify) for public FB pages`

---

## Task 4: Daily cron (migration 0010, template)

**Files:** `supabase/migrations/0010_scrape_cron.sql`

```sql
-- Daily scrape of auto sources (requires pg_cron + pg_net + service_role_key in Vault).
select cron.schedule(
  'omnisync-scrape-sources',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://chyuinnqaqtgirgxokgm.functions.supabase.co/scrape-sources',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{"auto":true}'::jsonb
  );
  $$
);
```

- [ ] **Commit** — `feat(supabase): daily scrape cron`

---

## Task 5: App — add-by-URL, sync-mode, Sync-now

**Files:** `app/src/features/connections/connect.ts` (add `addScrapeSource`, `setSyncMode`, `syncNow`), `app/app/(onboarding)/connect.tsx` (URL input), `app/app/(app)/index.tsx` (Sync-now button + mode toggle)

- [ ] **Step 1:** add to `connect.ts`

```ts
import { parseFacebookHandle } from '@omnisync/shared';

export async function addScrapeSource(url: string): Promise<{ error?: string }> {
  const handle = parseFacebookHandle(url);
  if (!handle) return { error: 'Enter a valid Facebook page URL.' };
  const { supabase } = await import('../../lib/supabase');
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { error: 'unauthorized' };
  const { error } = await supabase.from('social_connections').insert({
    user_id: u.user.id,
    provider: 'facebook',
    external_id: handle,
    handle,
    is_owned: false,
    connector_type: 'scrape',
    status: 'active',
    sync_mode: 'manual',
  });
  return error ? { error: error.message } : {};
}

export async function setSyncMode(connectionId: string, mode: 'manual' | 'auto') {
  const { supabase } = await import('../../lib/supabase');
  await supabase.from('social_connections').update({ sync_mode: mode }).eq('id', connectionId);
}

export async function syncNow(connectionId: string): Promise<{ error?: string }> {
  const { supabase } = await import('../../lib/supabase');
  const { error } = await supabase.functions.invoke('scrape-sources', {
    body: { connection_id: connectionId },
  });
  return error ? { error: error.message } : {};
}
```

- [ ] **Step 2:** `connect.tsx` — add a labeled `TextInput` ("Add a public Facebook Page URL")
  + an "Add" `Pressable` calling `addScrapeSource(url)` then `refresh()`. Show its error.

- [ ] **Step 3:** `(app)/index.tsx` (Home / Source Feed) — add a **"Sync now"** `Pressable` that
  resolves the master source's `connection_id` (from `master_source` joined to the connection)
  and calls `syncNow(connectionId)` then refetches the feed; show a spinner while busy. Add a
  small **Auto/Manual** toggle that calls `setSyncMode`.

- [ ] **Step 4: Typecheck + commit** — `feat(app): add-by-URL scrape source, sync mode, Sync-now`

---

## Task 6: Verify, push, PR

- [ ] `pnpm lint` · `format:check` · `typecheck` · `test` — green (new: `fbUrl` tests). No Deno lint/typecheck.
- [ ] Live: needs `APIFY_TOKEN` set + `scrape-sources` deployed + migrations applied + a real run to tune `mapItem`. Mark blocked otherwise.
- [ ] Push `phase7-scrape-source`, PR into `main`; note the Apify-mapping tuning + ToS caveat.

---

## Self-Review (spec §2a)

- Public Page by URL as a non-owned scrape source → Tasks 1/5. ✓
- Apify server-side scrape (token server-only) → Task 3. ✓
- Manual (button) + auto (daily cron) sync → Tasks 2/4/5. ✓
- Media (images + video URLs) captured → `mapItem` (Task 3). ✓
- **Follow-ups:** tune `mapItem` to the actual Apify output; consider re-hosting media for
  publishing; OAuth path unchanged (primary for owned Pages).
