# Instagram Publishing — Design

**Goal:** Add Instagram as a **publish target** in OmniSync (broadcasts and remixes), reusing the existing Meta Graph wiring. Instagram is never a monitored master source.

**Key platform constraints:**
- IG Content Publishing API **requires media** (image or video) — there is no text-only IG post.
- IG captions are **not clickable** — the remix link-share approach does not apply.
- Publishing is a **two-step container flow** (create container → publish) on an **IG Business/Creator account linked to a Facebook Page**, using the **Page access token**.
- IG images must be **JPEG** (PNG/GIF/WebP rejected by the container API).

## Decisions (approved)
- **Scope:** publish target only.
- **Remix/Compose to IG with no user media:** **skip the IG target** with a clear message; FB/other channels still publish. IG posts only when the user attaches media.
- **Connection:** auto-discover IG via the existing Facebook OAuth (no separate IG button).
- **Video:** published as **Reels** (`media_type=REELS`).

## Components / changes

### 1. OAuth / connection (`oauth-exchange` + app connect)
- App `connectFacebook` requests added scopes: `instagram_basic`, `instagram_content_publish`.
- `oauth-exchange`: after upserting each Page connection, fetch
  `GET /{page-id}?fields=instagram_business_account{id,username}` (Page token).
  If an IG account exists, `upsert_connection` with `provider='instagram'`,
  `external_id=<ig-user-id>`, `handle=<ig username>`, `p_token=<page access token>`,
  scopes `['instagram_basic','instagram_content_publish']`.
- Return value extended to report IG accounts connected (optional; not required by UI).
- Existing FB-connected users must reconnect once to grant the new scopes.

### 2. Media rules (`packages/shared/src/media.ts`)
- Add `MEDIA_RULES.instagram`:
  - image: exts `['jpg','jpeg']`, maxBytes 8MB, maxCount 10.
  - video: exts `['mp4','mov']`, maxBytes 100MB (app cap), maxCount 10, maxDurationSec 15*60.
  - `allowMixingImageVideo: true` (carousels may mix).
- Multi-platform broadcasts already enforce the tightest rule across selected
  platforms (existing `validateMedia`/`mediaGuidelines`), so FB+IG → JPEG, etc.
- Caption length is enforced by platform on publish (not a blocker here).

### 3. Publish (`supabase/functions/publish/index.ts`)
- Add `publishToInstagram(igUserId, pageToken, caption, media[])`:
  - `media.length === 0` → return `{ ok:false, skipped:true, error:'Instagram needs a photo or video.' }`.
  - 1 image → `POST /{ig}/media {image_url, caption}` → `POST /{ig}/media_publish {creation_id}`.
  - 1 video → `POST /{ig}/media {media_type:'REELS', video_url, caption}` → poll
    `GET /{container}?fields=status_code` until `FINISHED` (bounded retries, ~Nx2s;
    `ERROR`/timeout → fail) → `media_publish`.
  - 2–10 items → per item `POST /{ig}/media {is_carousel_item:true, image_url|video_url}`
    (poll videos to FINISHED) → `POST /{ig}/media {media_type:'CAROUSEL', children:[ids], caption}`
    → `media_publish`.
- Dispatch by `conn.provider`: `'facebook'` → `publishToFacebook`; `'instagram'` →
  `publishToInstagram` (caption = target text; no source link, IG captions inert).
- `results[]` gains a `skipped` outcome; `status` stored as `'skipped'` (distinct from
  `success`/`failed`) so History/snapshot and the Review per-channel UI reflect it.

### 4. App UI
- Connect: IG connections render once discovered (existing `PROVIDER_ICON.instagram`).
  Add a note: "Instagram connects automatically with its linked Facebook Page."
  Keep Facebook as the connect action; no separate IG connect button.
- Compose/Review: IG appears as a selectable target automatically. The Review
  per-channel result panel (already built) shows IG `skipped` with its reason.
- `isWired('instagram')` stays effectively true for display, but IG has no
  standalone connect button (discovered via FB).

### 5. Review per-channel results
- Extend the result rendering to show a third state: **skipped** (e.g. neutral icon +
  reason) in addition to success/failed. A draft where IG is skipped but FB succeeds
  routes to History (skip is not a failure).

## Data flow
FB OAuth (with IG scopes) → per Page discover linked IG account → `social_connections`
(`provider='instagram'`, Page token) → appears as a target → Compose/remix → Review
(media required for IG; else skipped) → publish (container flow) → `publications`
snapshot (`provider='instagram'`, status success/failed/skipped).

## Error handling
- No linked IG account on a Page → simply no IG connection created (silent, expected).
- IG target with no media → `skipped` with reason (not a hard error).
- Container processing `ERROR`/timeout for video → `failed` with the IG error message.
- Missing/expired Page token → `failed` ("No access token for this account.").

## Testing
- Unit (`media.test.ts`): IG rules — JPEG-only images, carousel count, video duration;
  tightest-rule behaviour for FB+IG.
- Unit: a pure container-payload builder for IG (image/video/carousel shapes) so the
  request bodies are tested without network.
- Manual on device: connect FB account with a linked IG Business account; publish image,
  Reel, and carousel; verify skip-when-no-media.

## Out of scope
- IG as master/monitored source; IG Stories; auto re-host of source media; non-Meta providers.
