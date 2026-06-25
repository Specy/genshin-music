# Migration Design — Next 16 · React 19 · App Router · pixi.js 8

- **Date:** 2026-06-25
- **Status:** Approved (pending final spec review)
- **Repo:** `genshin-music` (Sky Music / Genshin Music — a static-export PWA music tool)

## 1. Goal

Migrate the project off its current stack:

- `next` 14 → **16**
- `react` / `react-dom` 18 → **19** (forced by Next 16)
- `@pixi/react` 7 → **8** (forced by React 19) → `pixi.js` 7 → **8** (forced by pixi-react 8)
- Pages Router → **App Router**, while keeping a fully static build (`output: 'export'`).

Replace the unmaintained `next-pwa` (incompatible with Next 16) with a maintained PWA toolchain, and keep the existing multi-target (Sky/Genshin) static build working.

## 2. Phase order & rationale

The dependency chain forces an unavoidable "broken window": the moment React 19 is installed, `@pixi/react` v7 (peer-deps React ≤18) stops compiling, and it can only be fixed by going to `@pixi/react` v8, which itself requires React 19. We therefore upgrade pixi **immediately after** the React bump, and do the App Router migration last:

1. **Phase 1 — Next 16 + React 19 + PWA replacement** (stay on Pages Router). Pixi is knowingly broken; the build gate is relaxed *for pixi only*.
2. **Phase 2 — pixi-react 8 + pixi.js 8** (stay on Pages Router). The app is whole again; full strict typecheck/build restored.
3. **Phase 3 — Pages Router → App Router** (static export preserved). Runs under full strict typechecking.

**Why pixi before App Router:** the app is fully runnable again at the end of Phase 2, and the largest structural change (App Router) then runs with full typechecking instead of suppressed errors — safer regression detection.

## 3. Scope & non-goals

- **In scope:** the three phases above, the PWA replacement, dead-config cleanup that directly unblocks the migration, and keeping the Sky/Genshin multi-target build + `basePath` sub-path builds working.
- **Tauri / desktop — left as-is.** Unused today; the user may rework it later. Do **not** delete `src-tauri/`, the `build-tauri:*` scripts, or the `NEXT_PUBLIC_IS_TAURI` service-worker guard. Don't upgrade or verify Tauri. The only constraint Tauri imposes (the static export must keep landing in `build/{skyMusic,genshinMusic}`) is already satisfied by the existing `BUILD_PATH`/`distDir` wiring and is preserved across all phases.
- **No new test suite.** There is no application test suite (only `node_modules` tests). The verification gate is **typecheck + build only** (see §7); runtime smoke-testing is done manually by the user.
- **No feature changes / refactors** beyond what each migration step requires.

## 4. Current-state facts (from codebase exploration)

Key facts the plan relies on:

- **No server data-fetching anywhere** — zero `getStaticProps` / `getStaticPaths` / `getServerSideProps` / `getInitialProps`. The app is 100% client-rendered (localStorage + IndexedDB), so `output:'export'` stays valid and there is no data-layer migration.
- **28 routes, all static**, all `index.tsx`; **no dynamic `[slug]`/catch-all routes** (blog posts are individual files). No `generateStaticParams` needed.
- **React 19 exposure is clean:** no `defaultProps` on function components, no string refs, no `PropTypes`, no `findDOMNode`, no legacy context, no `ReactDOM.render`. Only 2 `forwardRef` files (optional cleanup).
- **MobX is not React-coupled:** stores are module-level singletons consumed via a custom hook layer (`src/lib/Hooks/useObservable.ts`); there is **no `mobx-react`/`mobx-react-lite`**. So the React bump needs no MobX changes.
- **`next/router` used in 8 files**; the hard part is `router.events` (analytics page-views in `AppBase`, and the unsaved-changes navigation guard in the Composer + VsrgComposer class components).
- **`next/head` via `PageMetadata`** on ~20 pages; values are i18n/runtime-driven.
- **PWA:** `next-pwa` with a custom worker `src/service-worker.ts` (`__WB_MANIFEST` injection, `register:false` + manual `serviceWorkerRegistration.ts`).
- **pixi:** 15 files. **None of the worst pixi-react items are present** — no `PixiComponent`, no `useApp`/`useTick`, no filters, no `Assets`/`Loader`, no `BaseTexture`. Concentrated in 3 `<Stage>` canvases, 3 texture-cache classes (using `@pixi/graphics-smooth`), and ~11 renderer files using `Container`/`Sprite`/`Graphics`/`Text`.
- **`@pixi/graphics-smooth` is not v8-ready** → drop `SmoothGraphics`, use core `Graphics` + `antialias`.
- **Env vars** (must keep working, build-time inlined): `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_BASE_PATH`, `NEXT_PUBLIC_SW_VERSION`, `NEXT_PUBLIC_IS_TAURI`, `NEXT_PUBLIC_IS_BETA`.
- **Build system:** `scripts/buildApp.js` copies `src/appData/{sky|genshin}` into `public/`, rewrites `manifest.json`, and sets the env vars per target; output → `build/{skyMusic|genshinMusic}`.

