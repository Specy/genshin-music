# App Router migration design

**Date:** 2026-07-19
**Status:** approved for implementation planning
**Scope:** migrate the fully static Next.js application from the Pages Router to the App Router while preserving the current Sky/Genshin export model and user-visible behavior.

## 1. Goals and boundaries

### Goals

- Serve every existing application route from `src/app/` rather than `src/pages/`.
- Keep `output: 'export'`, the two target builds, the current base-path behavior, Serwist, and static assets unchanged.
- Preserve the client application shell: theme, drop zone, global providers, logging, service-worker registration, analytics, and error redirect behavior.
- Preserve Pixi's client-only boundaries and the current renderer sizing fixes.
- Replace Pages Router APIs with App Router APIs without weakening the Composer or VSRG Composer unsaved-work flow.
- Improve the static HTML metadata available at build time while retaining locale- and song-dependent client updates.

### Explicit non-goals

- No Tauri refactor, deletion, or build change.
- No redesign of the UI, stores, Pixi canvases, audio layer, persistence layer, or i18n architecture.
- No server data fetching, server actions, API routes, middleware/proxy, dynamic route parameters, or deployment-model change.
- No browser-history monkeypatch that tries to recreate the removed `router.events` API.
- No change to the user's existing unstaged migration work other than conflicts that are strictly necessary for the App Router port.

## 2. Baseline

The app has 28 static Pages Router entry points, no `getStaticProps`, `getStaticPaths`, or `getServerSideProps`, and browser-owned data in localStorage, IndexedDB, Web MIDI, audio, and Pixi. This makes a client-first App Router port appropriate: the App Router supplies the route shell and static output, while interactive route bodies remain Client Components.

The current `next.config.js` must retain:

- `output: 'export'`
- target-specific `distDir` via `BUILD_PATH`
- target-specific `basePath`
- unoptimized images
- Serwist's manual service-worker registration and the `next build --webpack` build command

The two products must continue to export to `build/skyMusic` and `build/genshinMusic`.

## 3. Route and component structure

### Root shell

`src/app/layout.tsx` replaces `src/pages/_app.tsx` and `src/pages/_document.tsx` for App Router routes. It is a Server Component and owns:

- `<html lang="en">` and `<body>`
- all global CSS and Sass imports that previously lived in `_app.tsx`
- default Sky/Genshin title, description, icons, manifest, robots, theme color, and viewport metadata
- `GoogleAnalyticsScript`
- the client `Providers` boundary around route children

`src/app/providers.tsx` is a Client Component. It preserves the current provider order and initialization behavior:

```text
ThemeProviderWrapper
  -> DropZoneProviderWrapper
    -> GeneralProvidersWrapper
      -> NavigationProvider
        -> ErrorBoundaryRedirect
          -> AppBase
          -> route children
```

It also keeps the existing effects for console error capture, window error logging, virtual-keyboard setup, and Serwist registration.

### Route entry points

Each route receives a small Server Component `page.tsx` that imports the corresponding Client Component. The former Pages Router entry implementations move together into `src/app/_client-pages/`, a private App Router folder that mirrors the old tree and is ignored as a route surface. This preserves the client-heavy screens, their relative imports, and their CSS modules without turning every public route file into a large compatibility wrapper. The server wrapper provides static `metadata` where the title/description is known at build time; the client component retains hooks, classes, browser APIs, and local-data initialization.

Global styles also move under the private client-page tree and are imported by `app/layout.tsx`. No `src/pages` directory remains after the migration. This private boundary exists for routing correctness and to keep the client implementation reusable by the root and `/player` route wrappers; it is not a new application layer.

| Current URL | App Router target |
| --- | --- |
| `/` and `/player` | one shared Player Client Component, rendered by `app/page.tsx` and `app/player/page.tsx` |
| `/composer` | `app/composer/page.tsx` plus Composer Client Component and Composer background wrapper |
| `/vsrg-composer` | `app/vsrg-composer/page.tsx` plus VSRG Composer Client Component and Composer background wrapper |
| `/vsrg-player` | `app/vsrg-player/page.tsx` plus VSRG Player Client Component and Main background wrapper |
| `/zen-keyboard` | `app/zen-keyboard/page.tsx` plus Main background wrapper |
| ordinary static pages | matching `app/<route>/page.tsx` plus Client Component |
| `/blog` and its post pages | matching nested `app/blog/.../page.tsx` files |
| former `pages/404` UI and unmatched paths | `app/not-found.tsx` |
| `/error` | preserved as normal `app/error/page.tsx` route |

The former `getLayout` properties are removed. Their `AppBackground` wrapping moves into a focused route layout or route wrapper, preserving the existing `Main` versus `Composer` background selection without adding a new visual hierarchy.

Pixi route clients retain their existing `dynamic(..., { ssr: false })` imports. No canvas code is moved into a Server Component.

## 4. Metadata and document behavior

The root layout exports build-time metadata derived from `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_BASE_PATH`, and `NEXT_PUBLIC_IS_BETA`. It replaces the default `<Head>` content from `_app.tsx` and `_document.tsx`.

