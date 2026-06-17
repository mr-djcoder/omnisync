# Preserve Source via Link Share — Implementation Plan

> Spec: `docs/superpowers/specs/2026-06-17-preserve-source-link-share-design.md`
> Branch: `feat/onboarding-fix-and-adaptive-nav`. Execution: inline (tasks are coupled).

**Goal:** Remix publishes the original FB post as a link-preview card (preserving source), with optional user-added text/media; Hub unchanged.

**Tech:** Expo SDK 56 / RN 0.85 / NativeWind; Supabase Edge Functions (Deno); Postgres + pgcrypto RLS; FB Graph v21.0. Migrations applied via Management API.

---

## Task 1: DB migrations (permalink column + update_draft_target media)

**Files:**
- Create `supabase/migrations/0013_source_post_permalink.sql`
- Create `supabase/migrations/0014_update_draft_target_media.sql`

- [ ] 0013: `alter table public.source_posts add column if not exists permalink text;`
- [ ] 0014: redefine `update_draft_target(p_id uuid, p_text text, p_enc_key text, p_media jsonb default null)` — keep text encrypt; `if p_media is not null then ... set media = p_media`. (CREATE OR REPLACE keeps text-only callers working since new param is defaulted.)
- [ ] Apply both via Management API (Credential Manager token). Verify with `information_schema.columns` (permalink present) + `pg_proc` (4-arg signature present).

## Task 2: Shared media hook (refactor Compose)

**Files:**
- Create `app/src/features/media/useMediaPicker.ts`
- Modify `app/app/(app)/compose.tsx`

- [ ] Extract `toMediaAssets`, `pickMedia`, `captureMedia`, `uploadMedia(userId, draftId, media)` into the hook. Hook owns `media` state + `error` for media, exposes `{ media, setMedia, pickMedia, captureMedia, removeMedia, uploadMedia, mediaError }`. Keep `validateMedia` gating + `targetPlatforms` passed in.
- [ ] Rewire Compose to consume the hook (behavior identical).
- [ ] `pnpm -C app exec tsc --noEmit` clean.

## Task 3: Permalink ingestion (poll + scrape)

**Files:**
- Modify `supabase/functions/poll-sources/index.ts`
- Modify `supabase/functions/scrape-sources/index.ts`

- [ ] poll-sources: add `permalink_url` to `fields=`; `FbPost` gains `permalink_url?`; `parseFacebookPost` returns `permalink`; upsert writes `permalink`.
- [ ] scrape-sources: `mapItem` captures `permalink = it.url ?? it.topLevelUrl ?? it.postUrl ?? it.facebookUrl`; upsert writes `permalink`.
- [ ] `deno check` both (or tsc-equiv) — no type errors.

## Task 4: generate-variations — empty default media

**Files:** Modify `supabase/functions/generate-variations/index.ts`
- [ ] `save_draft_target` call: `p_media: []` (was `post.media`).

## Task 5: publish — link-share branching

**Files:** Modify `supabase/functions/publish/index.ts`
- [ ] Load draft `origin, source_post_id`; if remix, fetch `source_posts.permalink` → `sourceUrl`.
- [ ] Add `appendSourceUrl(text, url)` helper (append at end, skip if already contains url).
- [ ] `publishToFacebook(pageId, token, text, media, sourceUrl?)`: media-empty+sourceUrl → `/feed {message, link}`; media>0 → native branches with `message = appendSourceUrl(text, sourceUrl)` when sourceUrl; media-empty+no-source → `/feed {message}`.
- [ ] Pass `sourceUrl` per call (undefined for Hub).

## Task 6: draft-targets update accepts media

**Files:** Modify `supabase/functions/draft-targets/index.ts`
- [ ] `update` action: pass `p_media: body.media ?? null` to `update_draft_target`.

## Task 7: Review screen — source banner + media picker

**Files:** Modify `app/app/(app)/review/[postId].tsx`
- [ ] Load draft meta (origin, source permalink) — via a small select on `drafts` + `source_posts` (RLS owner). Show source banner when origin==='remix' with tappable permalink (`Linking.openURL`).
- [ ] Add shared media section using `useMediaPicker` (Gallery + Camera + validate + horizontal previews), opt-in.
- [ ] On publish/save: if media present, `uploadMedia` then write URLs to each target via `draft-targets` `update` `{ id, text, media }`. Note text shown when media present.
- [ ] `pnpm -C app exec tsc --noEmit` clean.

## Task 8: Verify + build + commit

- [ ] `pnpm -C packages/shared test` (27 pass) + `pnpm -C app exec tsc --noEmit`.
- [ ] Deploy edge functions (publish, draft-targets, generate-variations, poll-sources, scrape-sources) via Management API/CLI as available.
- [ ] Build release APK → `C:\Users\DJ-XPS9560\Downloads\OmniSync.apk`.
- [ ] Commit + push on branch.