## 5. Phase details

### Phase 1 — Next 16 + React 19 + `@serwist/next`

**Outcome:** Next 16 + React 19 building and running on the Pages Router with a working service worker. Pixi pages are broken (expected).

1. **Engine/tooling:** set `engines.node` to `>=20.9.0`; confirm local Node ≥ 20.9 and TypeScript ≥ 5.1 (already 5.4.5).
2. **Dependency bumps:** `next`→16, `react`/`react-dom`→19, `@types/react`/`@types/react-dom`→19, `eslint-config-next`→16, `@next/bundle-analyzer`→16, `react-i18next`→15.x. **Remove** `next-pwa` + `@types/next-pwa`. **Remove** orphaned `@esbuild-plugins/node-globals-polyfill` + `@esbuild-plugins/node-modules-polyfill` (unused).
3. **Codemods:** `npx @next/codemod@canary upgrade latest`, then `npx types-react-codemod@latest preset-19 ./src`. Review diffs; the codebase is clean so fallout should be minimal.
4. **`next.config.js`:** remove the `withPwa(...)` wrapper; keep `output:'export'`, `distDir`, `basePath`, `images.unoptimized`. Add **temporary** `typescript: { ignoreBuildErrors: true }` so pixi-react v7 type errors don't block the static build (removed at the end of Phase 2). No custom `webpack` key exists, so the Turbopack default is fine.
5. **PWA → `@serwist/next`:**
   - Install `@serwist/next` + `serwist`.
   - Port `src/service-worker.ts` to a Serwist `swSrc` worker, preserving current behavior: `NetworkFirst` default route, `CacheFirst` for `.mp3`/`.wav`, the custom `install`/`activate` cache-GC keyed on `APP_NAME`/major-version, and the `SKIP_WAITING` message handler. **Preserve the `NEXT_PUBLIC_IS_TAURI` early-return guard** (no route registration under Tauri).
   - Wire `withSerwistInit({ swSrc, swDest, ... })` to emit the worker at the same filename/scope the app expects, keeping `register:false` (manual registration via `src/serviceWorkerRegistration.ts` stays). Keep `NEXT_PUBLIC_SW_VERSION` cache-busting.
   - **Risk / validation:** Serwist's `output:'export'` support is not officially asserted. Build a target, serve the exported dir, and confirm `service-worker.js` registers and precaches the hashed `_next` assets + audio/fonts. **Fallback:** a standalone Workbox `injectManifest` script in `scripts/` producing `public/service-worker.js`, decoupled from the framework.
   - Confirm `swDest` lands inside the per-target export dir (`build/{skyMusic|genshinMusic}`), respecting `distDir`/`basePath`.
6. **ESLint:** Next 16 removes `next lint` and no longer lints during `next build`; there is no `lint` script today, so this is low-priority. Migrate `.eslintrc*` → flat `eslint.config.mjs` only if needed to keep editor/CI lint working; otherwise defer.
7. **Gate (Phase 1):** `tsc --noEmit` clean **except** the ~15 pixi files; `next build` static export completes for **both** Sky and Genshin; output lands in `build/{skyMusic,genshinMusic}` unchanged; non-pixi pages load in `next dev`.

### Phase 2 — pixi-react 8 + pixi.js 8

**Outcome:** canvas pages restored; `ignoreBuildErrors` removed; full strict gate.

1. **Deps:** `@pixi/react`→8, `pixi.js`→8, **remove** `@pixi/graphics-smooth`. Drop any `@pixi/*` subpackage imports (v8 is a single ESM package). Add a shared `extend({ Container, Graphics, Sprite, Text })` registration module imported by the canvas entry points.
2. **3 canvases** (`ComposerCanvas.tsx`, `VsrgComposerCanvas.tsx`, `VsrgPlayerCanvas.tsx`):
   - `<Stage … options ref onMount>` → `<Application …>` (options become props). Init is **async**, so the texture-cache build that currently reads `ref.current.app.renderer.generateTexture(...)` synchronously moves into an `onInit` / `useApplication()` path.
   - `notesStageRef.current._canvas` (native `wheel` listener) → `app.canvas`.
   - Remove `renderOnComponentChange`; map `raf={false}` to the v8 ticker/`autoStart` options. `app.renderer.background.color` reads adapt to v8.
   - **Wrap each canvas in `dynamic(() => …, { ssr: false })`** so the static-export prerender doesn't initialize WebGL at build time.
