# OmniSync — Phase 5: Generation & Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn ingested source posts into editable, per-platform AI drafts and give the user
a Source Feed, a Review Canvas (remix), a Compose screen (standalone), and a Drafts list —
with content stored as encrypted `draft_targets` and the targeting model from the spec
(select any subset of accounts; Shared vs. Per-target).

**Architecture:** A `generate-variations` Edge Function calls Gemini behind an `AIProvider`
interface and writes a `draft` + encrypted `draft_targets` for the user's connected
accounts. The app reads source posts and drafts from RLS-scoped tables (drafts text via a
token-free / decrypt-on-read RPC), and edits/saves drafts. The AI output shape is validated
with a zod schema in `@omnisync/shared` (unit-tested); the Deno function imports an inlined
mirror.

**Tech Stack:** Supabase (Edge Functions, Postgres, pgcrypto), Gemini via `google-genai`
REST, Expo Router + NativeWind, Vitest.

**Reference:** design spec §1a (Compose/Review + post-targeting), §4 (drafts/draft_targets),
§5 (generate-variations). Prototypes `05-review-canvas.html`, `06-source-feed.html`,
`09-drafts.html`, `13-compose.html`.

**Builds on:** Phases 3–4 (merged).

---

## Prerequisites (human, before live verification)

- `GEMINI_API_KEY` set as a `generate-variations` Edge Function secret (server-only — never
  in the app).
- A connected Facebook master source + ingested `source_posts` (Phase 4 polling) to remix.
- `CONNECTION_ENC_KEY` available to functions for draft encryption/decryption.

If absent: implement code + unit tests; mark live generation/persistence as blocked.

---

## Decision defaults (flag on review)

- **Gemini model:** use `gemini-2.0-flash` (current fast model) via the REST endpoint, behind
  an `AIProvider` interface so it is swappable. (Spec named the dated 1.5 Flash; we use a
  current model.)
- **Draft text storage:** encrypted at rest (`draft_targets.text_enc`). The app reads draft
  text through a `get_draft_targets` RPC that decrypts server-side for the owner; writes go
  through a `save_draft_target` RPC that encrypts. (Keeps plaintext out of the client-readable
  surface while still owner-scoped.)
- **Publish** is stubbed here (button present, writes status) — the real pipeline is Phase 6.

---

## File Structure

```
packages/shared/src/
├─ variation.ts            # AIVariation schema, buildVariationPrompt (pure), charCount
└─ variation.test.ts
supabase/
├─ migrations/0007_draft_rpcs.sql      # get_draft_targets / save_draft_target (encrypt/decrypt)
└─ functions/generate-variations/index.ts   # Gemini AIProvider + draft writing
app/src/features/drafts/
├─ types.ts                # DraftVM, DraftTargetVM
├─ useSourceFeed.ts        # top-10 source posts
├─ useDrafts.ts            # list drafts; create from source; save targets
app/app/(app)/
├─ index.tsx               # Source Feed (modify: list posts + Remix)  [replaces placeholder]
├─ drafts.tsx              # Drafts list
├─ review/[postId].tsx     # Review Canvas (remix)
└─ compose.tsx             # standalone compose (review/new equivalent)
```

> If a `(tabs)` layout does not yet exist, add a simple bottom-tab `(app)/_layout.tsx` using
> `expo-router` Tabs with Home / Drafts (History/Connect/Profile may be placeholders).

---

## Task 1: Variation schema + prompt (TDD, shared)

**Files:** `packages/shared/src/variation.ts`, `packages/shared/src/variation.test.ts`; modify `index.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { AIVariationsSchema, buildVariationPrompt, charCount } from './variation';

describe('variation', () => {
  it('counts characters', () => {
    expect(charCount('hello')).toBe(5);
  });
  it('validates AI output', () => {
    const v = AIVariationsSchema.parse({ facebook: 'a', tiktok: 'b' });
    expect(v.facebook).toBe('a');
  });
  it('rejects non-string variation', () => {
    expect(() => AIVariationsSchema.parse({ facebook: 5 })).toThrow();
  });
  it('builds a prompt that includes the source text and platforms', () => {
    const p = buildVariationPrompt('Launch day!', ['facebook', 'tiktok']);
    expect(p).toContain('Launch day!');
    expect(p).toContain('facebook');
    expect(p).toContain('tiktok');
  });
});
```

