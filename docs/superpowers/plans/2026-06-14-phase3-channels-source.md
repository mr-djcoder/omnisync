# OmniSync — Phase 3: Channels & Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authenticated user connect destination channels, choose a Master Source
(owned or not), and complete onboarding — with OAuth token exchange + encrypted storage
happening server-side so no platform tokens ever reach the app.

**Architecture:** New tables `social_connections`, `master_source`, `source_poll_state`
(RLS, tokens encrypted with `pgcrypto`). An `oauth-exchange` Edge Function performs the
provider code→token exchange with the service-role key and stores the **encrypted** token;
the app only ever sees non-sensitive connection rows (provider, handle, status). Onboarding
screens (`connect` → `master-source` → `success`) are ported from the prototypes and wired
to these tables. The root guard routes a brand-new user (no master source yet) into
onboarding; everyone else goes to Home.

**Tech Stack:** Supabase (Postgres + pgcrypto + RLS + Edge Functions), Supabase JS,
`expo-auth-session` + `expo-web-browser`, NativeWind, Vitest.

**Reference:** design spec `docs/superpowers/specs/2026-06-13-omnisync-design.md` (§1a flow,
§2a ingestion, §4 data model, §6 custody). Prototypes `02-connect-networks.html`,
`03-master-source.html`, `04-onboarding-success.html`.

**Builds on:** Phase 2 auth (merged).

---

## Prerequisites (human-provided, before live verification)

Code + unit tests do NOT require these; live connect flows do.

- A **Meta (Facebook) app** with Facebook Login, the scopes from spec §2
  (`pages_show_list`, `pages_read_user_content`, `pages_manage_posts`), and the app's
  redirect URL allowlisted. Client ID/secret go **only** into the `oauth-exchange` Edge
  Function secrets — never the app.
- Any additional provider apps (Instagram via Meta, etc.) as scope expands. **v1 default for
  this phase: Meta (Facebook Pages) only**; other providers are stubbed behind the same
  interface and enabled later.
- An encryption key for `pgcrypto` available to the Edge Function as `CONNECTION_ENC_KEY`.

If absent: implement all code + unit tests, run lint/typecheck/test, and mark live connect
as "blocked: needs Meta app + enc key" in the PR.

---

## Decision defaults (flag on review)

- **v1 connectable provider: Facebook Pages only.** The connect screen lists the four
  prototype channels but only Facebook is wired; the others show "Coming soon" until their
  apps exist. Rationale: matches the product spec's Master = Facebook Page, avoids stalling
  on four OAuth setups.
- **Master Source** may be any connected account (spec §2a), but since only Facebook is
  wired in v1, the master picker lists Facebook Page connections.
- **Encryption:** `pgcrypto` `pgp_sym_encrypt(token, key)`; key supplied to the Edge
  Function as an env secret (`CONNECTION_ENC_KEY`). Decryption only ever happens server-side
  inside functions that publish/ingest (Phase 4+), never in the app.

---

## File Structure

```
supabase/
├─ migrations/0003_connections.sql        # social_connections, master_source, source_poll_state + RLS + helpers
└─ functions/oauth-exchange/index.ts       # provider code→token exchange + encrypted upsert
packages/shared/src/
├─ connections.ts                          # Provider, ConnectionStatus, schemas
└─ connections.test.ts
app/
├─ src/features/connections/
│  ├─ types.ts                             # Connection view-model (no token)
│  ├─ useConnections.ts                    # list/select hooks (TanStack-free: simple state)
│  ├─ connect.ts                           # starts provider OAuth, calls oauth-exchange
│  └─ connect.test.ts                      # pure helpers (provider config, status mapping)
├─ app/(onboarding)/_layout.tsx
├─ app/(onboarding)/connect.tsx            # port 02
├─ app/(onboarding)/master-source.tsx      # port 03
├─ app/(onboarding)/success.tsx            # port 04
└─ app/_layout.tsx                         # guard: route to onboarding when no master source (modify)
```

---

## Task 1: Connections data model (migration 0003)

**Files:** Create `supabase/migrations/0003_connections.sql`

- [ ] **Step 1: Write the migration**

```sql
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

-- Owner can read/manage their own connections, but NEVER select the encrypted token column
-- from the client: we expose a token-free view for the app.
create policy "connections selectable by owner"
  on public.social_connections for select using (auth.uid() = user_id);
create policy "connections insertable by owner"
  on public.social_connections for insert with check (auth.uid() = user_id);
create policy "connections updatable by owner"
  on public.social_connections for update using (auth.uid() = user_id);
create policy "connections deletable by owner"
  on public.social_connections for delete using (auth.uid() = user_id);

-- Token-free view for client reads.
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
create policy "master upsertable by owner" on public.master_source for insert with check (auth.uid() = user_id);
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
```

