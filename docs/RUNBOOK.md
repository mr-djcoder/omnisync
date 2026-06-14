# OmniSync — Setup & Deploy Runbook

The app + backend code is complete through Phase 6 and CI-green. This runbook lists the
**live wiring** still needed (credentials, deploys, dev build). Nothing here is code — it's
configuration the operator performs.

> **Secret custody (hard rule, spec §6):** the app holds only the Supabase session + public
> values. App secrets — `SUPABASE_SERVICE_ROLE_KEY`, `META_APP_SECRET`, `GEMINI_API_KEY`,
> `CONNECTION_ENC_KEY`, `META_WEBHOOK_VERIFY_TOKEN` — live **only** in Edge Function secrets.
> Anything in the app must use the `EXPO_PUBLIC_` prefix and be genuinely public.

## 1. App environment (`app/.env`, gitignored)

```
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>          # public, RLS-gated
EXPO_PUBLIC_SENTRY_DSN=<dsn>                       # optional
EXPO_PUBLIC_META_APP_ID=<facebook app id>          # public app id only
```

## 2. Supabase

**Apply migrations** (in order `0001`→`0008`):
```
npx supabase link --project-ref <ref>
npx supabase db push
```
Migrations: profiles + RLS, profiles trigger, connections/master_source/poll_state,
upsert_connection RPC, posts/drafts/draft_targets/publications/webhook_events, token RPC,
poll cron template, draft RPCs, push_tokens.

**Enable extensions** (Dashboard → Database → Extensions): `pgcrypto`, `pg_cron`, `pg_net`.

**Deploy Edge Functions:**
```
npx supabase functions deploy auth-email-lookup
npx supabase functions deploy oauth-exchange
npx supabase functions deploy poll-sources
npx supabase functions deploy generate-variations
npx supabase functions deploy draft-targets
npx supabase functions deploy publish
npx supabase functions deploy meta-webhook
```

**Set function secrets** (server-only):
```
npx supabase secrets set \
  CONNECTION_ENC_KEY=<random 32+ char key> \
  META_APP_ID=<fb app id> \
  META_APP_SECRET=<fb app secret> \
  GEMINI_API_KEY=<google ai key> \
  META_WEBHOOK_VERIFY_TOKEN=<random token>
```
(`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)

**Finalize the cron** (`supabase/migrations/0006_poll_cron.sql`): replace `<PROJECT_REF>` and
supply the service-role key via a Vault secret, then re-run that statement (it's a template).

## 3. Third-party apps

- **Google OAuth** (app login): OAuth client (Web) with redirect
  `https://<ref>.supabase.co/auth/v1/callback`; enable the Google provider in Supabase Auth;
  add `omnisync://` + `omnisync://*` to Auth → URL Configuration → Redirect URLs. *(Done.)*
- **Meta app** (channels + publish): Facebook Login; scopes `pages_show_list`,
  `pages_read_user_content`, `pages_manage_posts`; redirect `omnisync://`; for the webhook
  fast-path, subscribe the Page webhook to the `meta-webhook` URL with the verify token.
- **Gemini**: a Google AI Studio API key → `GEMINI_API_KEY` secret.

## 4. Run the app (dev build — required; Expo Go won't work)

`expo-secure-store` + OAuth + push need a native dev build.
```
pnpm install                       # materializes @omnisync/shared workspace symlink
pnpm --filter @omnisync/app exec expo install expo-notifications   # for push (optional)
# Windows: JAVA_HOME = Android Studio JBR (JDK 17), ANDROID_HOME = SDK; an emulator running
cd app && npx expo run:android
```

## 5. End-to-end smoke test

1. Welcome → Google or email signup → onboarding.
2. Connect → **Facebook** → pick a Page as Master Source → Success → Home.
3. (Cron polls the Page, or hit `poll-sources` manually) → posts appear in the **Home feed**.
4. **Remix** a post → Gemini fills per-platform variations → edit → **Publish** → check the
   target Page + the **History** tab + Supabase `publications`.
5. **Drafts → Create** → standalone compose → pick targets → save/publish.

## 6. Known follow-ups (tracked in PRs #10/#12/#14/#16)

- `X-Hub-Signature-256` verification on `meta-webhook`.
- Actual Expo push send from `generate-variations`/`publish` (registration + table exist).
- Facebook photo/video 2-step container publish (v1 posts text to the feed).
- `auth-email-lookup` uses `listUsers()` first-page scan — swap for an indexed lookup at scale.
- Non-Facebook provider connectors (Instagram/TikTok/Snapchat) — wired as "Coming soon".

## Phase map (all merged to `main`)

| Phase | PR | Summary |
|---|---|---|
| 1 Scaffold | #2 | pnpm workspace, Expo+NativeWind, shared/zod, Sentry, CI |
| 2 Auth | #4 | Supabase Auth, Google + email, profiles, guard |
| 3 Channels & Source | #10 | connections, master source, OAuth exchange, onboarding |
| 4 Ingestion | #12 | poll-sources, source_posts, pg_cron |
| 5 Generation & Review | #14 | Gemini variations, Review/Compose/Drafts/Feed |
| 6 Publish & History | #16 | publish, History, push tokens, webhook |
