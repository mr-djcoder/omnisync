# Instagram Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline — changes are coupled across shared/edge/app). Steps use `- [ ]`.

**Goal:** Add Instagram as a publish target (image / Reel / carousel) reusing the Meta Graph wiring; skip IG when a target has no media.

**Architecture:** Auto-discover IG Business accounts during the existing Facebook OAuth (Page token reused). Pure media rules + container-payload builders in `packages/shared` (unit-tested); the `publish` edge function runs the two-step IG container flow. Review surfaces a `skipped` per-channel outcome.

**Tech Stack:** Supabase Edge Functions (Deno), FB Graph v21.0 IG Content Publishing API, React Native/Expo, Vitest.

---

## Task 1: Instagram media rules

**Files:** Modify `packages/shared/src/media.ts`; Test `packages/shared/src/media.test.ts`

- [ ] **Step 1 — test (add to media.test.ts):**
```ts
it('instagram: rejects PNG images (JPEG only)', () => {
  expect(validateMedia([{ uri: 'a.png', kind: 'image' }], ['instagram'])).toMatch(/format .png/i);
});
it('instagram: allows JPEG', () => {
  expect(validateMedia([{ uri: 'a.jpg', kind: 'image' }], ['instagram'])).toBeNull();
});
it('facebook+instagram: enforces tightest (PNG rejected)', () => {
  expect(validateMedia([{ uri: 'a.png', kind: 'image' }], ['facebook', 'instagram'])).toMatch(/png/i);
});
```
- [ ] **Step 2** — run `pnpm -C packages/shared test`, expect FAIL (no instagram rule).
- [ ] **Step 3 — add to `MEDIA_RULES`:**
```ts
  instagram: {
    image: { exts: ['jpg', 'jpeg'], maxBytes: 8 * MB, maxCount: 10 },
    video: { exts: ['mp4', 'mov'], maxBytes: 100 * MB, maxCount: 10, maxDurationSec: 15 * 60 },
    allowMixingImageVideo: true,
  },
```
- [ ] **Step 4** — run tests, expect PASS.
- [ ] **Step 5** — commit `feat(shared): instagram media rules`.

## Task 2: Instagram container-payload builders (pure)

**Files:** Create `packages/shared/src/instagram.ts`; Test `packages/shared/src/instagram.test.ts`; Modify `packages/shared/src/index.ts` (export).

- [ ] **Step 1 — test (instagram.test.ts):**
```ts
import { describe, it, expect } from 'vitest';
import { igItemPayload, igPublishKind } from './instagram';

describe('igItemPayload', () => {
  it('image → image_url', () => {
    expect(igItemPayload('https://x/a.jpg', false)).toEqual({ image_url: 'https://x/a.jpg' });
  });
  it('video → REELS media_type + video_url', () => {
    expect(igItemPayload('https://x/a.mp4', false)).toEqual({ media_type: 'REELS', video_url: 'https://x/a.mp4' });
  });
  it('carousel child sets is_carousel_item and drops REELS', () => {
    expect(igItemPayload('https://x/a.mp4', true)).toEqual({ media_type: 'VIDEO', video_url: 'https://x/a.mp4', is_carousel_item: true });
    expect(igItemPayload('https://x/a.jpg', true)).toEqual({ image_url: 'https://x/a.jpg', is_carousel_item: true });
  });
});
describe('igPublishKind', () => {
  it('classifies', () => {
    expect(igPublishKind([])).toBe('none');
    expect(igPublishKind(['a.jpg'])).toBe('single');
    expect(igPublishKind(['a.jpg', 'b.jpg'])).toBe('carousel');
  });
});
```
- [ ] **Step 2** — run tests, expect FAIL.
- [ ] **Step 3 — implement instagram.ts:**
```ts
// Pure builders for the Instagram Content Publishing API container payloads.
function isVideo(u: string): boolean {
  return /\.(mp4|mov|m4v)(\?|$)/i.test(u);
}
// Body for a single media container. Carousel children use media_type VIDEO
// (not REELS) and set is_carousel_item; standalone videos are REELS.
export function igItemPayload(url: string, isCarouselItem: boolean): Record<string, unknown> {
  if (isVideo(url)) {
    return isCarouselItem
      ? { media_type: 'VIDEO', video_url: url, is_carousel_item: true }
      : { media_type: 'REELS', video_url: url };
  }
  return isCarouselItem ? { image_url: url, is_carousel_item: true } : { image_url: url };
}
export function igPublishKind(media: string[]): 'none' | 'single' | 'carousel' {
  if (media.length === 0) return 'none';
  return media.length === 1 ? 'single' : 'carousel';
}
export { isVideo as igIsVideoUrl };
```
- [ ] **Step 4** — add `export * from './instagram';` to `index.ts`; run tests, expect PASS.
- [ ] **Step 5** — commit `feat(shared): instagram container-payload builders`.