- [ ] **Step 2: Apply (human, if Supabase reachable) or note as file-only**

If the Supabase CLI is linked: `npx supabase db push`.
Otherwise commit as file-only and note "not applied locally" per the Phase 1/2 convention.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0003_connections.sql
git commit -m "feat(supabase): connections, master_source, poll_state (RLS + token-free view)"
```

---

## Task 2: Shared connection schemas (TDD)

**Files:** Create `packages/shared/src/connections.ts`, `packages/shared/src/connections.test.ts`; modify `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test** — `packages/shared/src/connections.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { ConnectionSchema, PROVIDERS } from './connections';

describe('connections', () => {
  it('lists the supported providers', () => {
    expect(PROVIDERS).toContain('facebook');
  });
  it('validates a token-free connection row', () => {
    const row = ConnectionSchema.parse({
      id: '00000000-0000-0000-0000-000000000000',
      user_id: '00000000-0000-0000-0000-000000000000',
      provider: 'facebook',
      external_id: '123',
      handle: 'Passport Planet',
      scopes: ['pages_show_list'],
      is_owned: true,
      connector_type: 'owned_api',
      status: 'active',
    });
    expect(row.provider).toBe('facebook');
  });
  it('rejects an unknown provider', () => {
    expect(() => ConnectionSchema.parse({ provider: 'myspace' })).toThrow();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @omnisync/shared test`
Expected: FAIL — cannot resolve `./connections`.

- [ ] **Step 3: Implement** — `packages/shared/src/connections.ts`

```ts
import { z } from 'zod';

export const PROVIDERS = ['facebook', 'instagram', 'tiktok', 'snapchat'] as const;
export const ProviderSchema = z.enum(PROVIDERS);
export type Provider = z.infer<typeof ProviderSchema>;

export const ConnectorTypeSchema = z.enum(['owned_api', 'external_api', 'scrape']);
export const ConnectionStatusSchema = z.enum(['active', 'revoked', 'error']);

export const ConnectionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  provider: ProviderSchema,
  external_id: z.string().min(1),
  handle: z.string().nullable().optional(),
  scopes: z.array(z.string()).default([]),
  is_owned: z.boolean().default(true),
  connector_type: ConnectorTypeSchema.default('owned_api'),
  status: ConnectionStatusSchema.default('active'),
});

export type Connection = z.infer<typeof ConnectionSchema>;
```

- [ ] **Step 4: Re-export** — add to `packages/shared/src/index.ts`

```ts
export * from './connections';
```

- [ ] **Step 5: Run, verify pass + typecheck**

Run: `pnpm --filter @omnisync/shared test`
Expected: PASS.
Run: `pnpm --filter @omnisync/shared typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): connection schemas + provider enum"
```

---

## Task 3: oauth-exchange Edge Function

**Files:** Create `supabase/functions/oauth-exchange/index.ts`

- [ ] **Step 1: Implement the function**