Static route wrappers declare static page metadata for the initial exported HTML. This preserves search-engine and sharing metadata for routes whose copy is known at build time. Route bodies still need dynamic titles for localized copy and locally loaded song names. `PageMetadata` therefore stops importing `next/head` and renders native React `<title>` and `<meta>` elements instead. React places those elements in the document head and updates them after hydration.

`ThemeProviderWrapper` similarly replaces its `next/head` usage with a native theme-color meta element so the active theme continues to update the browser chrome.

## 5. Navigation contract

### App Router APIs

All `next/router` imports are removed from App Router code.

- `useRouter` comes from `next/navigation` only when programmatic navigation is needed.
- `usePathname` replaces `router.pathname`.
- `useSearchParams` replaces Composer's `router.query` access.
- Analytics observes pathname and search-param changes instead of subscribing to `router.events`.
- `ErrorBoundaryRedirect` receives an App Router navigation adapter instead of a `NextRouter` instance.

### Guarded navigation

The Pages Router's global route events are not available in the App Router. A small `NavigationProvider` creates an explicit replacement contract instead of emulating event internals:

1. The active editor registers one asynchronous leave handler that resolves to allow or cancel a navigation.
2. `AppLink` becomes the common internal-link component. It uses `next/link`'s `onNavigate` callback to cancel the immediate transition, invokes the active handler, then performs the App Router navigation only when allowed.
3. Direct same-origin `next/link` usages are migrated to the guarded component. External links retain their normal behavior.
4. A `useAppNavigation` hook wraps `push`, `replace`, and the application's visible Back actions so programmatic navigation uses the same handler.
5. Composer and VSRG Composer retain their existing autosave, save/discard/cancel dialog, and post-save navigation logic, but no longer throw route-change errors or subscribe to router events.

The Composer's existing `beforeunload` protection remains. The VSRG Composer keeps its current behavior unless it already owns a document-unload guard.

The browser toolbar's Back/Forward controls are not intercepted with a custom `popstate` shim. App Router does not offer a supported cancellable global navigation event, and a history monkeypatch would be less reliable than the current application-level contract. App-controlled links, programmatic navigation, and visible in-app Back controls are protected.

## 6. Error handling

- `ErrorBoundaryRedirect` remains the primary client failure path and continues to log then navigate to `/error` outside localhost.
- `app/error/page.tsx` remains the existing normal error-information route; it is not confused with App Router's special `error.tsx` file.
- `app/not-found.tsx` renders the existing `pages/404` UI for unmatched static paths. It deliberately replaces the former `/404` route: a static export has one `404.html` artifact, so a separate normal `/404` page would conflict with the not-found output.
- `app/global-error.tsx` is a minimal Client Component with its own `<html>` and `<body>`, an accessible fallback, logging, and retry. It covers failures above the root provider/layout boundary where the existing client error boundary cannot run.

## 7. Static-export constraints

The migration must remain entirely compatible with static export:

- Server wrappers use only build-time environment values and static metadata.
- Client components access browser APIs only during rendering paths already guarded for browser execution or in effects.
- No request-bound APIs such as `cookies`, `headers`, redirects, rewrites, or server actions are introduced.
- Every route remains statically enumerated; no `generateStaticParams` work is needed.
- `next.config.js`, the service worker, and target build scripts remain compatible with `next build --webpack`.

## 8. Verification strategy

No broad new test framework is introduced. The migration is accepted only when all of the following are true:

1. `npx tsc --noEmit` passes with no new type errors.
2. `node ./scripts/buildApp.js Sky` completes and emits the expected static pages, manifest, and `service-worker.js` under `build/skyMusic`.
3. `node ./scripts/buildApp.js Genshin` completes and emits the equivalent output under `build/genshinMusic`.
4. A route-manifest check confirms that every former static route has an exported App Router artifact, including the nested blog posts and the custom `404.html` not-found output.
5. A served production build smoke-tests root/player, a normal static page, a nested blog post, `/composer`, `/vsrg-composer`, `/vsrg-player`, `/error`, and an unknown route.
6. The three Pixi routes render with no runtime console failure and retain responsive canvas sizing.
7. Composer and VSRG Composer each prove cancel, discard, and save-before-leave behavior through an internal navigation action.

The browser smoke test is intentionally focused: it catches client-only routing and WebGL regressions that typechecking and static export cannot observe.

## 9. Acceptance criteria

- There is no remaining `src/pages` Pages Router tree or `next/router`/`next/head` dependency in the application route surface.
- App Router routes preserve every application URL, including `/` and `/player` sharing the Player experience; the former `/404` UI becomes the static host's custom `404.html` fallback.
- Both target builds remain static and deploy to their existing output folders.
- Serwist still registers from the exported build, and Pixi remains client-only.
- The migration does not alter Tauri or overwrite unrelated unstaged changes.
- Typecheck, both static builds, generated-route checks, and focused browser smoke tests pass.