- [ ] **Step 2: Run → FAIL.** `pnpm --filter @omnisync/shared test`

- [ ] **Step 3: Implement** — `packages/shared/src/variation.ts`

```ts
import { z } from 'zod';

// AI returns a map of platform -> text.
export const AIVariationsSchema = z.record(z.string(), z.string());
export type AIVariations = z.infer<typeof AIVariationsSchema>;

export function charCount(s: string): number {
  return [...s].length;
}

export function buildVariationPrompt(sourceText: string, platforms: string[]): string {
  return [
    'You are a social media copywriter. Rewrite the source post for each target platform,',
    'respecting each platform’s tone and length norms. Return ONLY a JSON object mapping',
    `each platform name to its rewritten text. Platforms: ${platforms.join(', ')}.`,
    '',
    `Source post:\n${sourceText}`,
  ].join('\n');
}
```

- [ ] **Step 4: Re-export, run → PASS, typecheck.**

- [ ] **Step 5: Commit** — `feat(shared): AI variation schema + prompt builder`

---

## Task 2: Draft RPCs (encrypt/decrypt) — migration 0007

**Files:** `supabase/migrations/0007_draft_rpcs.sql`

- [ ] **Step 1: Write**

```sql
-- Save (encrypt) a draft target's text for the owner.
create or replace function public.save_draft_target(
  p_draft_id uuid, p_connection_id uuid, p_text text, p_media jsonb, p_enc_key text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_user uuid;
begin
  select user_id into v_user from public.drafts where id = p_draft_id;
  if v_user is null or v_user <> auth.uid() then
    raise exception 'not authorized';
  end if;
  insert into public.draft_targets (draft_id, connection_id, text_enc, media)
  values (p_draft_id, p_connection_id, pgp_sym_encrypt(p_text, p_enc_key), coalesce(p_media, '[]'::jsonb))
  returning id into v_id;
  return v_id;
end; $$;

-- Read (decrypt) a draft's targets for the owner.
create or replace function public.get_draft_targets(p_draft_id uuid, p_enc_key text)
returns table (id uuid, connection_id uuid, text text, media jsonb)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.drafts d where d.id = p_draft_id and d.user_id = auth.uid()) then
    raise exception 'not authorized';
  end if;
  return query
    select t.id, t.connection_id, pgp_sym_decrypt(t.text_enc, p_enc_key), t.media
    from public.draft_targets t where t.draft_id = p_draft_id;
end; $$;
```

> Note: the enc key is passed by the caller; in production prefer a Vault-stored key read via
> `vault.decrypted_secrets` rather than a client-passed key. Documented as a follow-up.

- [ ] **Step 2: Commit** — `feat(supabase): encrypt/decrypt draft target RPCs`

---

## Task 3: generate-variations Edge Function

**Files:** `supabase/functions/generate-variations/index.ts`

- [ ] **Step 1: Implement** (Gemini behind a tiny `AIProvider`; inline schema mirror)