```ts
// Exchanges a provider OAuth code for a token, encrypts it, and upserts a connection.
// Service-role + encryption key are server-only secrets.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ExchangeBody = {
  provider: string;
  code: string;
  redirect_uri: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  // Identify the calling user from their bearer token.
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  const userId = userData.user.id;

  const body = (await req.json().catch(() => null)) as ExchangeBody | null;
  if (!body || body.provider !== 'facebook' || !body.code) {
    return new Response(JSON.stringify({ error: 'invalid request' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Exchange the code for a token with Meta.
  const appId = Deno.env.get('META_APP_ID')!;
  const appSecret = Deno.env.get('META_APP_SECRET')!;
  const tokenUrl =
    `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}` +
    `&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(body.redirect_uri)}` +
    `&code=${encodeURIComponent(body.code)}`;
  const tokenRes = await fetch(tokenUrl);
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    return new Response(JSON.stringify({ error: 'token exchange failed' }), {
      status: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  const userToken: string = tokenJson.access_token;

  // Fetch the pages the user administers (each becomes a connection).
  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?access_token=${encodeURIComponent(userToken)}`,
  );
  const pagesJson = await pagesRes.json();
  const pages: Array<{ id: string; name: string; access_token: string }> = pagesJson.data ?? [];

  // Service-role client for encrypted writes (RPC encrypts inside Postgres).
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const encKey = Deno.env.get('CONNECTION_ENC_KEY')!;

  for (const page of pages) {
    await admin.rpc('upsert_connection', {
      p_user_id: userId,
      p_provider: 'facebook',
      p_external_id: page.id,
      p_handle: page.name,
      p_scopes: ['pages_show_list', 'pages_read_user_content', 'pages_manage_posts'],
      p_token: page.access_token,
      p_enc_key: encKey,
    });
  }

  return new Response(JSON.stringify({ connected: pages.length }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Add the encrypting RPC to a migration** — append to a new
  `supabase/migrations/0004_upsert_connection.sql`

```sql
create or replace function public.upsert_connection(
  p_user_id uuid,
  p_provider text,
  p_external_id text,
  p_handle text,
  p_scopes text[],
  p_token text,
  p_enc_key text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.social_connections
    (user_id, provider, external_id, handle, scopes, access_token_enc, status)
  values
    (p_user_id, p_provider, p_external_id, p_handle, p_scopes,
     pgp_sym_encrypt(p_token, p_enc_key), 'active')
  on conflict (user_id, provider, external_id) do update
    set handle = excluded.handle,
        scopes = excluded.scopes,
        access_token_enc = excluded.access_token_enc,
        status = 'active';
end;
$$;

-- pgcrypto provides pgp_sym_encrypt.
create extension if not exists pgcrypto;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/oauth-exchange supabase/migrations/0004_upsert_connection.sql
git commit -m "feat(supabase): oauth-exchange function + encrypted upsert_connection RPC"
```

---

## Task 4: Connect client helpers (TDD)

**Files:** Create `app/src/features/connections/connect.ts`, `app/src/features/connections/connect.test.ts`, `app/src/features/connections/types.ts`

- [ ] **Step 1: Write the failing test** — `connect.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { providerLabel, isWired } from './connect';

describe('connect helpers', () => {
  it('labels facebook', () => {
    expect(providerLabel('facebook')).toBe('Facebook');
  });
  it('marks facebook as wired and others as coming soon', () => {
    expect(isWired('facebook')).toBe(true);
    expect(isWired('tiktok')).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @omnisync/app test`
Expected: FAIL — cannot resolve `./connect`.

- [ ] **Step 3: Implement** — `app/src/features/connections/types.ts`

```ts
import type { Provider } from '@omnisync/shared';

export type ConnectionVM = {
  id: string;
  provider: Provider;
  handle: string | null;
  status: string;
};
```

`app/src/features/connections/connect.ts`:

```ts
import type { Provider } from '@omnisync/shared';

const LABELS: Record<Provider, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  snapchat: 'Snapchat',
};

// v1: only Facebook is wired; others are "coming soon".
const WIRED: Provider[] = ['facebook'];

export function providerLabel(p: Provider): string {
  return LABELS[p];
}

export function isWired(p: Provider): boolean {
  return WIRED.includes(p);
}

export async function connectFacebook(): Promise<{ error?: string; connected?: number }> {
  const [{ makeRedirectUri }, WebBrowser, { supabase }] = await Promise.all([
    import('expo-auth-session'),
    import('expo-web-browser'),
    import('../../lib/supabase'),
  ]);
  const redirectUri = makeRedirectUri({ scheme: 'omnisync' });
  const appId = process.env.EXPO_PUBLIC_META_APP_ID ?? '';
  const scope = 'pages_show_list,pages_read_user_content,pages_manage_posts';
  const authUrl =
    `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code`;
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
  if (result.type !== 'success') return { error: 'cancelled' };
  const code = new URL(result.url).searchParams.get('code');
  if (!code) return { error: 'no code' };
  const { data, error } = await supabase.functions.invoke('oauth-exchange', {
    body: { provider: 'facebook', code, redirect_uri: redirectUri },
  });
  if (error) return { error: error.message };
  return { connected: (data as { connected: number }).connected };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @omnisync/app test`
Expected: PASS.

- [ ] **Step 5: Add the public Meta app id to env** — append to `app/.env.example`

```
# Meta (Facebook) — public app id (the app SECRET stays server-side only).
EXPO_PUBLIC_META_APP_ID=
```

- [ ] **Step 6: Commit**

```bash
git add app/src/features/connections app/.env.example
git commit -m "feat(connections): facebook connect flow + provider helpers"
```

---

## Task 5: Connections read hook

**Files:** Create `app/src/features/connections/useConnections.ts`

- [ ] **Step 1: Implement the hook**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { ConnectionVM } from './types';

export function useConnections() {
  const [connections, setConnections] = useState<ConnectionVM[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('social_connections_public')
      .select('id, provider, handle, status');
    setConnections((data as ConnectionVM[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { connections, loading, refresh };
}

export async function setMasterSource(connectionId: string): Promise<{ error?: string }> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { error: 'unauthorized' };
  const { error } = await supabase
    .from('master_source')
    .upsert({ user_id: u.user.id, connection_id: connectionId }, { onConflict: 'user_id' });
  return error ? { error: error.message } : {};
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter @omnisync/app typecheck`
Expected: no errors.

```bash
git add app/src/features/connections/useConnections.ts
git commit -m "feat(connections): read connections + set master source"
```

---

## Task 6: Onboarding screens (port 02 / 03 / 04)

**Files:** Create `app/app/(onboarding)/_layout.tsx`, `connect.tsx`, `master-source.tsx`, `success.tsx`

- [ ] **Step 1: Group layout** — `app/app/(onboarding)/_layout.tsx`

```tsx
import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 2: Connect screen** — `app/app/(onboarding)/connect.tsx`

```tsx
import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { PROVIDERS, type Provider } from '@omnisync/shared';
import { providerLabel, isWired, connectFacebook } from '../../src/features/connections/connect';
import { useConnections } from '../../src/features/connections/useConnections';

export default function Connect() {
  const router = useRouter();
  const { connections, refresh } = useConnections();
  const [busy, setBusy] = useState<Provider | null>(null);

  async function onConnect(p: Provider) {
    if (!isWired(p)) return;
    setBusy(p);
    if (p === 'facebook') await connectFacebook();
    await refresh();
    setBusy(null);
  }

  const hasAny = connections.length > 0;

  return (
    <View className="flex-1 bg-background pt-16 px-md">
      <Text className="text-on-surface text-2xl font-bold mb-1">Connect Your Channels</Text>
      <Text className="text-on-surface-variant mb-6">
        Link your social profiles to start syncing your content.
      </Text>
      <ScrollView className="flex-1">
        {PROVIDERS.map((p) => {
          const connected = connections.some((c) => c.provider === p);
          return (
            <View
              key={p}
              className="flex-row items-center justify-between bg-surface-container rounded-xl p-md mb-gutter"
            >
              <Text className="text-on-surface font-semibold">{providerLabel(p)}</Text>
              {connected ? (
                <Text className="text-secondary">Connected</Text>
              ) : isWired(p) ? (
                <Pressable
                  className="border border-secondary rounded-full px-lg py-sm active:opacity-80"
                  onPress={() => onConnect(p)}
                >
                  <Text className="text-secondary">{busy === p ? '…' : 'Connect'}</Text>
                </Pressable>
              ) : (
                <Text className="text-outline">Coming soon</Text>
              )}
            </View>
          );
        })}
      </ScrollView>
      <Pressable
        disabled={!hasAny}
        className={`rounded-full py-4 items-center mb-8 ${hasAny ? 'bg-primary' : 'bg-surface-container'}`}
        onPress={() => router.push('/(onboarding)/master-source')}
      >
        <Text className={hasAny ? 'text-on-primary font-semibold' : 'text-outline'}>Next Step</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 3: Master-source screen** — `app/app/(onboarding)/master-source.tsx`

```tsx
import { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useConnections, setMasterSource } from '../../src/features/connections/useConnections';
import { providerLabel } from '../../src/features/connections/connect';

export default function MasterSource() {
  const router = useRouter();
  const { connections } = useConnections();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onConfirm() {
    if (!selected) return;
    setBusy(true);
    await setMasterSource(selected);
    setBusy(false);
    router.replace('/(onboarding)/success');
  }

  return (
    <View className="flex-1 bg-background pt-16 px-md">
      <Text className="text-on-surface text-2xl font-bold mb-1">Choose Your Master Source</Text>
      <Text className="text-on-surface-variant mb-6">
        The account OmniSync monitors for new updates to broadcast.
      </Text>
      <ScrollView className="flex-1">
        {connections.map((c) => {
          const active = selected === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => setSelected(c.id)}
              className={`bg-surface-container rounded-xl p-md mb-gutter border ${active ? 'border-secondary' : 'border-outline-variant'}`}
            >
              <Text className="text-on-surface font-semibold">{providerLabel(c.provider)}</Text>
              <Text className="text-on-surface-variant">{c.handle ?? c.id}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <Pressable
        disabled={!selected || busy}
        className={`rounded-full py-4 items-center mb-8 ${selected ? 'bg-primary' : 'bg-surface-container'}`}
        onPress={onConfirm}
      >
        <Text className={selected ? 'text-on-primary font-semibold' : 'text-outline'}>
          {busy ? '…' : 'Confirm Source'}
        </Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Success screen** — `app/app/(onboarding)/success.tsx`

```tsx
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';

export default function Success() {
  const router = useRouter();
  return (
    <View className="flex-1 bg-background items-center justify-center px-md gap-lg">
      <Text className="text-primary text-3xl font-bold">You're All Set!</Text>
      <Text className="text-on-surface-variant text-center">
        Your ecosystem is synchronized and ready for your first broadcast.
      </Text>
      <Pressable
        className="bg-primary rounded-full py-4 px-12 items-center active:opacity-80"
        onPress={() => router.replace('/(app)')}
      >
        <Text className="text-on-primary font-semibold">Go to Hub</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm --filter @omnisync/app typecheck`
Expected: no errors.

```bash
git add app/app/(onboarding)
git commit -m "feat(onboarding): connect, master-source, success screens"
```

---

## Task 7: Onboarding routing in the guard

**Files:** Modify `app/app/_layout.tsx`, create `app/src/features/connections/useOnboarded.ts`

- [ ] **Step 1: Onboarding-state hook** — `app/src/features/connections/useOnboarded.ts`

```ts
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

// Onboarded = the user has a master source row.
export function useOnboarded(sessionUserId: string | null) {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    if (!sessionUserId) {
      setOnboarded(null);
      return;
    }
    supabase
      .from('master_source')
      .select('user_id')
      .maybeSingle()
      .then(({ data }) => {
        if (active) setOnboarded(!!data);
      });
    return () => {
      active = false;
    };
  }, [sessionUserId]);

  return onboarded;
}
```

- [ ] **Step 2: Update the guard** — replace the `Guard` function in `app/app/_layout.tsx`

```tsx
function Guard() {
  const { session, loading } = useAuth();
  const onboarded = useOnboarded(session?.user.id ?? null);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const group = segments[0];
    if (!session) {
      if (group !== '(auth)') router.replace('/(auth)/welcome');
      return;
    }
    // Signed in: wait until onboarding state resolves.
    if (onboarded === null) return;
    if (!onboarded && group !== '(onboarding)') router.replace('/(onboarding)/connect');
    else if (onboarded && (group === '(auth)' || group === '(onboarding)')) router.replace('/(app)');
  }, [session, loading, onboarded, segments, router]);

  return <Slot />;
}
```

Add the import at the top of `app/app/_layout.tsx`:

```tsx
import { useOnboarded } from '../src/features/connections/useOnboarded';
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @omnisync/app typecheck`
Expected: no errors.

```bash
git add app/app/_layout.tsx app/src/features/connections/useOnboarded.ts
git commit -m "feat(app): route new users into onboarding until master source is set"
```

---

## Task 8: Verify, push, PR

- [ ] **Step 1: Full suite**

Run: `pnpm lint` · `pnpm format:check` (run `pnpm format` if needed) · `pnpm typecheck` · `pnpm test`
Expected: all green (new tests: connections schema, connect helpers).

- [ ] **Step 2: Live connect smoke test (only if Meta app + enc key configured)**

With `EXPO_PUBLIC_META_APP_ID` set, the `oauth-exchange` function deployed with
`META_APP_ID`/`META_APP_SECRET`/`CONNECTION_ENC_KEY` secrets, and migrations applied:
open the dev build, sign in, go through Connect → Facebook OAuth → a connection appears →
pick it as master → Success → Home. If credentials are not available, record this step as
blocked in the PR.

- [ ] **Step 3: Push + PR**

```bash
git push -u origin phase3-channels-source
```
Open a PR into `main` titled "Phase 3 channels & source". Summarize, paste
lint/typecheck/test output, and note whether live connect ran or was blocked on Meta creds.

---

## Self-Review notes (coverage vs. spec §1a / §2a / §4 / §6)

- Connect destination channels → Tasks 4–6. ✓ (Facebook wired; others "coming soon".)
- Choose a Master Source (owned or not) → Tasks 5–6. ✓
- `social_connections` / `master_source` / `source_poll_state` with RLS + token-free view → Task 1. ✓
- OAuth token exchange **server-side**, token **encrypted (pgcrypto)**, never returned to the
  app (§6 custody) → Tasks 3. ✓
- Onboarding screens + new-user routing (§1a) → Tasks 6–7. ✓
- `connector_type` / `is_owned` recorded → Task 1 schema. ✓

**Deferred:** non-Facebook provider OAuth (enable per provider as apps exist); `SourceConnector`
+ `poll-sources` + `pg_cron` ingestion (Phase 4); Gemini variations + Review Canvas (Phase 5);
publish + History + push (Phase 6).
