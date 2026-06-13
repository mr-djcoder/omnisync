# OmniSync — Design Spec

**Date:** 2026-06-13
**Status:** Draft for review
**Source of truth:** `OmniSync_Product_Specification_v2.docx` (product spec) + 10 prototype screens

---

## 1. Product summary

OmniSync is an automated cross-platform publishing engine for creators. The user
designates one **Master Source** — a social account they want to monitor, which they may
**own or merely have access to** (e.g. a public business account). OmniSync watches that
source for new posts (polling by default; see §2a), parses each post, uses an LLM to
rewrite it into per-platform variations, and — after the user reviews/edits — publishes it
to their connected destination channels (Instagram, TikTok, Snapchat, Facebook, and more).

The product is mobile-first: an Android + iOS app built with React Native (Expo).

---

## 1a. User flow & navigation

First launch (unauthenticated):

1. **Welcome / Auth** (`01-welcome-auth`). Two paths:
   - **Google** → Google OAuth sign-in → on success, continue to onboarding (new user) or
     Home (returning user).
   - **Email + password** → a dedicated **Sign-up screen** (see gap below): create
     username/email + password. The password field has a **show/hide toggle** so users can
     reveal what they type. On success, continue to onboarding.
2. **Onboarding** (new users only), in order:
   `02-connect-networks` → `03-master-source` → `04-onboarding-success`.
3. From success ("Go to Hub") the user lands on **Home / Source Feed** (`06-source-feed`),
   showing the **top 10 posts** from the Master Source. Each post has a **Remix** button.
4. **Remix** opens the **Review Canvas** (`05-review-canvas`) for that post: it shows the
   source post plus AI-pre-generated per-platform text. The user can **edit the text** and
   **add multiple images/videos**. They can **Save as Draft** → the item is stored and
   appears under **Drafts** (`09-drafts`); or publish directly.

Returning (authenticated) users skip onboarding and open directly on Home (`06`).

**Bottom navigation (5 tabs):** Home (`06`) · Drafts (`09`) · History (new) · Connect
(`07`) · Profile (`08`). **History** is a **read-only** list of the user's published items
(top 10), for review only — **no actions** can be taken from it.

**Create draft (standalone, no source).** The Drafts screen has a **Create** button that
opens a **Compose** screen — the same editor as the Review Canvas but with **no source
post**: the user authors content from scratch, adds multiple images/videos, and **broadcasts
to all configured destination platforms**. They can Save as Draft (stored in Drafts) or
publish. Compose reuses the Review Canvas route in a "new" mode (`review/new`).

**Screen → route map**

| Prototype | Route | Notes |
|---|---|---|
| `01-welcome-auth` | `(auth)/welcome` | Google + email entry points |
| *(none yet — gap)* | `(auth)/signup` | **New screen needed:** email/username + password, show/hide toggle |
| `02-connect-networks` | `(onboarding)/connect` | |
| `03-master-source` | `(onboarding)/master-source` | |
| `04-onboarding-success` | `(onboarding)/success` | "Go to Hub" → `(tabs)` |
| `06-source-feed` | `(tabs)/index` (Home) | top 10 source posts, Remix per card |
| `05-review-canvas` | `review/[postId]` | remix: edit AI text, add media, Save as Draft / Publish |
| `05` (new mode) | `review/new` | **Compose:** standalone post, no source, broadcast to all configured platforms |
| `09-drafts` | `(tabs)/drafts` | saved drafts + **Create** button → `review/new` |
| *(none yet — gap)* | `(tabs)/history` | **New screen needed:** read-only top-10 published items, no actions |
| `07-hub` | `(tabs)/connect` | channel config / sync map |
| `08-profile` | `(tabs)/profile` | |

> **Gaps (no prototype yet):** (1) a **Sign-up screen** and email/password **Login** screen —
> `01` offers only Google and a single passwordless email field; the email+password path needs
> a Sign-up screen (with show/hide password toggle) plus login for returning users. (2) a
> **History screen** — read-only top-10 published items, no actions. Auth backend: Supabase
> Auth (Google provider + email/password).

---

## 2. Architecture

No standalone backend server. The backend is **Supabase**: Auth, Postgres
(with `pgcrypto` + Row-Level Security), and **Edge Functions** (Deno/TypeScript).

Ingestion is **pluggable** (see §2a). The default path is **scheduled polling**, which
works whether or not the user owns the source account. A **webhook fast-path** is an
optional optimization for sources the user administers. Real-time delivery is therefore
**not a requirement** — near-real-time polling is the baseline.