## Task 3: OAuth — request IG scopes (app)

**Files:** Modify `app/src/features/connections/connect.ts` (the `connectFacebook` scope list).

- [ ] **Step 1** — locate the FB OAuth authorize URL scope param in `connectFacebook`.
- [ ] **Step 2** — add `instagram_basic,instagram_content_publish` to the existing comma/`%2C` scope list (alongside `pages_show_list,pages_read_user_content,pages_manage_posts`).
- [ ] **Step 3** — `pnpm -C app exec tsc --noEmit`, expect clean.
- [ ] **Step 4** — commit `feat(connect): request instagram publishing scopes`.

## Task 4: OAuth exchange — discover IG accounts

**Files:** Modify `supabase/functions/oauth-exchange/index.ts`.

- [ ] **Step 1** — after the existing per-page `upsert_connection` loop, for each page fetch the linked IG account:
```ts
  for (const page of pages) {
    // (existing facebook upsert stays)
    const igRes = await fetch(
      `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account{id,username}` +
        `&access_token=${encodeURIComponent(page.access_token)}`,
    );
    const igJson = await igRes.json().catch(() => ({}));
    const ig = igJson.instagram_business_account as { id?: string; username?: string } | undefined;
    if (ig?.id) {
      await admin.rpc('upsert_connection', {
        p_user_id: userId,
        p_provider: 'instagram',
        p_external_id: ig.id,
        p_handle: ig.username ?? ig.id,
        p_scopes: ['instagram_basic', 'instagram_content_publish'],
        p_token: page.access_token,
        p_enc_key: encKey,
      });
    }
  }
```
- [ ] **Step 2** — deploy `supabase functions deploy oauth-exchange --project-ref chyuinnqaqtgirgxokgm`.
- [ ] **Step 3** — commit `feat(oauth): discover linked Instagram accounts`.

## Task 5: Publish to Instagram (edge)

**Files:** Modify `supabase/functions/publish/index.ts`.

