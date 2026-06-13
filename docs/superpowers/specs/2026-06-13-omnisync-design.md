# OmniSync — Design Spec

**Date:** 2026-06-13
**Status:** Draft for review
**Source of truth:** `OmniSync_Product_Specification_v2.docx` (product spec) + 10 prototype screens

---

## 1. Product summary

OmniSync is an automated cross-platform publishing engine for creators. The user
designates one **Master Source** — specifically a **Facebook Page** — as their single
source of truth. When they post natively to that Page, Meta fires a webhook to OmniSync,
which parses the post, uses an LLM to rewrite it into per-platform variations, and (after
the user reviews/edits) publishes it to their connected destination channels
(Instagram, TikTok, Snapchat, other Facebook groups).

The product is mobile-first: an Android + iOS app built with React Native (Expo).

---

## 2. Architecture

No standalone backend server. The backend is **Supabase**: Auth, Postgres
(with `pgcrypto` + Row-Level Security), and **Edge Functions** (Deno/TypeScript).

```
User posts natively to Master Facebook Page
        │  Meta fires webhook (real-time, zero-latency — replaces polling)
        ▼
Supabase Edge Function: meta-webhook   (verifies Meta signature, dedupes retries)
        │  parse payload variation: text-only | single image | video → CDN asset IDs
        ▼
Edge Function: generate-variations → Gemini → per-platform JSON (TikTok / IG / Snapchat)
        │  persist source_post + drafts (encrypted) in Postgres, RLS-scoped to the user
        ▼
Push notification (Expo Notifications) → "drafts ready for approval"
        ▼
User opens Review Canvas → edits text / manages media → "Publish to Channels Now"
        ▼
Edge Function: publish → Graph API 2-step container model (pages_manage_posts)
        ▼
publications / History
```

### Stack (locked)

| Layer | Choice |
|---|---|
| Mobile | React Native + Expo (TypeScript), Expo Router, EAS |
| Styling | NativeWind (Tailwind) — M3 token theme ported from prototypes |
| Data/server state | TanStack Query over a typed Supabase client |
| Backend | Supabase: Auth, Postgres + `pgcrypto` + RLS, Edge Functions (Deno/TS) |
| App auth | Google OAuth 2.0 |
| Channel auth | Meta OAuth via `expo-auth-session` |
| AI engine | Google Gemini via `google-genai`, behind an `AIProvider` interface (swappable) |
| Telemetry | Sentry (React Native) |
| Shared code | `packages/shared` — TS types + zod schemas used by app and functions |

> Decisions that overrode the earlier brainstorm Q&A, per the product spec:
> backend is **Supabase Edge Functions** (not NestJS); AI engine is **Gemini** (not Claude).
> Gemini is used behind a provider interface; a current Gemini model is used rather than
> the dated 1.5 Flash named in the spec.

---

## 3. Repo layout

```
omnisync/
├─ app/                          # Expo app (React Native, TS, Expo Router)
│  ├─ app/                       # file-based routes
│  │  ├─ (auth)/welcome.tsx
│  │  ├─ (onboarding)/connect.tsx · master-source.tsx · success.tsx
│  │  ├─ (tabs)/index.tsx        # Home / Source Feed (Hub)
│  │  ├─ (tabs)/drafts.tsx · history.tsx · connect.tsx · profile.tsx
│  │  └─ review/[postId].tsx     # Review Canvas
│  ├─ src/
│  │  ├─ components/             # GlassCard, ChannelRow, VariationEditor, MediaStrip, …
│  │  ├─ features/               # auth, connections, drafts, publish
│  │  ├─ lib/                    # supabase client, auth, query hooks
│  │  └─ theme/                  # M3 tokens → NativeWind
│  ├─ app.config.ts · tailwind.config.js · eas.json
├─ supabase/
│  ├─ functions/
│  │  ├─ meta-webhook/           # GET verify + POST ingest (signature-checked, idempotent)
│  │  ├─ generate-variations/    # Gemini per-platform JSON generation
│  │  └─ publish/                # Graph API 2-step container publish
│  ├─ migrations/                # SQL: tables, pgcrypto, RLS policies
│  └─ config.toml
├─ packages/shared/              # TS types + zod schemas (app ⇄ functions)
└─ docs/superpowers/specs/
```