```
Source account publishes (user may or may not own it)
        │
        ├─ Default: scheduled poll (pg_cron → poll-sources, every N min)
        │     SourceConnector reads new posts via official API or scrape
        │
        └─ Optional fast-path: Meta webhook (only if user administers the Page)
                              │
                              ▼
        New post detected → persist source_post (RLS-scoped, deduped)
        ▼
Edge Function: generate-variations → Gemini → per-platform JSON (TikTok / IG / Snapchat)
        │  persist drafts (encrypted) in Postgres
        ▼
Push notification (Expo Notifications) → "drafts ready for approval"
        ▼
User opens Review Canvas → edits text / manages media → "Publish to Channels Now"
        ▼
Edge Function: publish → per-platform Publisher (Graph API 2-step container, etc.)
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
| Channel auth | Meta OAuth via `expo-auth-session` (and per-platform OAuth where the owner grants access) |
| Ingestion | `SourceConnector` interface — polling (default) + optional webhook fast-path |
| AI engine | Google Gemini via `google-genai`, behind an `AIProvider` interface (swappable) |
| Telemetry | Sentry (React Native) |
| Shared code | `packages/shared` — TS types + zod schemas used by app and functions |

> Decisions that overrode the earlier brainstorm Q&A, per the product spec:
> backend is **Supabase Edge Functions** (not NestJS); AI engine is **Gemini** (not Claude).
> Gemini is used behind a provider interface; a current Gemini model is used rather than
> the dated 1.5 Flash named in the spec.
>
> Revised after review: the product spec assumed the user **owns/administers** the Master
> Facebook Page and ingests in real time via Meta webhooks. That assumption was relaxed —
> the user may only have *access to* (not ownership of) the source, possibly a public
> business account. Ingestion is now polling-first and ownership-agnostic; webhooks are an
> optional fast-path. See §2a.

---

## 2a. Ingestion model

Ingestion sits behind a **`SourceConnector`** interface so each source type plugs in
independently. A connector exposes: identify the source, fetch posts since a cursor,
and (optionally) register/handle a webhook.

**Trigger — polling by default.** A `pg_cron` schedule invokes the `poll-sources` Edge
Function every N minutes. For each active source it runs the connector, compares against a
stored cursor (`source_poll_state`), and emits any new posts. Webhooks, where available
for an owned Page, short-circuit the wait but are never required.

**Read method — official API primary, scraping as alternative.** Two connector
implementations per applicable platform, chosen per source:

1. **Official-API connector (preferred).** Permission/role-based, ToS-compliant. Works for
   a non-owned source **when the owner formalizes access** — grants the user a Meta Page
   role, or OAuths the app. Per-platform reach:
   - YouTube Data API — any public channel, API key only.
   - Meta Pages / Instagram Graph — requires a Page role + App Review for production scopes.
   - X API v2 — public timelines on a paid tier.
   - Medium — public RSS feed.
   - TikTok — owner OAuth (Login Kit); non-owned read not generally available.
2. **Scrape connector (alternative / fallback).** Reads public content with no ownership or
   grant. Broad coverage, but **violates platform ToS, is brittle to markup changes, and
   risks IP blocks.** Used only where the official path can't reach a source, as an explicit,
   per-platform opt-in. See the legal note in §6.

> Credential sharing (logging in as the source owner) is **out of scope** — it breaks under
> 2FA, risks flagging the source account, and generally violates ToS. The sanctioned
> equivalent is a Meta Page role or an OAuth grant from the owner.

---

## 3. Repo layout

```
omnisync/
├─ app/                          # Expo app (React Native, TS, Expo Router)
│  ├─ app/                       # file-based routes
│  │  ├─ (auth)/welcome.tsx · signup.tsx · login.tsx
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
│  │  ├─ poll-sources/           # scheduled (pg_cron): run connectors, detect new posts
│  │  ├─ meta-webhook/           # optional fast-path for owned Pages (signature-checked)
│  │  ├─ _connectors/            # SourceConnector impls: youtube, meta, x, medium, scrape/*
│  │  ├─ generate-variations/    # Gemini per-platform JSON generation
│  │  └─ publish/                # per-platform Publisher (Graph API 2-step container, …)
│  ├─ migrations/                # SQL: tables, pgcrypto, RLS, pg_cron schedule
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
| `social_connections` | a connected provider account/page: provider, external id, scopes, status, `is_owned`, `connector_type` (owned_api / external_api / scrape) | **access token (encrypted, nullable — absent for scrape sources)** |
| `master_source` | which `social_connections` row is the active source to monitor (owned or not) | — |
| `source_poll_state` | per source: last-seen cursor / timestamp / post-id for polling dedupe | — |
| `source_posts` | ingested post: external_post_id, type (text/image/video), text, media asset refs | — |
| `drafts` | a draft: nullable `source_post_id` (null = standalone compose), `origin` (remix / original), per-platform text + media, status (pending/edited/published) | **generated/authored text (encrypted)** |
| `publications` | history: draft → platform, external post id, published_at, result | — |
| `webhook_events` | raw webhook payload + idempotency key (fast-path only; dedupe retries) | — |

