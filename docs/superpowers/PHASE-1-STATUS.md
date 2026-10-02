# Phase 1 Status — Next 16 + React 19 + Serwist

Phase 1 complete on branch `migration/next16-react19`.

## Stack

- Next.js 16.2.9
- React 19.2.7
- @serwist/next 9
- Build command: `next build --webpack` (via `package.json` `build` script)

## Gate results (2026-06-25)

| Check                                | Result                                                           |
| ------------------------------------ | ---------------------------------------------------------------- |
| `tsc --noEmit`                       | 1 error, in `VsrgPlayerCanvas.tsx` only (expected pixi breakage) |
| `node ./scripts/buildApp.js Sky`     | PASSED — `build/skyMusic/service-worker.js` present              |
| `node ./scripts/buildApp.js Genshin` | PASSED — `build/genshinMusic/service-worker.js` present          |

## Known broken until Phase 2

The following pages and files are broken at runtime (pixi canvas):

**Pages:**

- `/composer`
- `/vsrg-composer`
- `/vsrg-player`

**Files with expected `tsc` errors (import `@pixi/react`, `pixi.js`, or `@pixi/graphics-smooth`):**

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
- `src/components/pages/VsrgPlayer/VsrgPlayerCanvas.tsx` ← only file with active `tsc` error
- `src/components/pages/VsrgPlayer/VsgPlayerCache.ts`
- `src/components/pages/VsrgPlayer/VsrgHitObjectsRenderer.tsx`
- `src/components/pages/VsrgPlayer/VsrgPlayerAccuracyRenderer.tsx`

## Temporary measures to undo in Phase 2

- `typescript.ignoreBuildErrors: true` in `next.config.js`
- Three `dynamic(..., { ssr: false })` canvas wrappers (one per canvas page)
- Duplicated `defaultVsrgPlayerSizes` in `src/pages/vsrg-player/index.tsx`
- `--legacy-peer-deps` required for npm installs

## Manual follow-up for user

Dev smoke testing is out of scope for CI. Before merging to main:

1. Serve `build/genshinMusic` (or `build/skyMusic`) locally:
   ```
   node ./scripts/startApp.js Genshin
   ```
2. Open DevTools → Application → Service Workers and confirm `service-worker.js` activates and a runtime cache fills on navigation.
3. Smoke the non-pixi pages: `/` (player), `/blog`, `/theme`, `/keybinds`.
4. Confirm the 3 canvas pages (`/composer`, `/vsrg-composer`, `/vsrg-player`) fail gracefully (expected in Phase 1).

Phase 2 will upgrade to `@pixi/react@^8` + `pixi.js@^8`, rewrite the canvas components and cache classes, remove `typescript.ignoreBuildErrors`, and restore a fully green typecheck.
