# OmniSync — Phase 1 Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the OmniSync monorepo skeleton — a runnable Expo app shell with the
ported design-system theme, a shared TypeScript package, a Supabase project with the first
migration, and green lint/typecheck/test/CI.

**Architecture:** pnpm workspace with three members: `app/` (Expo + React Native + Expo
Router + NativeWind), `packages/shared/` (TypeScript types + zod schemas), and `supabase/`
(Edge Functions later; migrations + config now). Pure-logic units (shared schemas, theme
tokens) are unit-tested with Vitest; the app is verified with `tsc --noEmit` and
`expo-doctor`. No product features yet — this phase only proves the toolchain.

**Tech Stack:** pnpm workspaces, TypeScript (strict), Expo SDK (latest) + Expo Router,
NativeWind v4 + Tailwind, Vitest, zod, Supabase CLI, ESLint + Prettier, GitHub Actions.

**Reference:** design spec `docs/superpowers/specs/2026-06-13-omnisync-design.md` (§3 repo
layout, §4 data model, §6 design system), prototypes in `docs/prototypes/`.

---

## Preconditions

- Node 20.x and pnpm 9.x installed (`node -v`, `pnpm -v`).
- Supabase CLI available (`npx supabase --version`).
- Work on a feature branch, not `main` (branch is protected; integrate via PR).
  Run once before starting: `git checkout -b phase1-scaffold` (or use a worktree).

---

## File Structure (created in this phase)

```
omnisync/
├─ package.json                     # workspace root scripts + devDeps
├─ pnpm-workspace.yaml              # workspace members
├─ .npmrc                           # node-linker=hoisted (Expo needs this with pnpm)
├─ .nvmrc                           # node version pin
├─ tsconfig.base.json               # shared strict TS config
├─ .gitignore                       # node/expo/supabase ignores
├─ .prettierrc.json
├─ eslint.config.mjs                # flat ESLint config
├─ .github/workflows/ci.yml         # lint + typecheck + test
├─ packages/shared/
│  ├─ package.json
│  ├─ tsconfig.json
│  ├─ vitest.config.ts
│  ├─ src/index.ts                  # re-exports
│  ├─ src/schemas.ts                # first zod schema (Profile)
│  └─ src/schemas.test.ts
├─ app/                             # created by create-expo-app
│  ├─ app/index.tsx                 # Welcome stub using theme tokens
│  ├─ theme/tokens.ts               # design tokens (TS source of truth)
│  ├─ theme/tokens.test.ts
│  ├─ tailwind.config.js            # NativeWind theme (consumes tokens)
│  ├─ global.css                    # tailwind directives
│  ├─ babel.config.js               # nativewind preset
│  ├─ metro.config.js               # nativewind metro
│  ├─ sentry.ts                     # Sentry init (no-op until DSN set)
│  ├─ .env.example                  # EXPO_PUBLIC_SENTRY_DSN
│  └─ tsconfig.json
└─ supabase/
   ├─ config.toml                   # from supabase init
   └─ migrations/0001_profiles.sql  # profiles table + RLS
```

---

## Task 1: Root workspace skeleton

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `.nvmrc`,
  `tsconfig.base.json`, `.gitignore`, `.prettierrc.json`

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "app"
  - "packages/*"
```

- [ ] **Step 2: Create `.npmrc`**

Expo's Metro bundler does not work with pnpm's symlinked `node_modules`; force a flat layout.

```
node-linker=hoisted
```

- [ ] **Step 3: Create `.nvmrc`**

```
20
```

- [ ] **Step 4: Create root `package.json`**

```json
{
  "name": "omnisync",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "pnpm -r --if-present typecheck",
    "test": "pnpm -r --if-present test"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^8.18.0",
    "@typescript-eslint/parser": "^8.18.0",
    "eslint": "^9.17.0",
    "prettier": "^3.4.2",
    "typescript": "^5.7.2"
  }
}
```

- [ ] **Step 5: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ESNext"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
dist/
.expo/
.expo-shared/
web-build/
*.log
.env
.env.*
!.env.example
.DS_Store
coverage/
supabase/.branches/
supabase/.temp/
```

- [ ] **Step 7: Create `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

- [ ] **Step 8: Install and verify**

Run: `pnpm install`
Expected: completes, creates `pnpm-lock.yaml`, no `app`/`packages` members yet (warns is fine).

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-workspace.yaml .npmrc .nvmrc tsconfig.base.json .gitignore .prettierrc.json pnpm-lock.yaml
git commit -m "chore: root pnpm workspace skeleton"
```

---

## Task 2: `packages/shared` with first zod schema (TDD)

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`,
  `packages/shared/vitest.config.ts`, `packages/shared/src/index.ts`,
  `packages/shared/src/schemas.ts`
- Test: `packages/shared/src/schemas.test.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@omnisync/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/shared/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globals: true, environment: 'node' },
});
```

- [ ] **Step 4: Write the failing test** — `packages/shared/src/schemas.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { ProfileSchema } from './schemas';