3. **3 cache classes** (`ComposerCache.ts`, `VsrgComposerCache.ts`, `VsgPlayerCache.ts`) + **2 inline `draw` callbacks** (`ComposerCanvas.tsx`, `VsrgKeysRenderer.tsx`): rewrite the Graphics API —
   - `beginFill(c)…drawRect(x,y,w,h)…endFill()` → `…rect(x,y,w,h).fill(c)`
   - `lineStyle(w,c)` → `.stroke({ width:w, color:c })` (build shape first, then `stroke`)
   - `drawCircle`→`circle`, `drawRoundedRect`→`roundRect`, `moveTo`/`lineTo` unchanged, drop `endFill`.
   - `SCALE_MODES.LINEAR` → `'linear'`; remove `settings.LINE_SCALE_MODE`.
   - Update `app.renderer.generateTexture(...)` to the v8 options shape (`{ target, resolution, ... }`).
   - Replace `SmoothGraphics` with core `Graphics`; enable `antialias: true` on the `Application` to offset the lost smoothing.
4. **JSX rename** across ~11 renderer files: `<Container>`→`<pixiContainer>`, `<Sprite>`→`<pixiSprite>`, `<Graphics>`→`<pixiGraphics>`, `<Text>`→`<pixiText>`; swap named-component imports for `extend`. Add pixi JSX type augmentation as needed (under the React 19 scoped `JSX` namespace).
5. **Remove** the temporary `typescript.ignoreBuildErrors` from `next.config.js`.
6. **Gate (Phase 2):** **full strict** `tsc --noEmit` (no pixi exceptions); clean `next build` for both targets; `next dev` loads **every** page including the Composer/VSRG canvases. Minor anti-aliasing differences from dropping SmoothGraphics are acceptable.

### Phase 3 — Pages Router → App Router

**Outcome:** routing in `app/`, still a static export, full strict gate throughout.

1. **Root shell:**
   - `app/layout.tsx` — `<html lang="en">`/`<body>` (from `_document.tsx`), the **9 global stylesheets** (only allowed in the root layout), the GA `<Script>`, and `metadata`/`viewport` exports for the defaults currently in `_app.tsx`'s `<Head>` (title/description per `NEXT_PUBLIC_APP_NAME`, favicon/apple-touch-icon, `manifest`, `theme-color`, viewport; `IS_BETA`→`metadata.robots`). `NEXT_PUBLIC_*` is build-time inlined, so a static `metadata` export reads it correctly.
   - `app/providers.tsx` (`"use client"`) — the `ThemeProviderWrapper → DropZoneProviderWrapper → GeneralProvidersWrapper → ErrorBoundaryRedirect → AppBase` tree plus the three `_app` effects (console.error capture → `logsStore`, window `error` listener, SW registration). Rendered inside `app/layout.tsx` around `children`.
2. **Pages:** each `src/pages/<r>/index.tsx` → `app/<r>/page.tsx` with `"use client"`; co-located CSS moved alongside. `src/pages/index.tsx` (re-exports player) → `app/page.tsx`. `src/pages/404/index.tsx` → `app/not-found.tsx`. `/error` stays a normal route (`app/error/page.tsx`). The 5 `getLayout` pages (composer, vsrg-composer, zen-keyboard, vsrg-player, player) → nested `app/<r>/layout.tsx`.
3. **`next/router` → `next/navigation`** (8 files): `router.pathname`→`usePathname()`; `router.push`/`router.back`→`useRouter()` (navigation); `router.query`→`useSearchParams()` (only `composer/index.tsx`). The two class components keep their functional hook-wrapper, now fed by `next/navigation` hooks. `routeChangeBugFix` (strips `BASE_PATH`) stays.
4. **`router.events` redesign** (no direct equivalent — main behavioral risk):
   - *Analytics page-views* (`AppBase`): a `usePathname()` + `useSearchParams()` effect firing on route change (replacing `beforeHistoryChange`).
   - *Unsaved-changes guard* (composer, vsrg-composer): a `useUnsavedChangesGuard` hook combining `beforeunload` (tab close/reload) with an in-app navigation interceptor that confirms before `<Link>`/programmatic navigations when state is dirty. **Flag for user review** — exact fidelity to the old `routeChangeStart` abort/redirect behavior is the trickiest part.