Workspace managed with pnpm. TypeScript strict throughout.

---

## 4. Data model

Postgres. Every table has Row-Level Security with policies scoped to `auth.uid()`.
Secrets (Meta access tokens, draft content) are encrypted at rest using `pgcrypto`.

| Table | Purpose | Sensitive fields |
|---|---|---|
| `profiles` | 1:1 with `auth.users` | — |
| `social_connections` | a connected provider account/page: provider, external id, scopes, status | **access token (encrypted)** |
| `master_source` | which `social_connections` row is the active Master FB Page | — |
| `source_posts` | ingested FB post: fb_post_id, type (text/image/video), text, media asset ids | — |
| `drafts` | per target platform: generated text, media, status (pending/edited/published) | **generated text (encrypted)** |
| `publications` | history: draft → platform, external post id, published_at, result | — |
| `webhook_events` | raw Meta payload + idempotency key (dedupe Meta retries) | — |

---

## 5. Edge Functions

- **`meta-webhook`** — `GET` handles Meta's verification challenge; `POST` verifies the
  `X-Hub-Signature-256` HMAC, writes a `webhook_events` row keyed for idempotency, parses
  the payload variation (text / single image / video → asset IDs), creates a `source_posts`
  row, and triggers variation generation.
- **`generate-variations`** — takes parsed source text, calls Gemini through the
  `AIProvider` interface, produces validated per-platform JSON, writes `drafts`
  (encrypted). Sends the push notification.
- **`publish`** — for approved drafts, publishes to each destination via the Graph API
  2-step container model (and per-platform publishers), records `publications`.

---

## 6. Cross-cutting concerns

- **Design system.** Port the prototype Tailwind config into NativeWind: primary
  `#ddb7ff` (electric purple), secondary `#4cd7f6` (cyan), Inter type scale, Material 3
  surface tokens, glass cards. Prototypes map ~1:1 to NativeWind classes.
- **Integration abstraction.** `AIProvider` (Gemini today) and a `Publisher` per platform
  (Instagram, TikTok, Snapchat, Facebook) sit behind interfaces so providers can be added
  or swapped without touching call sites.
- **Security.** pgcrypto encryption for tokens + drafts; RLS on every table; Meta webhook
  signature verification; OAuth tokens never returned to the client.
- **Error handling.** Webhook ingestion is idempotent and logs raw payloads for replay.
  AI output is schema-validated (zod) before persistence; publish failures are recorded
  per-channel so partial publishes are visible and retryable.
- **Observability.** Sentry in the app and (where supported) in functions.

---

## 7. Build phasing

Each phase becomes its own implementation plan.

1. **Scaffold** — pnpm workspace, Expo app shell, Supabase project, theme tokens, CI/lint.
2. **Auth** — Google login, `profiles`, session handling.
3. **Channels** — Meta OAuth, connect channels, choose Master Source.
4. **Ingestion** — `meta-webhook`, `source_posts` + `drafts` tables, pgcrypto + RLS.
5. **Generation + Review** — Gemini variations, Review Canvas editor, media strip.
6. **Publish** — publish pipeline, `publications`/History, push notifications, Sentry.

The immediate target (this request) is **Phase 1 scaffold**; phases 2–6 are the roadmap.

---

## 8. Open items

- Final Gemini model id (current model, not 1.5 Flash) — confirm at implementation time.
- Per-platform publish APIs beyond Meta (TikTok, Snapchat) — confirm available scopes and
  whether all four destinations ship in v1 or are phased.
- Media handling: where reposted media is staged (Supabase Storage vs. direct CDN asset
  reuse) — decide during Phase 4/5.
