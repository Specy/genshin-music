# Phase 1 — Next 16 + React 19 + @serwist/next — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the app to Next 16 + React 19 and replace the unmaintained `next-pwa` with `@serwist/next`, while staying on the Pages Router and keeping the static `output:'export'` multi-target (Sky/Genshin) build working.

**Architecture:** A pure dependency/runtime/config upgrade — no router or feature changes. The custom Workbox service worker is re-implemented on Serwist's `swSrc` model, preserving its exact runtime-caching, cache-GC, Tauri guard, and manual update-prompt behavior. `@pixi/react` v7 is knowingly incompatible with React 19 and is left broken until Phase 2; the static build tolerates it via a temporary `typescript.ignoreBuildErrors`.

**Tech Stack:** Next.js 16, React 19, TypeScript 5.4, `@serwist/next` + `serwist` (Workbox successor), the existing `scripts/buildApp.js` multi-target build.

## Global Constraints

> Every task implicitly inherits these.

- **Node ≥ 20.9.0**, **TypeScript ≥ 5.1** (Next 16 minimums).
- **Verification gate = typecheck + build only.** There is no test suite. Each task ends by running `npx tsc --noEmit` and/or a static build, then committing. There are NO unit tests to write.
- **During Phase 1, pixi is expected to break.** `npx tsc --noEmit` will report errors — every reported error MUST be in a known-pixi file (see Appendix A). An error in any **non-pixi** file is a real regression and must be fixed before the task is done.
- **Keep `output:'export'`** and the per-target output dirs **`build/skyMusic`** / **`build/genshinMusic`** unchanged (driven by `BUILD_PATH`/`distDir`). Tauri is left as-is; do not delete `src-tauri/` or `build-tauri:*` scripts.
- **Keep all `NEXT_PUBLIC_*` env vars working:** `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_BASE_PATH`, `NEXT_PUBLIC_SW_VERSION`, `NEXT_PUBLIC_IS_TAURI`, `NEXT_PUBLIC_IS_BETA`.
- **Build commands** (Windows PowerShell / Git Bash): `node ./scripts/buildApp.js Sky` and `node ./scripts/buildApp.js Genshin`. Dev: `node ./scripts/startApp.js Genshin`.
- **Service worker filename/URL stays `service-worker.js`** so the existing `src/serviceWorkerRegistration.ts` (manual registration, `register:false`) keeps working unchanged.
- **Use `--legacy-peer-deps` for ALL `npm install`/`npm uninstall` during Phase 1.** `@pixi/react@7` peer-deps React ≤18 and stays installed until Phase 2, so React 19 installs/uninstalls will otherwise fail npm's `ERESOLVE` peer check. This flag is dropped in Phase 2 once `@pixi/react@8` lands. Keep `@pixi/react`/`pixi.js` **installed** through Phase 1 (removing them would turn tolerable type errors into hard module-resolution build failures).

---

### Task 1: Create the migration branch

**Files:** none (git only)

- [ ] **Step 1: Branch off `Dev`**

Run:

```bash
git checkout Dev
git pull --ff-only        # if a remote is configured; skip if not
git checkout -b migration/next16-react19
```

- [ ] **Step 2: Confirm Node version satisfies the floor**

Run: `node --version`
Expected: `v20.9.0` or higher (Next 16 requires ≥ 20.9). If lower, stop and upgrade Node first.

---

### Task 2: Upgrade dependencies

**Files:**

- Modify: `package.json` (`engines`, `dependencies`, `devDependencies`)

**Interfaces:**

- Produces: a `node_modules` tree with `next@16`, `react@19`, `react-dom@19`, `@serwist/next` + `serwist` installed, and `next-pwa` / `@types/next-pwa` / `@esbuild-plugins/*` removed.

- [ ] **Step 1: Bump the Node engine**

In `package.json`, change:

```json
  "engines": {
    "node": ">=20.9.0"
  },
```

- [ ] **Step 2: Upgrade React + Next + types + i18n**

Run (note `--legacy-peer-deps` — see Global Constraints; pixi-react v7 still requires React ≤18):

