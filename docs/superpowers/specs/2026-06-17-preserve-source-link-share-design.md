# Preserve Source via Link Share — Design

**Goal:** When publishing a *remixed* post (derived from a scraped/polled source post), preserve attribution by posting the **original Facebook post link** (rich link-preview card) instead of re-uploading scraped media — while still letting the user optionally add their own text and media. Original "Hub" broadcasts (Compose, user's own media) are unchanged.

**Why:** Re-uploading scraped FB-CDN media fails (~403, FB fetching another FB-CDN URL server-side) and loses the link back to the source. A link share preserves the source, eliminates the 403 risk, and is simpler. FB renders only one attachment per post, so media and a rich card are mutually exclusive — resolved below.

## Behavior matrix (remix publish)

| Case | FB post |
|---|---|
| No user media, has source permalink | `POST /feed {message: text, link: permalink}` → **rich link card** |
| User added media | **Native media post** (their media) + source permalink **appended at END** of caption |
| No user media, no permalink (fallback) | Current native re-upload of scraped media (don't lose the post) |
| Hub text-only (no media, no source) | `POST /feed {message}` |

Hub/Compose path is unchanged.

## Components / changes

### 1. Permalink capture (DB + 2 ingesters)
- **Migration `0013_source_post_permalink.sql`**: `alter table public.source_posts add column if not exists permalink text;` Applied via Supabase Management API (Credential Manager token `Supabase CLI:supabase`). No user-run SQL.
- **poll-sources** (Graph, owned pages): add `permalink_url` to the `fields=` query; store `post.permalink_url` into `source_posts.permalink`. Extend the inline `FbPost` type + `parseFacebookPost` to carry `permalink`.
- **scrape-sources** (Apify, public pages): in `mapItem`, capture `it.url ?? it.topLevelUrl ?? it.postUrl ?? it.facebookUrl` as `permalink` (currently the URL is discarded when `postId` exists). Store it.

### 2. generate-variations
- Stop seeding `draft_targets.media` with scraped FB-CDN URLs. Pass `p_media: []` to `save_draft_target`. Source media is now represented by the link card. (User can add their own media in Review.)

### 3. publish/index.ts
- After loading the draft, fetch the source permalink: `drafts.source_post_id` → `source_posts.permalink`.
- `publishToFacebook(pageId, token, text, media, sourceUrl?)`:
  - `media.length === 0 && sourceUrl` → `/feed {message: text, link: sourceUrl}`
  - `media.length > 0` → existing native media branches, with `message = appendSourceUrl(text, sourceUrl)` (append at end, skip if already present)
  - `media.length === 0 && !sourceUrl` → `/feed {message: text}`
- Pass `sourceUrl` only for remix drafts (origin === 'remix'); Hub drafts pass undefined.

### 4. Review screen ([postId].tsx)
- **Source banner** (remix only): "Sharing from [original] · link included" + tappable permalink (opens via `Linking.openURL`).
- **Shared media picker**: Gallery + Camera buttons (reuse Compose helpers), `validateMedia`, opt-in/empty default. Uploads to public `draft-media` bucket. Writes resulting URLs to **every** target via `draft-targets` `update` action (extended to accept `media`).
- When media present, show note: "Your media will show; the source link moves into your caption."

### 5. draft-targets `update` action + RPC
- **Migration `0014_update_draft_target_media.sql`**: redefine `update_draft_target(p_id, p_text, p_enc_key, p_media jsonb default null)`; when `p_media is not null`, also `set media = p_media`. Backward compatible (text-only calls still work).
- **draft-targets**: `update` action passes `p_media: body.media ?? null`.

### 6. Refactor — shared media hook
- Extract Compose's `toMediaAssets` / `pickMedia` / `captureMedia` / `uploadMedia` into `app/src/features/media/useMediaPicker.ts` (or similar). Compose and Review both consume it. DRY.

## Data flow (remix)
scrape/poll → `source_posts{permalink, media}` → generate-variations → `drafts{origin:remix, source_post_id}` + `draft_targets{text, media:[]}` → Review (edit text, optionally add media → bucket URLs onto targets) → publish (join permalink; link-card or native+appended-url) → `publications{text, provider, handle}` (no media; unchanged).

## Constraints
- No secrets in app bundle; encryption key + tokens server-only. **Never** change `CONNECTION_ENC_KEY`.
- Migrations applied via Management API.
- Branch `feat/onboarding-fix-and-adaptive-nav`.
- Read `app/AGENTS.md` (Expo v56 docs) before native code.

## Out of scope
- Re-hosting scraped media for full-fidelity native remix (future).
- Non-Facebook providers (only FB wired).
- Per-target distinct media (media is shared across targets, matching Compose).
