# OmniSync — Phase 6: Publish, History, Push & Webhook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Publish approved drafts to their target channels, record history, notify the user,
and add the optional Meta webhook fast-path — completing the end-to-end loop.

**Architecture:** A `publish` Edge Function decrypts each draft target's text + the
destination's token **server-side**, posts to the platform (Facebook Graph in v1), records a
`publications` row per target, and marks the draft published. A `History` tab reads
`publications` (read-only, top-10). Device push tokens are stored in `push_tokens`;
`generate-variations` and `publish` send an Expo push. A `meta-webhook` function provides the
optional real-time fast-path, inserting `source_posts` like the poller.

**Tech Stack:** Supabase Edge Functions + Postgres, Expo Notifications + Expo Push API, Deno.

**Reference:** design spec §1a (History read-only), §2a (webhook fast-path), §4, §5, §6.

**Builds on:** Phases 3–5 (merged).

---

## Prerequisites (human, before live verification)

- Meta app with `pages_manage_posts`; a connected Facebook Page; migrations applied; `publish`
  + `meta-webhook` deployed; `CONNECTION_ENC_KEY` as function secrets.
- For push: an Expo project + a dev build (push doesn't work in Expo Go); device grants
  notification permission.
- For webhook: Meta webhook subscription pointed at the deployed `meta-webhook` URL with a
  verify token (`META_WEBHOOK_VERIFY_TOKEN`) + app secret for signature checking.

If absent: implement code + unit tests; mark live publish/push/webhook as blocked.

---

## File Structure

```
packages/shared/src/
├─ publish.ts              # PublishResult type + summarizePublish (pure)
└─ publish.test.ts
supabase/
├─ migrations/0008_push_tokens.sql
└─ functions/
   ├─ publish/index.ts          # publish a draft's targets, record publications
   └─ meta-webhook/index.ts     # GET verify + POST ingest (fast-path)
app/src/features/
├─ history/useHistory.ts        # top-10 publications
└─ push/registerPush.ts         # register device push token
app/app/(app)/
├─ history.tsx                  # read-only History tab
└─ _layout.tsx                  # add History tab (modify)
app/app/_layout.tsx             # register push on auth (modify)
```

---

## Task 1: Publish summary (TDD, shared)

**Files:** `packages/shared/src/publish.ts`, `publish.test.ts`; modify `index.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { summarizePublish } from './publish';

describe('summarizePublish', () => {
  it('counts successes and failures', () => {
    const s = summarizePublish([
      { connection_id: 'a', status: 'success' },
      { connection_id: 'b', status: 'failed' },
      { connection_id: 'c', status: 'success' },
    ]);
    expect(s).toEqual({ total: 3, succeeded: 2, failed: 1 });
  });
  it('handles empty', () => {
    expect(summarizePublish([])).toEqual({ total: 0, succeeded: 0, failed: 0 });
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — `packages/shared/src/publish.ts`

```ts
export type PublishResult = { connection_id: string; status: 'success' | 'failed' };

export function summarizePublish(results: PublishResult[]): {
  total: number;
  succeeded: number;
  failed: number;
} {
  let succeeded = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === 'success') succeeded++;
    else failed++;
  }
  return { total: results.length, succeeded, failed };
}
```

- [ ] **Step 4: Re-export, run → PASS, typecheck.**
- [ ] **Step 5: Commit** — `feat(shared): publish result summary`

---

## Task 2: push_tokens table (migration 0008)

**Files:** `supabase/migrations/0008_push_tokens.sql`

- [ ] **Step 1: Write**

```sql
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
```

- [ ] **Step 2: Commit** — `feat(supabase): push_tokens table (RLS)`

---

## Task 3: publish Edge Function

**Files:** `supabase/functions/publish/index.ts`

- [ ] **Step 1: Implement** (user-auth'd; decrypt token + text server-side; post to FB; record)

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = req.headers.get('Authorization') ?? '';
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u.user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors });

  const { draft_id } = await req.json().catch(() => ({}));
  if (!draft_id) return new Response(JSON.stringify({ error: 'missing draft_id' }), { status: 400, headers: cors });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const encKey = Deno.env.get('CONNECTION_ENC_KEY')!;

  // Ownership check.
  const { data: draft } = await admin.from('drafts').select('id, user_id').eq('id', draft_id).maybeSingle();
  if (!draft || draft.user_id !== u.user.id) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: cors });

  // Decrypt targets (user-context RPC + server key).
  const { data: targets } = await userClient.rpc('get_draft_targets', { p_draft_id: draft_id, p_enc_key: encKey });

  const results: Array<{ connection_id: string; status: string }> = [];
  for (const t of (targets ?? []) as Array<{ connection_id: string; text: string }>) {
    const { data: conn } = await admin
      .from('social_connections').select('provider, external_id').eq('id', t.connection_id).maybeSingle();
    let status = 'failed';
    let externalId: string | null = null;
    if (conn?.provider === 'facebook') {
      const { data: token } = await admin.rpc('get_connection_token', { p_connection_id: t.connection_id, p_enc_key: encKey });
      if (token) {
        const res = await fetch(`https://graph.facebook.com/v21.0/${conn.external_id}/feed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: t.text, access_token: token }),
        });
        const j = await res.json();
        if (res.ok && j.id) {
          status = 'success';
          externalId = j.id;
        }
      }
    }
    await admin.from('publications').insert({
      user_id: u.user.id,
      draft_id,
      connection_id: t.connection_id,
      external_post_id: externalId,
      status,
    });
    results.push({ connection_id: t.connection_id, status });
  }

  await admin.from('drafts').update({ status: 'published' }).eq('id', draft_id);

  return new Response(JSON.stringify({ results }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
```

- [ ] **Step 2: Commit** — `feat(supabase): publish function (FB feed, records publications)`

---

## Task 4: meta-webhook fast-path function

**Files:** `supabase/functions/meta-webhook/index.ts`

- [ ] **Step 1: Implement** (GET verify challenge + POST ingest into source_posts)

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Verification handshake.
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === Deno.env.get('META_WEBHOOK_VERIFY_TOKEN')) {
      return new Response(challenge ?? '', { status: 200 });
    }
    return new Response('forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const raw = await req.text();
  const payload = JSON.parse(raw);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Idempotency: store the raw event.
  const idem = `${payload.entry?.[0]?.id ?? 'x'}:${payload.entry?.[0]?.time ?? Date.now()}`;
  await admin.from('webhook_events').upsert({ idempotency_key: idem, payload }, { onConflict: 'idempotency_key', ignoreDuplicates: true });

  // For each changed page, map to a connection and insert a source_post.
  for (const entry of payload.entry ?? []) {
    const pageId: string = entry.id;
    const { data: conn } = await admin
      .from('social_connections').select('id, user_id').eq('provider', 'facebook').eq('external_id', pageId).maybeSingle();
    if (!conn) continue;
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      const postId: string | undefined = v.post_id ?? v.id;
      if (!postId) continue;
      await admin.from('source_posts').upsert(
        {
          user_id: conn.user_id,
          connection_id: conn.id,
          external_post_id: postId,
          type: 'text',
          text: v.message ?? '',
          media: [],
        },
        { onConflict: 'connection_id,external_post_id', ignoreDuplicates: true },
      );
    }
  }

  return new Response('ok', { status: 200 });
});
```

> Signature verification (`X-Hub-Signature-256`) is recommended for production; add it once
> the app secret is configured. Noted as a follow-up.

- [ ] **Step 2: Commit** — `feat(supabase): meta-webhook fast-path ingestion`

---

## Task 5: History + push registration + Publish wiring (app)

**Files:** `app/src/features/history/useHistory.ts`, `app/src/features/push/registerPush.ts`, `app/app/(app)/history.tsx`, modify `app/app/(app)/_layout.tsx`, `app/app/(app)/review/[postId].tsx`, `app/app/_layout.tsx`

- [ ] **Step 1: History hook** — `useHistory.ts`

```ts
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export type PublicationVM = { id: string; status: string; external_post_id: string | null; published_at: string };

export function useHistory() {
  const [items, setItems] = useState<PublicationVM[]>([]);
  useEffect(() => {
    supabase
      .from('publications')
      .select('id, status, external_post_id, published_at')
      .order('published_at', { ascending: false })
      .limit(10)
      .then(({ data }) => setItems((data as PublicationVM[] | null) ?? []));
  }, []);
  return { items };
}
```

- [ ] **Step 2: Push registration** — `registerPush.ts`

```ts
import * as Notifications from 'expo-notifications';
import { supabase } from '../../lib/supabase';

export async function registerPush(userId: string): Promise<void> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  const tokenResp = await Notifications.getExpoPushTokenAsync();
  const token = tokenResp.data;
  await supabase.from('push_tokens').upsert({ user_id: userId, token });
}
```

> `expo-notifications` must be installed by the operator (`expo install expo-notifications`) —
> it was not added here to avoid mutating deps during a concurrent build. The plan's verify
> step skips push if the module is absent; guard the import so typecheck/test pass without it
> (e.g. wrap in try/catch dynamic import). **Implementer:** if `expo-notifications` is not
> installed, implement `registerPush` defensively with a dynamic `import()` inside try/catch so
> the app still typechecks/builds; the real module gets wired when the operator installs it.

- [ ] **Step 3: History tab** — `history.tsx`: read-only list of `useHistory().items` (status +
  date + external id), no action buttons. Add `<Tabs.Screen name="history" options={{ title: 'History' }} />`
  to `(app)/_layout.tsx`.

- [ ] **Step 4: Wire Publish** — in `review/[postId].tsx`, replace the publish stub with
  `supabase.functions.invoke('publish', { body: { draft_id } })`; on success navigate to History.

- [ ] **Step 5: Register push on auth** — in `app/app/_layout.tsx`, when a session exists, call
  `registerPush(session.user.id)` once (inside the provider/guard effect). Defensive so it no-ops
  when the module/permission is unavailable.

- [ ] **Step 6: Typecheck + commit** — `feat(app): publish wiring, History tab, push registration`

---

## Task 6: Verify, push, PR

- [ ] **Step 1:** `pnpm lint` · `pnpm format`/`format:check` · `pnpm typecheck` · `pnpm test` — all green (new: publish tests). Don't lint/typecheck `supabase/functions/**`.
- [ ] **Step 2:** Live publish/push/webhook only with deploy + Meta + dev build — else mark blocked.
- [ ] **Step 3:** Push `phase6-publish-history`, open PR into `main`, summarize, paste checks, note blocked + the webhook-signature + expo-notifications follow-ups.

---

## Self-Review (coverage vs. spec §1a / §2a / §5 / §6)

- Publish pipeline (FB feed) with per-target `publications` + draft status → Task 3. ✓
- Token + draft text decrypted **server-side only** (RPCs + server enc key in the function) → Task 3. ✓
- Read-only History (top-10) → Task 5. ✓
- Push tokens table + registration + (send hook ready) → Tasks 2/5. ✓
- Meta webhook fast-path (verify + ingest, idempotent) → Task 4. ✓

**Follow-ups (not blockers):** `X-Hub-Signature-256` verification on the webhook; `expo-notifications`
install + actual Expo push send from `generate-variations`/`publish`; FB photo/video 2-step
container publish (text feed only in v1); move webhook to verify signatures before trusting payload.

**This completes the 6-phase roadmap.**