- [ ] **Step 1 — add inline IG helpers + publisher** (Deno can't import workspace pkg; mirror the pure builders):
```ts
const IG_POLL_MAX = 10; // ~ up to ~20s for video container processing
function igItemPayload(url: string, child: boolean): Record<string, unknown> {
  if (isVideoUrl(url)) {
    return child ? { media_type: 'VIDEO', video_url: url, is_carousel_item: true } : { media_type: 'REELS', video_url: url };
  }
  return child ? { image_url: url, is_carousel_item: true } : { image_url: url };
}
async function igCreateContainer(ig: string, token: string, body: Record<string, unknown>): Promise<FbResult> {
  return await fbPost(`${GRAPH}/${ig}/media`, { ...body, access_token: token });
}
async function igWaitReady(ig: string, token: string, containerId: string): Promise<FbResult> {
  for (let i = 0; i < IG_POLL_MAX; i++) {
    const res = await fetch(`${GRAPH}/${containerId}?fields=status_code&access_token=${encodeURIComponent(token)}`);
    const j = await res.json().catch(() => ({}));
    if (j.status_code === 'FINISHED') return { ok: true, id: containerId };
    if (j.status_code === 'ERROR' || j.status_code === 'EXPIRED') return { ok: false, id: null, error: `container ${j.status_code}` };
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { ok: false, id: null, error: 'container processing timed out' };
}
async function publishToInstagram(ig: string, token: string, caption: string, media: string[]): Promise<FbResult & { skipped?: boolean }> {
  try {
    if (media.length === 0) return { ok: false, id: null, skipped: true, error: 'Instagram needs a photo or video.' };
    let creationId: string;
    if (media.length === 1) {
      const c = await igCreateContainer(ig, token, { ...igItemPayload(media[0], false), caption });
      if (!c.ok || !c.id) return c;
      if (isVideoUrl(media[0])) { const w = await igWaitReady(ig, token, c.id); if (!w.ok) return w; }
      creationId = c.id;
    } else {
      const children: string[] = [];
      for (const m of media) {
        const c = await igCreateContainer(ig, token, igItemPayload(m, true));
        if (!c.ok || !c.id) return c;
        if (isVideoUrl(m)) { const w = await igWaitReady(ig, token, c.id); if (!w.ok) return w; }
        children.push(c.id);
      }
      const carousel = await igCreateContainer(ig, token, { media_type: 'CAROUSEL', children, caption });
      if (!carousel.ok || !carousel.id) return carousel;
      creationId = carousel.id;
    }
    return await fbPost(`${GRAPH}/${ig}/media_publish`, { creation_id: creationId, access_token: token });
  } catch (e) {
    return { ok: false, id: null, error: String(e) };
  }
}
```
- [ ] **Step 2 — dispatch by provider** in the target loop:
```ts
    } else if (conn?.provider === 'instagram') {
      const { data: token } = await admin.rpc('get_connection_token', { p_connection_id: t.connection_id, p_enc_key: encKey });
      if (!token) { error = 'No access token for this account.'; }
      else {
        const r = await publishToInstagram(conn.external_id, token, t.text, t.media ?? []);
        if (r.ok) { status = 'success'; externalId = r.id; }
        else if (r.skipped) { status = 'skipped'; error = r.error; }
        else { error = r.error; }
      }
    }
```
- [ ] **Step 3 — treat skipped as non-fatal** in the publications insert (status already carries `'skipped'`); no other change (snapshot stores provider='instagram').
- [ ] **Step 4** — deploy `supabase functions deploy publish --project-ref chyuinnqaqtgirgxokgm`.
- [ ] **Step 5** — commit `feat(publish): Instagram image/Reel/carousel publishing`.

## Task 6: Review — show `skipped` outcome

**Files:** Modify `app/app/(app)/review/[postId].tsx`.

- [ ] **Step 1** — in the publish-results panel, treat `skipped` distinctly: neutral icon (`remove-circle` / tertiary) + reason; and in `handlePublish`, route to History when every non-skipped result succeeded (a skip is not a failure):
```ts
    const blocking = results.filter((r) => r.status !== 'success' && r.status !== 'skipped');
    const anySkipped = results.some((r) => r.status === 'skipped');
    if (blocking.length === 0 && !anySkipped) { router.push('/(app)/history'); return; }
    setPublishResults(results);
```
- [ ] **Step 2** — render: success ✓ (primary), failed ✗ (error), skipped ⊘ (tertiary, with reason). Header: all-success → "Published"; any blocking failure → "Published with some failures"; only skips → "Published (some channels skipped)".
- [ ] **Step 3** — `pnpm -C app exec tsc --noEmit` + eslint, expect clean.
- [ ] **Step 4** — commit `feat(review): show skipped channels in publish results`.

## Task 7: Connect — Instagram note

**Files:** Modify `app/app/(app)/connect.tsx`.

- [ ] **Step 1** — in the "Add a channel to publish to" list, for `instagram` show a non-interactive note "Connects automatically with its linked Facebook Page" instead of a "Coming soon"/connect button. Keep the connected-IG rows rendering via the existing connections map.
- [ ] **Step 2** — `pnpm -C app exec tsc --noEmit`, expect clean.
- [ ] **Step 3** — commit `feat(connect): explain Instagram auto-connect`.

## Task 8: Verify (no build — user gates the APK)

- [ ] `pnpm -C packages/shared test` (all pass, incl. new IG tests).
- [ ] `pnpm -C app exec tsc --noEmit` + eslint clean.
- [ ] Confirm functions deployed (oauth-exchange, publish).
- [ ] Push branch. (APK build deferred until user asks.)

---

## Self-Review
- **Spec coverage:** connection/discovery (T3,T4) ✓; media rules (T1) ✓; publish container flow incl. skip/video-poll/carousel (T2,T5) ✓; Review skipped UI (T6) ✓; Connect note (T7) ✓; tests (T1,T2) ✓. Reels default ✓. Skip-when-no-media ✓.
- **Types:** `FbResult` reused; `publishToInstagram` returns `FbResult & {skipped?}`; status string adds `'skipped'`. `igItemPayload` signature identical in shared (T2) and inlined Deno mirror (T5).
- **No placeholders:** all steps carry code/commands.
- **Note:** `isVideoUrl` already exists in publish/index.ts (added earlier) — reused in T5, not redefined.