```ts
// Generates per-platform variations for a source post and writes a draft + targets.
import { createClient } from 'jsr:@supabase/supabase-js@2';

// mirrors packages/shared/src/variation.ts (kept in sync by hand)
function buildVariationPrompt(sourceText: string, platforms: string[]): string {
  return [
    'You are a social media copywriter. Rewrite the source post for each target platform,',
    "respecting each platform's tone and length norms. Return ONLY a JSON object mapping",
    `each platform name to its rewritten text. Platforms: ${platforms.join(', ')}.`,
    '',
    `Source post:\n${sourceText}`,
  ].join('\n');
}

interface AIProvider {
  generate(prompt: string): Promise<Record<string, string>>;
}

const gemini: AIProvider = {
  async generate(prompt) {
    const key = Deno.env.get('GEMINI_API_KEY')!;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      },
    );
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    try {
      const parsed = JSON.parse(text);
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') out[k] = v;
      return out;
    } catch {
      return {};
    }
  },
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = req.headers.get('Authorization') ?? '';
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  );
  const { data: u } = await userClient.auth.getUser();
  if (!u.user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors });

  const { source_post_id } = await req.json().catch(() => ({}));
  if (!source_post_id) return new Response(JSON.stringify({ error: 'missing source_post_id' }), { status: 400, headers: cors });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const encKey = Deno.env.get('CONNECTION_ENC_KEY')!;

  const { data: post } = await admin.from('source_posts').select('*').eq('id', source_post_id).maybeSingle();
  if (!post || post.user_id !== u.user.id) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: cors });

  const { data: conns } = await admin
    .from('social_connections').select('id, provider').eq('user_id', u.user.id).eq('status', 'active');
  const platforms = (conns ?? []).map((c: { provider: string }) => c.provider);
  const variations = await gemini.generate(buildVariationPrompt(post.text, platforms));

  const { data: draft } = await admin
    .from('drafts')
    .insert({ user_id: u.user.id, source_post_id, origin: 'remix', content_mode: 'shared', status: 'pending' })
    .select('id').single();

  for (const c of conns ?? []) {
    const text = variations[(c as { provider: string }).provider] ?? post.text;
    await admin.rpc('save_draft_target', {
      p_draft_id: draft!.id,
      p_connection_id: (c as { id: string }).id,
      p_text: text,
      p_media: post.media,
      p_enc_key: encKey,
    });
  }

  return new Response(JSON.stringify({ draft_id: draft!.id }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 2: Commit** — `feat(supabase): generate-variations (Gemini) writes encrypted drafts`

---

## Task 4: Drafts/feed hooks + types

**Files:** `app/src/features/drafts/types.ts`, `useSourceFeed.ts`, `useDrafts.ts`

- [ ] **Step 1:** `types.ts`

```ts
export type SourcePostVM = { id: string; type: string; text: string; media: string[] };
export type DraftVM = { id: string; source_post_id: string | null; origin: string; status: string };
export type DraftTargetVM = { id: string; connection_id: string; text: string; media: string[] };
```

- [ ] **Step 2:** `useSourceFeed.ts` (top-10 most recent)

```ts
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { SourcePostVM } from './types';

export function useSourceFeed() {
  const [posts, setPosts] = useState<SourcePostVM[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase
      .from('source_posts')
      .select('id, type, text, media')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setPosts((data as SourcePostVM[] | null) ?? []);
        setLoading(false);
      });
  }, []);
  return { posts, loading };
}
```

- [ ] **Step 3:** `useDrafts.ts`

```ts
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { DraftVM } from './types';

export function useDrafts() {
  const [drafts, setDrafts] = useState<DraftVM[]>([]);
  useEffect(() => {
    supabase
      .from('drafts')
      .select('id, source_post_id, origin, status')
      .order('created_at', { ascending: false })
      .then(({ data }) => setDrafts((data as DraftVM[] | null) ?? []));
  }, []);
  return { drafts };
}

export async function generateForPost(sourcePostId: string): Promise<{ draftId?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('generate-variations', {
    body: { source_post_id: sourcePostId },
  });
  if (error) return { error: error.message };
  return { draftId: (data as { draft_id: string }).draft_id };
}
```

- [ ] **Step 4: Typecheck + commit** — `feat(drafts): source feed + drafts hooks`

---

## Task 5: Screens (feed, review canvas, compose, drafts)

**Files:** `app/app/(app)/index.tsx` (replace placeholder), `app/app/(app)/drafts.tsx`, `app/app/(app)/review/[postId].tsx`, `app/app/(app)/compose.tsx`, and `app/app/(app)/_layout.tsx` (Tabs).

Build functional screens with NativeWind using the existing token classes (bg-background,
text-primary, surface-container, etc.), following prototypes 05/06/09/13 for structure. Each
screen must typecheck and render; live data depends on the prerequisites.

- [ ] **Step 1: Tabs layout** — `app/app/(app)/_layout.tsx`

```tsx
import { Tabs } from 'expo-router';