```bash
npm install --legacy-peer-deps next@^16 react@^19 react-dom@^19
npm install --legacy-peer-deps -D @types/react@^19 @types/react-dom@^19 eslint-config-next@^16 @next/bundle-analyzer@^16
npm install --legacy-peer-deps react-i18next@^15
```

- [ ] **Step 3: Install Serwist, remove next-pwa + dead esbuild polyfills**

Run:

```bash
npm install --legacy-peer-deps -D @serwist/next@latest serwist@latest
npm uninstall --legacy-peer-deps next-pwa @types/next-pwa @esbuild-plugins/node-globals-polyfill @esbuild-plugins/node-modules-polyfill
```

If npm still aborts with `ERESOLVE` despite `--legacy-peer-deps`, retry the same command with `--force` and note it in the report.

- [ ] **Step 4: Verify resolved versions**

Run: `npx next --version`
Expected: `Next.js v16.x.x`

Run: `node -e "console.log(require('react').version)"`
Expected: `19.x.x`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: upgrade to Next 16, React 19; swap next-pwa for @serwist/next"
```

---

### Task 3: Run the React 19 type codemods and review

**Files:**

- Modify: any `src/**` files the codemod rewrites (typically `@types/react` import/`JSX` namespace tweaks)

- [ ] **Step 1: Run the official React 19 types codemod**

Run:

```bash
npx types-react-codemod@latest preset-19 ./src
```

When prompted, accept the full preset. This rewrites removed types (`ReactChild`, etc. — the audit found none, so expect few or no changes), the scoped `JSX` namespace, and `useRef` argument changes.

- [ ] **Step 2: Typecheck and confirm only pixi errors remain**

Run: `npx tsc --noEmit`
Expected: every error path is in the Appendix A pixi-file list. If an error appears in a **non-pixi** file, fix it (most likely a `@types/react` 19 signature change) before continuing.

- [ ] **Step 3: Commit (only if the codemod changed files)**

```bash
git add -A
git commit -m "refactor: apply React 19 type codemods"
```

If `git status` shows no changes, skip this commit.

---

### Task 4: Port the service worker to Serwist

**Files:**

- Modify (full rewrite): `src/service-worker.ts`

**Interfaces:**

- Consumes: build-time env `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_SW_VERSION`, `NEXT_PUBLIC_IS_TAURI`; the Serwist-injected precache token `self.__SW_MANIFEST`.
- Produces: a Serwist `swSrc` worker that Task 5's `next.config.js` compiles to `public/service-worker.js`.

- [ ] **Step 1: Replace the entire contents of `src/service-worker.ts`**

This preserves the original behavior exactly: runtime-only caching (the original `precacheAndRoute` was commented out), the `IS_TAURI` no-route guard, the major-version refresh on `install`, the `APP_NAME`-keyed cache GC on `activate`, and the manual `SKIP_WAITING` update prompt (`skipWaiting:false` so the existing update UI still gates activation). The two runtime routes keep their original registration order (the audio `CacheFirst` is shadowed by the catch-all `NetworkFirst`, exactly as before).

```ts
/// <reference lib="webworker" />
import { CacheFirst, NetworkFirst, Serwist } from 'serwist';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Serwist injects the precache manifest at this token (the `injectionPoint`).
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME as string;
const CACHE = `${APP_NAME}-${process.env.NEXT_PUBLIC_SW_VERSION}`;
const IS_TAURI = process.env.NEXT_PUBLIC_IS_TAURI === 'true';
const MAJOR_VERSION = 3;
const PRECACHE_CACHE = `${MAJOR_VERSION}-precache-${CACHE}`;
const RUNTIME_CACHE = `${MAJOR_VERSION}-runtime-${CACHE}`;
console.log(`CACHE NAME: "${CACHE}"`);

// Referenced so Serwist's build finds the injection point. We intentionally keep
// runtime-only caching (precache list empty) to match the previous behavior.
const _precacheManifest = self.__SW_MANIFEST;
void _precacheManifest;

function forbiddenCachedItems(url: URL): boolean {
  return (
    url.pathname.includes('service-worker') ||
    url.pathname.includes('manifestData') ||
    url.pathname.endsWith('.json')
  );
}

const serwist = new Serwist({
  precacheEntries: [],
  precacheOptions: { cacheName: PRECACHE_CACHE },
  skipWaiting: false,
  clientsClaim: true,
  runtimeCaching: IS_TAURI
    ? []
    : [
        {
          // Catch-all (evaluated first): everything not explicitly forbidden.
          matcher: ({ url }) => {
            try {
              if (forbiddenCachedItems(new URL(url))) return false;
            } catch (e) {
              console.error('Error caching', e);
            }
            return true;
          },
          handler: new NetworkFirst({ cacheName: RUNTIME_CACHE }),
        },
        {
          // Audio. NOTE: shadowed by the catch-all above, preserved as in the
          // original worker. Reorder before the catch-all if CacheFirst-for-audio
          // is actually intended.
          matcher: ({ url }) => {
            try {
              if (forbiddenCachedItems(new URL(url))) return false;
              if (url.pathname.endsWith('.mp3') || url.pathname.endsWith('.wav')) return true;
            } catch (e) {
              console.error('Error caching', e);
            }
            return false;
          },
          handler: new CacheFirst({ cacheName: RUNTIME_CACHE }),
        },
      ],
});

serwist.addEventListeners();

// Manual update prompt: the app posts { type: 'SKIP_WAITING' } when the user
// accepts an update (see src/serviceWorkerRegistration.ts + _app.tsx).
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[ServiceWorker] skip waiting');
    self.skipWaiting();
  }
});

// On a MAJOR_VERSION cache-key change, skip waiting and refresh all open tabs.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cacheKeys = await caches.keys();
      if (!cacheKeys.length) return console.log('Fresh install');
      const appKeys = cacheKeys.filter((e) => e.includes(APP_NAME));
      if (!appKeys.length) return console.log('Fresh install');
      const majorVersionKeys = appKeys.filter((e) => e.startsWith(`${MAJOR_VERSION}`));
      if (majorVersionKeys.length === 0) {
        console.log('Major version change, skipping waiting and refreshing all tabs');
        await self.skipWaiting();
        await self.clients.claim();
        const clients = await self.clients.matchAll({ type: 'window' });
        clients.forEach((client) => client.navigate(client.url));
      }
    })()
  );
});

// Custom cache GC keyed on APP_NAME.
self.addEventListener('activate', (evt) => {
  console.log('[ServiceWorker] Activate');
  evt.waitUntil(
    caches.keys().then(async (keyList) => {
      await Promise.all(
        keyList.map((key) => {
          if (!APP_NAME) {
            console.error('APP_NAME is not defined');
            return Promise.resolve();
          }
          if (key.includes(APP_NAME)) {
            if (key.includes('precache'))
              return key !== PRECACHE_CACHE ? caches.delete(key) : Promise.resolve();
            if (key.includes('runtime'))
              return key !== RUNTIME_CACHE ? caches.delete(key) : Promise.resolve();
            return caches.delete(key);
          }
          if (key.includes('workbox')) return caches.delete(key);
          return Promise.resolve();
        })
      );
      console.log('[ServiceWorker] Finished removing old caches');
    })
  );
  self.clients.claim();
});
```

- [ ] **Step 2: Commit**

```bash
git add src/service-worker.ts
git commit -m "feat(pwa): port custom service worker to Serwist"
```

---

### Task 5: Rewire `next.config.js` (drop next-pwa, add Serwist, tolerate pixi)

**Files:**

- Modify (full rewrite): `next.config.js`

**Interfaces:**

- Consumes: `src/service-worker.ts` (Task 4) as `swSrc`; env `BUILD_PATH`, `NEXT_PUBLIC_BASE_PATH`, `ANALYZE`.
- Produces: a static-export config that compiles the worker to `public/service-worker.js` and tolerates pixi-react v7's React-19 type errors.

- [ ] **Step 1: Replace the entire contents of `next.config.js`**

```js
import withSerwistInit from '@serwist/next';
import bundleAnalyzer from '@next/bundle-analyzer';

const dist = process.env.BUILD_PATH ?? 'build';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

const withSerwist = withSerwistInit({
  swSrc: 'src/service-worker.ts',
  swDest: 'public/service-worker.js',
  scope: process.env.NEXT_PUBLIC_BASE_PATH ?? '/',
  register: false, // we register manually in src/serviceWorkerRegistration.ts
  disable: process.env.NODE_ENV === 'development',
});

/**
 * @type {import('next').NextConfig}
 */