---

## 5. Edge Functions

- **`poll-sources`** *(default ingestion)* — invoked on a `pg_cron` schedule. For each
  active `master_source`, runs its `SourceConnector` (official-API or scrape impl), compares
  results to `source_poll_state`, creates `source_posts` for anything new, advances the
  cursor, and triggers variation generation. Idempotent by external_post_id.
- **`meta-webhook`** *(optional fast-path, owned Pages only)* — `GET` handles Meta's
  verification challenge; `POST` verifies the `X-Hub-Signature-256` HMAC, writes a
  `webhook_events` row for idempotency, parses the payload (text / image / video → asset
  IDs), creates a `source_posts` row, and triggers variation generation — same downstream
  path as the poller.
- **`generate-variations`** — takes parsed source text, calls Gemini through the
  `AIProvider` interface, produces validated per-platform JSON, writes `drafts`
  (encrypted). Sends the push notification.
- **`publish`** — for approved drafts, publishes to each destination through the
  per-platform `Publisher` (Graph API 2-step container model, etc.), records `publications`.

---

## 6. Cross-cutting concerns

- **Design system.** Port the prototype Tailwind config into NativeWind: primary
  `#ddb7ff` (electric purple), secondary `#4cd7f6` (cyan), Inter type scale, Material 3
  surface tokens, glass cards. Prototypes map ~1:1 to NativeWind classes.
- **Integration abstraction.** Three interfaces so implementations swap without touching
  call sites: `SourceConnector` (read posts — official-API or scrape, per platform),
  `AIProvider` (Gemini today), and `Publisher` per destination (Instagram, TikTok,
  Snapchat, Facebook).
- **Security.** pgcrypto encryption for tokens + drafts; RLS on every table; Meta webhook
  signature verification; OAuth tokens never returned to the client.
- **Legal / ToS.** The scrape connector violates the source platform's Terms of Service and
  is brittle (markup changes, IP blocks). It is an explicit per-platform opt-in, isolated in
  `_connectors/scrape/`, and never the default where an official API can reach the source.
  Credential sharing / logging in as the source owner is out of scope. This is a product risk
  to accept knowingly, not a technical default.
- **Error handling.** Ingestion (poll and webhook) is idempotent by external_post_id and
  logs raw payloads/responses for replay. AI output is schema-validated (zod) before
  persistence; publish failures are recorded per-channel so partial publishes are visible
  and retryable.
- **Observability.** Sentry in the app and (where supported) in functions.

---

## 7. Build phasing

Each phase becomes its own implementation plan.

1. **Scaffold** — pnpm workspace, Expo app shell, Supabase project, theme tokens, CI/lint.
2. **Auth** — Supabase Auth: Google provider + email/password; **Sign-up** and **Login**
   screens (password show/hide toggle); `profiles`; session handling; new-user vs.
   returning-user routing (onboarding vs. straight to Home).
3. **Channels & Source** — connect destination channels; pick a Master Source (owned or
   not); record `connector_type` / `is_owned`; per-platform OAuth where the owner grants it.
4. **Ingestion** — `SourceConnector` interface + first connectors, `poll-sources` +
   `pg_cron`, `source_posts` / `source_poll_state` / `drafts` tables, pgcrypto + RLS.
   (Meta webhook fast-path optional, can land here or later.)
5. **Generation + Review** — Gemini variations, Review Canvas editor, media strip.
6. **Publish** — publish pipeline, `publications`/History, push notifications, Sentry.

The immediate target (this request) is **Phase 1 scaffold**; phases 2–6 are the roadmap.

---

## 8. Open items

- Final Gemini model id (current model, not 1.5 Flash) — confirm at implementation time.
- **Source platforms for v1** — which sources to support first, and per platform whether the
  read method is official-API or scrape (drives connector work + App Review timelines).
- **Polling interval** — default `pg_cron` cadence (e.g. 5 min) vs. per-source override.
- **Scraping decision** — confirm willingness to ship the scrape connector for specific
  platforms given the ToS/reliability risk in §6.
- Per-platform publish APIs beyond Meta (TikTok, Snapchat) — confirm available scopes and
  whether all four destinations ship in v1 or are phased.
- Media handling: where reposted media is staged (Supabase Storage vs. direct CDN asset
  reuse) — decide during Phase 4/5.