export default function AppTabs() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: '#16111b', borderTopColor: '#4d4354' } }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="drafts" options={{ title: 'Drafts' }} />
      <Tabs.Screen name="review/[postId]" options={{ href: null }} />
      <Tabs.Screen name="compose" options={{ href: null }} />
    </Tabs>
  );
}
```

- [ ] **Step 2: Source Feed** — `app/app/(app)/index.tsx`: list `useSourceFeed().posts`; each card
  shows text + a **Remix** button that calls `generateForPost(id)` then
  `router.push('/(app)/review/' + draftId)` — but the review screen keys off draft id, so route
  as `review/[postId]` carrying the **draft id** (param name kept as `postId` for the file).
  Include a sign-out affordance and an empty state. Keep the existing `useAuth` import working.

- [ ] **Step 3: Review Canvas** — `app/app/(app)/review/[postId].tsx`: read the draft id from
  `useLocalSearchParams`, load targets via an RPC call
  (`supabase.rpc('get_draft_targets', { p_draft_id, p_enc_key: process.env.EXPO_PUBLIC_DRAFT_ENC_KEY ?? '' })`
  — note: passing the enc key from the client is a known limitation flagged in the plan; for now
  read text via the RPC), render an editable `TextInput` per target with a char count and a
  Shared/Per-target toggle (state only), plus a **Publish** button that updates
  `drafts.status='published'` (stub) and a **Save Draft** that returns to Drafts.

- [ ] **Step 4: Compose** — `app/app/(app)/compose.tsx`: standalone authoring with no source;
  creates a draft (`origin='original'`), lets the user pick target connections
  (`useConnections`) and author text; Save creates draft + targets via `save_draft_target` RPC.

- [ ] **Step 5: Drafts list** — `app/app/(app)/drafts.tsx`: list `useDrafts().drafts`, a
  **Create** button → `router.push('/(app)/compose')`, each draft row → opens review.

- [ ] **Step 6: Typecheck + commit** — `feat(app): source feed, review canvas, compose, drafts screens`

> The enc-key-from-client point is a known weakness; note it in the PR as a follow-up to move
> draft decryption fully server-side (e.g., a function that returns decrypted targets for the
> authenticated user without the client supplying the key).

---

## Task 6: Verify, push, PR

- [ ] **Step 1:** `pnpm lint` · `pnpm format`/`format:check` · `pnpm typecheck` · `pnpm test` — all green (new: variation tests). Don't lint/typecheck `supabase/functions/**`.
- [ ] **Step 2:** Live generation only if `GEMINI_API_KEY` set + function deployed + source posts exist — else mark blocked.
- [ ] **Step 3:** Push `phase5-generation-review`, open PR into `main`, summarize, paste checks, note blocked + the enc-key follow-up.

---

## Self-Review (coverage vs. spec §1a / §4 / §5)

- Gemini variation generation behind `AIProvider` → Task 3. ✓
- Drafts + encrypted `draft_targets` written server-side → Tasks 2–3. ✓
- Review Canvas (remix) + Compose (standalone) + targeting toggle + Drafts + Source Feed → Task 5. ✓
- AI output validated (zod) → Task 1. ✓
- **Follow-ups flagged:** client-passed enc key for draft read (move fully server-side);
  publish is stubbed (Phase 6); push notification on generation (Phase 6).

**Deferred:** publish pipeline, History, push notifications, webhook fast-path (Phase 6).