describe('ProfileSchema', () => {
  it('accepts a valid profile', () => {
    const parsed = ProfileSchema.parse({
      id: '00000000-0000-0000-0000-000000000000',
      username: 'creator',
      created_at: '2026-06-13T00:00:00.000Z',
    });
    expect(parsed.username).toBe('creator');
  });

  it('rejects a non-uuid id', () => {
    expect(() => ProfileSchema.parse({ id: 'nope', username: 'x' })).toThrow();
  });
});
```

- [ ] **Step 5: Install workspace deps, run test, verify it fails**

Run: `pnpm install`
Run: `pnpm --filter @omnisync/shared test`
Expected: FAIL — cannot resolve `./schemas` / `ProfileSchema` is not exported.

- [ ] **Step 6: Implement `packages/shared/src/schemas.ts`**

```ts
import { z } from 'zod';

export const ProfileSchema = z.object({
  id: z.string().uuid(),
  username: z.string().min(1),
  created_at: z.string().datetime().optional(),
});

export type Profile = z.infer<typeof ProfileSchema>;
```

- [ ] **Step 7: Create `packages/shared/src/index.ts`**

```ts
export * from './schemas';
```

- [ ] **Step 8: Run test + typecheck, verify pass**

Run: `pnpm --filter @omnisync/shared test`
Expected: PASS (2 tests).
Run: `pnpm --filter @omnisync/shared typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/shared pnpm-lock.yaml
git commit -m "feat(shared): add ProfileSchema with zod + vitest"
```

---

## Task 3: Expo app shell

**Files:**
- Create: `app/` (generated), then adjust `app/package.json`, `app/tsconfig.json`

- [ ] **Step 1: Generate the Expo app into `app/`**

Run from repo root:
`pnpm dlx create-expo-app@latest app --template expo-template-blank-typescript --no-install`
Expected: creates `app/` with TypeScript blank template (Expo Router added in Step 4).

- [ ] **Step 2: Rename the package so it joins the workspace** — edit `app/package.json`

Set the `"name"` field:

```json
"name": "@omnisync/app"
```

Add these scripts to `app/package.json` (merge into existing `"scripts"`):

```json
"typecheck": "tsc --noEmit",
"start": "expo start"
```

- [ ] **Step 3: Point `app/tsconfig.json` at the base config**

Replace `app/tsconfig.json` with:

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "moduleResolution": "Bundler",
    "lib": ["ESNext", "DOM"],
    "types": ["expo", "react", "react-native"],
    "noUnusedLocals": false,
    "noUnusedParameters": false
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

- [ ] **Step 4: Add Expo Router + required deps**

Run: `pnpm --filter @omnisync/app exec expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar`
Then run: `pnpm install`
Expected: deps added to `app/package.json`, hoisted into root `node_modules`.

- [ ] **Step 5: Set the entry + scheme for Expo Router** — edit `app/package.json`

Set `"main"`:

```json
"main": "expo-router/entry"
```

Edit `app/app.json` — add a `scheme` inside the `"expo"` object:

```json
"scheme": "omnisync"
```

- [ ] **Step 6: Remove the template entry that conflicts with Router**

Delete `app/App.tsx` if it exists (Expo Router uses the `app/` routes dir, created next task).

Run: `rm -f app/App.tsx`

- [ ] **Step 7: Verify the app typechecks**

Run: `pnpm --filter @omnisync/app typecheck`
Expected: no errors (a no-route warning at runtime is fine; routes come in Task 4).

- [ ] **Step 8: Commit**

```bash
git add app pnpm-lock.yaml
git commit -m "feat(app): scaffold Expo app with expo-router"
```

---

## Task 4: NativeWind + design tokens + Welcome stub (TDD on tokens)

**Files:**
- Create: `app/theme/tokens.ts`, `app/theme/tokens.test.ts`, `app/tailwind.config.js`,
  `app/global.css`, `app/babel.config.js`, `app/metro.config.js`,
  `app/nativewind-env.d.ts`, `app/app/_layout.tsx`, `app/app/index.tsx`,
  `app/vitest.config.ts`

- [ ] **Step 1: Install NativeWind + Tailwind + Vitest**

Run: `pnpm --filter @omnisync/app exec expo install nativewind react-native-reanimated`
Run: `pnpm --filter @omnisync/app add -D tailwindcss@^3.4.0 vitest@^2.1.8`
Run: `pnpm install`
Expected: deps resolved.

- [ ] **Step 2: Write the failing token test** — `app/theme/tokens.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { colors } from './tokens';

