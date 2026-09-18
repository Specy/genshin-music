# Composer On-Demand Rendering Design

## Problem

The standard composer owns two PixiJS `Application` instances: one for the note columns and one
for the timeline. Both are initialized without an `autoStart` option. PixiJS 8.19 therefore uses
its default `autoStart: true`, attaches `Application.render` to a dedicated ticker, and renders
both unchanged scenes on every animation frame while the composer is mounted.

This is separate from Svelte reactivity. `ComposerCanvas.svelte` already calls
`ComposerRenderer.update()` only when one of its tracked inputs changes. A selected-column change
is a legitimate invalidation and must continue to rebuild and repaint the scene once.

## Scope

Only the standard composer renderer changes. The VSRG composer and VSRG player have different
animation and interaction requirements and are outside this fix.

## Design

Initialize both composer Pixi applications with `autoStart: false`. The renderer remains the sole
owner of its imperative Pixi lifecycle.

`ComposerRenderer.draw()` already centralizes every scene update:

- Svelte state changes arrive through `update()`;
- cache and size changes call `draw()` after regeneration;
- theme changes flow through the cache-and-size recalculation path.

After rebuilding the notes and timeline scenes, `draw()` will call `render()` exactly once on each
application. No ticker will be started. Pointer handling remains managed by Pixi's event system,
which is independent from each application's render ticker.

This preserves the existing immediate update semantics while removing idle GPU rendering. It does
not introduce an additional scheduler, dirty flag, animation frame, or Svelte state.

## Regression Contract

A focused Vitest test will replace Pixi with behavioral fakes:

1. A fake application simulates Pixi's default continuous ticker whenever `autoStart` is not
   explicitly false.
2. Both application initializations must receive `autoStart: false`.
3. Calling `update()` must render the notes application once and the timeline application once.
4. Advancing fake time while idle must not add render calls.
5. Updating the selected column must add exactly one render call per application.

The test will use real composer state objects and will not use `any`, type assertions, or
TypeScript suppression directives.

## Verification

- Run the focused regression test through a verified red-green cycle.
- Exercise initial paint, column selection, wheel/drag selection, playback, breakpoint changes,
  theme changes, and resizing in the browser.
- Run both game test suites, both Svelte checks, lint, and the Genshin production build.
- Have an independent reviewer inspect the scoped diff and the evidence.