const config = {
  output: 'export',
  distDir: dist,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? '',
  images: {
    unoptimized: true,
  },
  // TEMPORARY (Phase 1 only): @pixi/react v7 does not typecheck under React 19.
  // Remove this once the pixi.js v8 migration (Phase 2) is complete.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default withBundleAnalyzer(withSerwist(config));
```

- [ ] **Step 2: Confirm there is no leftover custom `webpack` key**

Run: `npx grep -n "webpack" next.config.js || true` (or open the file)
Expected: no `webpack:` key (Next 16 defaults to Turbopack; a custom webpack config would fail the build). The config above has none.

- [ ] **Step 3: Commit**

```bash
git add next.config.js
git commit -m "build: configure @serwist/next, drop next-pwa, tolerate pixi types"
```

---

### Task 6: Build + service-worker smoke test (both targets) — PWA gate

**Files:** none (verification + any fixes surfaced)

This is the critical validation of the Serwist + `output:'export'` combination.

- [ ] **Step 1: Build the Genshin target**

Run: `node ./scripts/buildApp.js Genshin`
Expected: build completes; output in `build/genshinMusic/`. If `next build` aborts during page **prerendering** with a pixi/React error (not just a type error), apply the contingency in Step 5, then re-run.

- [ ] **Step 2: Confirm the worker and its precache manifest were emitted**

Run: `npx grep -c "__SW_MANIFEST\|self.__WB\|precache" build/genshinMusic/service-worker.js || true`
Then open `build/genshinMusic/service-worker.js` and confirm: (a) the file exists, (b) `process.env.NEXT_PUBLIC_APP_NAME` was **inlined** to `"Genshin"` (search for `Genshin-` cache-name string) — not left as a literal `process.env...`. If the env vars are NOT inlined, apply the contingency in Step 6.

- [ ] **Step 3: Serve and verify registration + runtime caching**

Run: `npx serve@latest build/genshinMusic`
In a browser, open the served URL, then DevTools → Application → Service Workers. Confirm `service-worker.js` is **activated**. Reload; in Application → Cache Storage confirm a `*-runtime-Genshin-*` cache fills with visited assets. (Manual check — no automated assertion.)

- [ ] **Step 4: Repeat the build for the Sky target**

Run: `node ./scripts/buildApp.js Sky`
Expected: completes; `build/skyMusic/service-worker.js` exists with `Sky-` inlined cache names.

- [ ] **Step 5: CONTINGENCY — if `next build` crashes during prerender on a pixi page**

The 3 canvas pages render `@pixi/react` v7 under React 19. If prerendering throws (rather than producing a static page), isolate the canvases so the build completes; this work is superseded in Phase 2. For each of `src/components/pages/Composer/ComposerCanvas.tsx`, `src/components/pages/VsrgComposer/VsrgComposerCanvas.tsx`, `src/components/pages/VsrgPlayer/VsrgPlayerCanvas.tsx`, change the consuming page to import the canvas via a client-only dynamic import, e.g. in the page that renders it:

```tsx
import dynamic from 'next/dynamic';
const ComposerCanvas = dynamic(() => import('$cmp/pages/Composer/ComposerCanvas'), { ssr: false });
```

(Use the existing `$cmp` path alias and the real default/named export. Adjust the import to match each canvas's export shape.) Re-run the build. Record any file changed here so Phase 2 can fold the `ssr:false` wrapping into the proper pixi migration.

- [ ] **Step 6: CONTINGENCY — if `NEXT_PUBLIC_*` env vars are not inlined in the worker**

If the built worker still contains literal `process.env.NEXT_PUBLIC_APP_NAME`, the cache names break. Pass the values explicitly via the worker build define. In `next.config.js`'s `withSerwistInit`, the worker is compiled by Serwist; reference the env in the worker through a Serwist-supported define or, as a fallback, hardcode the read with a guarded default in `src/service-worker.ts`:

```ts
const APP_NAME = (process.env.NEXT_PUBLIC_APP_NAME as string) || 'App';
```

and verify Serwist's esbuild inlines `NEXT_PUBLIC_*` (it should for `NEXT_PUBLIC_`-prefixed vars). If it does not, switch the SW build to the standalone Workbox `injectManifest` fallback noted in the spec §8 and open a follow-up task.

- [ ] **Step 7: Commit any contingency fixes**

```bash
git add -A
git commit -m "fix(pwa): ensure Serwist worker builds under static export"
```

If no changes were needed, skip.

---

### Task 7: Remove now-unused Workbox dependencies

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Confirm the old Workbox packages are unused**

Run: `npx grep -rn "workbox-core\|workbox-routing\|workbox-strategies\|workbox-precaching" src || true`
Expected: no matches (the only importer was the old `src/service-worker.ts`, now ported to `serwist`). If any match remains, do NOT remove that package.

- [ ] **Step 2: Uninstall the unused Workbox packages**

Run (only the ones Step 1 confirmed unused):

```bash
npm uninstall --legacy-peer-deps workbox-core workbox-precaching workbox-routing workbox-strategies
```

- [ ] **Step 3: Re-run one build to confirm nothing depended on them**

Run: `node ./scripts/buildApp.js Genshin`
Expected: build still completes; worker still emitted.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: remove unused Workbox deps after Serwist port"
```

---

### Task 8: Phase 1 verification gate + record known pixi breakage

**Files:**

- Modify: `docs/superpowers/specs/2026-06-25-nextjs-pixi-migration-design.md` (append a short "Phase 1 done — known broken" note), or create `docs/superpowers/PHASE-1-STATUS.md`.

- [ ] **Step 1: Typecheck — confirm only pixi errors remain**

Run: `npx tsc --noEmit`
Expected: all reported errors are in Appendix A files. Zero errors outside that list.

- [ ] **Step 2: Build both targets**

Run: `node ./scripts/buildApp.js Sky && node ./scripts/buildApp.js Genshin`
Expected: both complete; `build/skyMusic` and `build/genshinMusic` exist with `service-worker.js`.

- [ ] **Step 3: Dev smoke (non-pixi pages)**

Run: `node ./scripts/startApp.js Genshin`
Open `/` (player), `/blog`, `/theme`, `/keybinds` — confirm they render. The canvas pages (`/composer`, `/vsrg-composer`, `/vsrg-player`) are expected to be broken at runtime — this is the planned Phase 1 state.

- [ ] **Step 4: Record the known-broken list and commit**

Write a short note (file above) listing: "Phase 1 complete on `migration/next16-react19`. Known broken until Phase 2: the 3 pixi canvas pages (composer, vsrg-composer, vsrg-player) and the files in Appendix A. `typescript.ignoreBuildErrors` is temporarily true." Then:

```bash
git add -A
git commit -m "docs: record Phase 1 completion and known pixi breakage"
```

- [ ] **Step 5: Hand back for Phase 2 planning**

Phase 1 is done. The Phase 2 plan (pixi-react 8 + pixi.js 8) will be written next; it removes `typescript.ignoreBuildErrors` and restores a fully green typecheck.

---

## Self-Review (performed against the spec)

- **Spec coverage (§5 Phase 1):** engine bump (Task 2 S1), dep bumps + remove next-pwa/esbuild (Task 2), codemods (Task 3), `next.config` strip + `ignoreBuildErrors` (Task 5), Serwist port preserving routing/strategies/install/activate/IS_TAURI/SKIP_WAITING (Task 4), `output:'export'` smoke test + fallback (Task 6 S5/S6), both-target gate (Task 8). ESLint flat-config is intentionally deferred per spec (no `lint` script today) — not a task. ✓
- **Placeholders:** none — all code steps contain full code; contingencies contain concrete commands. ✓
- **Type/name consistency:** `service-worker.ts` exports nothing (it's a worker); `swSrc: 'src/service-worker.ts'` and `swDest: 'public/service-worker.js'` match across Tasks 4–6 and the existing `serviceWorkerRegistration.ts` registration URL. Cache-name strings (`PRECACHE_CACHE`/`RUNTIME_CACHE`) are consistent between the worker and the GC handler. ✓

## Appendix A — known-pixi files (errors here are EXPECTED in Phase 1)

These import `@pixi/react`, `pixi.js`, or `@pixi/graphics-smooth` and will not typecheck under React 19 until Phase 2:

- `src/components/pages/Composer/ComposerCanvas.tsx`
- `src/components/pages/Composer/RenderColumn.tsx`
- `src/components/pages/Composer/ComposerBreakpointsRenderer.tsx`
- `src/components/pages/Composer/ComposerCache.ts`
- `src/components/pages/VsrgComposer/VsrgComposerCanvas.tsx`
- `src/components/pages/VsrgComposer/VsrgComposerCache.ts`
- `src/components/pages/VsrgComposer/VsrgKeysRenderer.tsx`
- `src/components/pages/VsrgComposer/VsrgScrollableTrackRenderer.tsx`
- `src/components/pages/VsrgComposer/VsrgTrackRenderer.tsx`
- `src/components/pages/VsrgComposer/VsrgTimelineRenderer.tsx`
- `src/components/pages/VsrgComposer/VsrgTimelineBreakpointsRenderer.tsx`
- `src/components/pages/VsrgPlayer/VsrgPlayerCanvas.tsx`
- `src/components/pages/VsrgPlayer/VsgPlayerCache.ts`
- `src/components/pages/VsrgPlayer/VsrgHitObjectsRenderer.tsx`
- `src/components/pages/VsrgPlayer/VsrgPlayerAccuracyRenderer.tsx`

(Also any class component holding a `<Stage>` ref — already in the list above.)

---

## Phases 2 & 3 — outline (each to be expanded into its own full plan)

These are intentionally summaries, not bite-sized plans. Each will be written in full once the prior phase lands and its concrete state is known.

### Phase 2 — pixi-react 8 + pixi.js 8 (Pages Router; restores a green build)

1. Deps: `@pixi/react@^8`, `pixi.js@^8`; remove `@pixi/graphics-smooth`; drop any `@pixi/*` subpackage imports. Add a shared `extend({ Container, Graphics, Sprite, Text })` module.
2. 3 canvases: `<Stage>` → `<Application>`; move the synchronous `ref.current.app.renderer.generateTexture(...)` cache build to an `onInit`/`useApplication()` path (async init); `_canvas` → `app.canvas`; drop `renderOnComponentChange`; enable `antialias`. Wrap canvases in `dynamic(..., { ssr:false })`.
3. 3 cache classes + 2 inline `draw` callbacks: rewrite Graphics API (`beginFill→fill`, `lineStyle→stroke({width,color})`, `drawRect→rect`, `drawCircle→circle`, `drawRoundedRect→roundRect`, drop `endFill`); `SCALE_MODES.LINEAR→'linear'`; drop `settings.LINE_SCALE_MODE`; update `generateTexture` options shape; `SmoothGraphics` → core `Graphics`.
4. JSX rename across ~11 renderers: `<Container>→<pixiContainer>`, `<Sprite>→<pixiSprite>`, `<Graphics>→<pixiGraphics>`, `<Text>→<pixiText>`.
5. Remove `typescript.ignoreBuildErrors` from `next.config.js`.
6. Gate: full strict `tsc`; clean build both targets; dev loads every page including canvases.

### Phase 3 — Pages Router → App Router (static export preserved)

1. `app/layout.tsx` (html/body, 9 global stylesheets, GA `<Script>`, `metadata`/`viewport` exports) + `app/providers.tsx` (`"use client"`, the full provider tree + the 3 `_app` effects).
2. Each `pages/<r>/index.tsx` → `app/<r>/page.tsx` (`"use client"`); `pages/404` → `app/not-found.tsx`; `getLayout` (5 pages) → nested `app/<r>/layout.tsx`.
3. `next/router` → `next/navigation` (8 files); `router.query` → `useSearchParams` (composer).
4. `router.events` redesign: analytics page-views via `usePathname`/`useSearchParams` effect; unsaved-changes guard via a `useUnsavedChangesGuard` hook (`beforeunload` + in-app nav interception) — **needs design review for fidelity**.
5. `PageMetadata` (~20 pages) → React 19 native `<title>`/`<meta>` hoisting (drop `next/head`).
6. Re-run the Serwist `output:'export'` smoke test under the `app/` structure. Delete `src/pages/` when complete.
7. Gate: full strict `tsc`; static export both targets; all routes present; SW registers.
