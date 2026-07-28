# Phase 2 Migration — Status

**Status:** COMPLETE

## Stack

| Package     | Version |
| ----------- | ------- |
| Next.js     | 16.2.9  |
| React       | 19.2.7  |
| pixi.js     | 8.19.0  |
| @pixi/react | 8.0.5   |

## Gate Results

- `typescript.ignoreBuildErrors` removed from `next.config.js`
- `npx tsc --noEmit` — **zero errors** (fully clean)
- `node ./scripts/buildApp.js Sky` — **completed successfully**; `build/skyMusic/service-worker.js` present
- `node ./scripts/buildApp.js Genshin` — **completed successfully**; `build/genshinMusic/service-worker.js` present

## What Was Migrated (Phase 2 scope)

1. Dependencies: pixi.js v7 → v8, @pixi/react v7 → v8, dropped @pixi/graphics-smooth
2. Cache classes rewritten for v8 API: `ComposerCache.ts`, `VsrgComposerCache.ts`, `VsrgPlayerCache.ts`
3. Canvas pages migrated to async `<Application onInit>` pattern: `VsrgPlayerCanvas`, `VsrgComposerCanvas`, `ComposerCanvas` (Sky + Genshin variants)
4. All renderer components: JSX element names updated (`Container`→`pixiContainer` etc.), inline draw calls ported to v8 Graphics API
5. `SmoothGraphics` removed; replaced with v8 native `antialias` option on Application
6. Canvas pages wrapped in `dynamic(()=>import(...), {ssr:false})` — kept for static export correctness (pixi is client-only)
7. TypeScript augmentation for pixi JSX intrinsics confirmed (via `@pixi/react` v8 types)

## Manual Follow-Up Required

The automated gate (`tsc --noEmit` + `next build`) cannot verify canvas rendering. A human must:

1. Run `node ./scripts/startApp.js Genshin` (or `npm run dev:genshin`) and open the app
2. Open the **Composer** page — confirm the piano-roll canvas renders, notes draw, playhead moves
3. Open the **VSRG Composer** page — confirm the lane canvas renders, hits draw correctly
4. Open the **VSRG Player** page — confirm gameplay canvas renders with correct geometry

**Acceptable differences from v7:** minor anti-aliasing changes (SmoothGraphics was dropped in favour of v8 native AA). Geometry, colors, and interactivity must be correct.

Repeat with `node ./scripts/startApp.js Sky` for the Sky variant.
