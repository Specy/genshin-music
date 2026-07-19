# App Router migration handoff

## Status

The static site now uses the Next App Router. The migration work is committed on
`migration/next16-react19`:

- `895c1350` test: add app router migration contracts
- `a83831db` chore: acknowledge TypeScript 6 deprecations
- `450ed1d2` feat: add guarded app navigation
- `954a54ef` refactor: migrate static site to app router
- `e86002a5` fix: support static app router exports

## What changed

- Moved all route implementations from `src/pages` to private client page
  modules under `src/app/_client-pages` and added App Router route wrappers.
- Replaced `_app` and `_document` with the App Router root layout, providers,
  metadata, global error, and not-found boundaries.
- Replaced Pages Router navigation and `next/head` usage with App Router
  navigation, metadata, and guarded links.
- Preserved the editors' unsaved-change flow through one shared leave-handler
  seam, including browser unload protection.
- Kept Sky and Genshin as independent static exports at
  `build/skyMusic` and `build/genshinMusic`.

## Verification performed

- `node scripts/checkAppRouterMigration.mjs source`
- `node --test src/app/_navigation/leaveGuard.test.ts` (3 passing tests)
- `./node_modules/.bin/tsc.cmd --noEmit --incremental false`
- `npm run build:sky` plus export contract validation
- `npm run build:genshin` plus export contract validation
- Browser smoke checks with no console errors on `/composer`,
  `/vsrg-composer`, `/vsrg-player`, `/privacy`, and
  `/blog/posts/how-to-use-composer`.

## Migration issues fixed during verification

- Corrected moved global-font URLs in `App.css`.
- Isolated stale Pages Router generated types so they are not part of the App
  Router build type program.
- Added explicit generated type paths to `tsconfig.json`.
- Made App Router pathname/search-param reads null-safe and wrapped the client
  shell in `Suspense` for static prerendering.

## Remaining notes

- Next emits existing warnings about the Serwist wrapper's config keys and a
  sibling lockfile when building. Both branded static builds completed despite
  them; they are a separate configuration cleanup, not an App Router blocker.
- The user-owned dirty files present before migration were preserved and were
  not staged: `next-env.d.ts`, `package.json`, `package-lock.json`,
  `public/manifest.json`, and `.claude/`.