describe('design tokens', () => {
  it('exposes the brand primary and secondary', () => {
    expect(colors.primary).toBe('#ddb7ff');
    expect(colors.secondary).toBe('#4cd7f6');
  });

  it('exposes the base background', () => {
    expect(colors.background).toBe('#16111b');
  });
});
```

- [ ] **Step 3: Create `app/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globals: true, environment: 'node', include: ['theme/**/*.test.ts'] },
});
```

Add a `test` script to `app/package.json` scripts:

```json
"test": "vitest run"
```

- [ ] **Step 4: Run the test, verify it fails**

Run: `pnpm --filter @omnisync/app test`
Expected: FAIL — cannot resolve `./tokens`.

- [ ] **Step 5: Implement `app/theme/tokens.ts`** (ported from the prototype Tailwind config)

```ts
// Design tokens — single source of truth, consumed by tailwind.config.js and RN code.
export const colors = {
  primary: '#ddb7ff',
  'primary-container': '#b76dff',
  'on-primary': '#490080',
  secondary: '#4cd7f6',
  'secondary-container': '#03b5d3',
  background: '#16111b',
  surface: '#16111b',
  'surface-container': '#231e27',
  'surface-container-low': '#1f1a23',
  'surface-container-lowest': '#110c15',
  'on-surface': '#eadfed',
  'on-surface-variant': '#cfc2d6',
  outline: '#988d9f',
  'outline-variant': '#4d4354',
  error: '#ffb4ab',
  tertiary: '#fabc4e',
} as const;

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  gutter: '16px',
  lg: '24px',
  xl: '40px',
} as const;

export const fontFamily = {
  sans: ['Inter', 'system-ui', 'sans-serif'],
} as const;
```

- [ ] **Step 6: Run the test, verify it passes**

Run: `pnpm --filter @omnisync/app test`
Expected: PASS (2 tests).

- [ ] **Step 7: Create `app/tailwind.config.js`** (consumes the tokens)

```js
const { colors, spacing, fontFamily } = require('./theme/tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: { colors, spacing, fontFamily },
  },
  plugins: [],
};
```

- [ ] **Step 8: Create `app/global.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 9: Create `app/babel.config.js`**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
```

- [ ] **Step 10: Create `app/metro.config.js`**

```js
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
```

- [ ] **Step 11: Create `app/nativewind-env.d.ts`**

```ts
/// <reference types="nativewind/types" />
```

- [ ] **Step 12: Create the root layout** — `app/app/_layout.tsx`

```tsx
import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
```

- [ ] **Step 13: Create the Welcome stub** — `app/app/index.tsx`

```tsx
import { View, Text } from 'react-native';

export default function Welcome() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-primary text-2xl font-bold">OmniSync</Text>
      <Text className="text-on-surface-variant mt-2">
        The automated multi-publishing engine for creators.
      </Text>
    </View>
  );
}
```

- [ ] **Step 14: Typecheck the app**

Run: `pnpm --filter @omnisync/app typecheck`
Expected: no errors.

- [ ] **Step 15: Verify the app boots (bundles) on web**

Run: `pnpm --filter @omnisync/app exec expo export --platform web`
Expected: export completes, writes `app/dist/` (proves Metro + NativeWind compile).
Then: `rm -rf app/dist`

- [ ] **Step 16: Commit**

```bash
git add app pnpm-lock.yaml
git commit -m "feat(app): NativeWind theme tokens + Welcome screen"
```

---

## Task 5: Sentry observability (minimal init)

**Files:**
- Create: `app/sentry.ts`, `app/.env.example`
- Modify: `app/app/_layout.tsx`, `app/app.json`

- [ ] **Step 1: Install the Sentry SDK**

Run: `pnpm --filter @omnisync/app exec expo install @sentry/react-native`
Run: `pnpm install`
Expected: `@sentry/react-native` added to `app/package.json`.

- [ ] **Step 2: Create `app/sentry.ts`** (guarded — no-op until a DSN is provided)

```ts
import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initSentry() {
  if (!dsn) return; // disabled locally / until a DSN is configured
  Sentry.init({
    dsn,
    tracesSampleRate: 1.0,
  });
}

export { Sentry };
```

- [ ] **Step 3: Create `app/.env.example`**

```
# Sentry — leave blank to disable error reporting. Set in a local .env (gitignored).
EXPO_PUBLIC_SENTRY_DSN=
```

- [ ] **Step 4: Wire it into the root layout** — replace `app/app/_layout.tsx`

```tsx
import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { initSentry, Sentry } from '../sentry';

initSentry();

function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}