5. **Metadata:** use **React 19's native `<title>`/`<meta>` hoisting** — `PageMetadata` (~20 pages) renders `<title>`/`<meta>` directly from a client component (no `next/head`); the dynamic `theme-color` `<meta>` in `ThemeProviderWrapper` works the same way. Build-time prerender bakes default (English) titles into the static HTML, matching today's behavior.
6. **`next/link` / `next/image` / `next/script`:** port as-is (all already in modern form). Delete `src/pages/` (incl. `_app.tsx`/`_document.tsx`) once `app/` is complete.
7. **PWA under App Router:** confirm the Serwist worker + `output:'export'` still emits/registers correctly with the `app/` structure (re-run the Phase 1 smoke test).
8. **Gate (Phase 3):** full strict `tsc`; `next build` static export for both targets; all 28 routes present in the export; SW registers; `next dev` navigation works.

## 6. Cross-cutting

- **Env vars:** keep all `NEXT_PUBLIC_*` reads as-is (build-time inlined). `NEXT_PUBLIC_IS_BETA` is read but never set by the build scripts — leave as-is (effectively `false`).
- **Multi-target build:** `scripts/buildApp.js` / `startApp.js` continue to drive Sky/Genshin via env vars and `appData` copy; output dirs unchanged. Verify both targets at each phase gate.
- **Dead config (cleanup, non-blocking):** remove orphaned `@esbuild-plugins/*` devDeps (Phase 1). The CRA-era `package.json` `homepage:"./"` is ignored by Next — leave or drop, no effect.

## 7. Verification strategy

No automated tests. Per-phase **gate = typecheck + build**:

- `tsc --noEmit` (strict; **scoped to exclude the ~15 pixi files during Phase 1 only**).
- `node ./scripts/buildApp.js Sky` and `… Genshin` complete and emit to `build/{skyMusic,genshinMusic}`.
- During Phase 1 the static build relies on temporary `typescript.ignoreBuildErrors` to tolerate pixi-react v7 errors; this is removed at the end of Phase 2 and never used in Phase 3.
- Runtime smoke-testing (loading pages, audio, MIDI, canvases) is performed manually by the user.

## 8. Risks & open items

1. **`@serwist/next` + `output:'export'`** — support not officially asserted; must smoke-test. Fallback: standalone Workbox `injectManifest` script.
2. **`router.events` → unsaved-changes guard** (Phase 3) — no clean App Router equivalent; the `useUnsavedChangesGuard` approach needs review for behavioral fidelity.
3. **pixi async init reordering** (Phase 2) — the synchronous `ref.current.app` texture-cache pattern in 3 canvases is the trickiest mechanical change.
4. **SmoothGraphics removal** (Phase 2) — accept minor visual AA differences vs. enabling `antialias`.
5. **Static-export prerender of pixi** (Phase 2) — canvases must be `ssr:false` dynamic imports so the build doesn't init WebGL.

## 9. Appendix — key file map

- **Shell:** `src/pages/_app.tsx`, `src/pages/_document.tsx`, `src/components/AppBase.tsx`, `src/components/shared/ProviderWrappers/{GeneralProvidersWrapper,ThemeProviderWrapper,DropZoneProviderWrapper}.tsx`, `src/components/GoogleAnalyticsScript.tsx`, `src/components/shared/Miscellaneous/PageMetadata.tsx`, `src/components/shared/Utility/ErrorBoundaryRedirect.tsx`.
- **Router usage:** `AppBase.tsx`, `ErrorBoundaryRedirect.tsx`, `pages/composer/index.tsx`, `pages/vsrg-composer/index.tsx`, `components/pages/Player/PlayerMenu.tsx`, `components/shared/pagesLayout/SimpleMenu.tsx`, `components/pages/SheetVisualizer/SheetVisualizerMenu.tsx`, `components/pages/Index/Home.tsx`.
- **pixi canvases:** `components/pages/Composer/ComposerCanvas.tsx`, `components/pages/VsrgComposer/VsrgComposerCanvas.tsx`, `components/pages/VsrgPlayer/VsrgPlayerCanvas.tsx`.
- **pixi caches:** `components/pages/Composer/ComposerCache.ts`, `components/pages/VsrgComposer/VsrgComposerCache.ts`, `components/pages/VsrgPlayer/VsgPlayerCache.ts`.
- **pixi renderers (~11):** `Composer/RenderColumn.tsx`, `Composer/ComposerBreakpointsRenderer.tsx`, `VsrgComposer/{VsrgKeysRenderer,VsrgScrollableTrackRenderer,VsrgTrackRenderer,VsrgTimelineRenderer,VsrgTimelineBreakpointsRenderer}.tsx`, `VsrgPlayer/{VsrgHitObjectsRenderer,VsrgPlayerAccuracyRenderer}.tsx`.
- **PWA:** `next.config.js`, `src/service-worker.ts`, `src/serviceWorkerRegistration.ts`, `public/manifest.json`.
- **Build:** `scripts/buildApp.js`, `scripts/startApp.js`, `src/Config.ts`.