export default Sentry.wrap(RootLayout);
```

- [ ] **Step 5: Register the Expo config plugin** — edit `app/app.json`

Add `"@sentry/react-native/expo"` to the `"plugins"` array inside `"expo"` (create the
array if it does not exist):

```json
"plugins": ["expo-router", "@sentry/react-native/expo"]
```

- [ ] **Step 6: Typecheck and verify the web bundle still compiles**

Run: `pnpm --filter @omnisync/app typecheck`
Expected: no errors.
Run: `pnpm --filter @omnisync/app exec expo export --platform web`
Expected: export completes (Sentry init is a no-op without a DSN). Then `rm -rf app/dist`.

- [ ] **Step 7: Commit**

```bash
git add app pnpm-lock.yaml
git commit -m "feat(app): minimal Sentry init (no-op until DSN set)"
```

---

## Task 6: Supabase project + first migration

**Files:**
- Create: `supabase/config.toml` (generated), `supabase/migrations/0001_profiles.sql`

- [ ] **Step 1: Initialize Supabase**

Run from repo root: `npx supabase init`
Expected: creates `supabase/config.toml` and `supabase/` folders. If prompted about
generating VS Code settings, answer no.

- [ ] **Step 2: Create the first migration** — `supabase/migrations/0001_profiles.sql`

```sql
-- profiles: 1:1 with auth.users, RLS scoped to the owner.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles are insertable by owner"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles are updatable by owner"
  on public.profiles for update
  using (auth.uid() = id);
```

- [ ] **Step 3: Validate the migration SQL parses (requires Docker)**

If Docker is available, run: `npx supabase start` then `npx supabase db reset`
Expected: migration applies cleanly, `profiles` table created with RLS enabled.
Then stop: `npx supabase stop`

If Docker is NOT available, skip the live check and instead confirm the file is well-formed
SQL by eye; note in the commit message that it was not applied locally.

- [ ] **Step 4: Commit**

```bash
git add supabase/config.toml supabase/migrations/0001_profiles.sql
git commit -m "feat(supabase): init project + profiles migration with RLS"
```

---

## Task 7: ESLint + Prettier wiring

**Files:**
- Create: `eslint.config.mjs`

- [ ] **Step 1: Create the flat ESLint config** — `eslint.config.mjs`

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.expo/**', '**/node_modules/**', 'docs/prototypes/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
);
```

- [ ] **Step 2: Add the eslint flat-config deps**

Run: `pnpm -w add -D @eslint/js typescript-eslint`
Run: `pnpm install`
Expected: deps added at root.

- [ ] **Step 3: Run lint, formatting check, and typecheck across the workspace**

Run: `pnpm lint`
Expected: no errors (warnings acceptable).
Run: `pnpm format:check`
Expected: passes, or run `pnpm format` then re-check.
Run: `pnpm typecheck`
Expected: all members typecheck with no errors.

- [ ] **Step 4: Commit**

```bash
git add eslint.config.mjs package.json pnpm-lock.yaml
git commit -m "chore: eslint flat config + workspace lint/format wiring"
```

---

## Task 8: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create the CI workflow** — `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm typecheck
      - run: pnpm test
```

- [ ] **Step 2: Sanity-check the workflow runs locally (same commands CI runs)**

Run, in order:
`pnpm install --frozen-lockfile`
`pnpm lint`
`pnpm format:check`
`pnpm typecheck`
`pnpm test`
Expected: every command exits 0.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: lint, format, typecheck, test on PR"
```

- [ ] **Step 4: Push the branch and open a PR (CI runs, main requires PR)**

```bash
git push -u origin phase1-scaffold
```
Then open a PR against `main` (the branch ruleset requires it). Confirm the CI job goes
green before merging.

---

## Self-Review notes (coverage vs. spec §3 / Phase 1)

- Monorepo + pnpm workspace → Task 1. ✓
- `app/` Expo + Expo Router + NativeWind theme from prototypes → Tasks 3–4. ✓
- `packages/shared` TS + zod → Task 2. ✓
- Sentry observability (§6) → Task 5. ✓
- `supabase/` config + first migration with **RLS** (§4, §6) → Task 6. ✓
- Theme tokens ported (primary `#ddb7ff`, secondary `#4cd7f6`, Inter, M3 surfaces) → Task 4. ✓
- CI/lint (§6 tooling) → Tasks 7–8. ✓
- Secret custody: `.env.example` only holds the **non-secret** `EXPO_PUBLIC_SENTRY_DSN`; no
  platform tokens or API secrets enter the app (§6 token custody, Task 5). ✓

**Deferred to later phases (out of scope here):** Supabase Auth + Google/email screens
(Phase 2); Meta/per-platform OAuth + connect/master-source (Phase 3); `SourceConnector`,
`poll-sources`, pgcrypto-encrypted tables, `pg_cron` (Phase 4); Gemini variations + Review
Canvas (Phase 5); publish pipeline, History, push (Phase 6). Component-render tests
for the app (jest-expo) are deferred until there are real components to test (Phase 2).
