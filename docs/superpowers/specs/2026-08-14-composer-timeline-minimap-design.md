# Composer Timeline Minimap Design

## Goal

Turn the standard composer's timeline into a useful song overview without adding note traversal,
display-object churn, or texture generation to playback.

## Visual Contract

- The strip contains a static raster preview of the notes currently represented by the composer
  canvas: the current layer plus other visible instruments, in canonical Song Grid pitch rows.
- Current-layer marks are strong, visible secondary layers are dimmer, and stranded notes are
  further dimmed.
- Sustained-note tails are thin, translucent runs behind note heads. They are controlled by the
  source-level `COMPOSER_TIMELINE_MINIMAP_CONFIG.showSustainTails` switch, defaulting to `true`; this
  is deliberately not a persisted user setting.
- Columns with a tempo changer use that changer's configured opaque background colour beneath the
  tails and heads, matching the corresponding column treatment on the notes canvas.
- Breakpoints are full-height lines one timeline column wide with a three-pixel floor. They use the
  exact opaque transformed composer-accent colour as breakpoint markers on the notes canvas. Lines
  at the end are clamped inside the strip. The tools range remains a separate translucent overlay
  and covers its complete inclusive range.
- Notes, breakpoints, tools selection, and the viewport all use `stripWidth / columnCount`. A
  breakpoint marks the leading edge of its column.
- The former 3.2px padding above and below the strip becomes 6.4px of additional minimap height,
  preserving the composer's total height. A dark one-pixel separator spans the full canvas width.
- Only the outer timeline background is rectangular; the visible-viewport outline stays rounded.

## Rendering and Scheduling

The minimap is a single Pixi sprite backed by a generated texture. Its detached `Graphics` source
is built incrementally at column boundaries:

1. tempo-changer background pass;
2. optional sustain-tail pass;
3. note-head pass;
4. one `generateTexture` call;
5. atomic swap with the previous completed sprite.

`requestIdleCallback` schedules the work where available. A 16ms timer fallback uses the same 4ms
and 64-column slice limits. A slice always processes at least one column so a zero idle budget
cannot starve the job. Rapid invalidations cancel obsolete detached geometry and restart from the
latest state.

The previous sprite remains visible throughout generation and resizing. On first load the
background, breakpoints, selection, and viewport appear immediately; notes appear after the first
idle job completes.

## Playback Contract

Starting playback cancels an incomplete build but does not remove or change the completed sprite.
Edits and visibility/theme/geometry changes made during playback only mark the minimap pending.
Stopping playback starts one latest-state idle job. During playback, only existing lightweight
scene state such as the viewport position and immediate overlays can change; no minimap geometry or
texture is generated.

## Invalidations

The static sprite is invalidated by:

- song/column identity or structure version;
- note or span edits;
- current layer;
- instrument roster or visibility;
- theme note colours;
- strip dimensions.

Breakpoints, tools selection, selected column, playback position, and scroll position are not part
of the sprite key.

## Regression Contract

- Builder tests state background/tail/head ordering, one-column progress, layer visibility, and the
  source switch.
- Renderer tests prove a 100-column/three-pass build cannot complete in one fallback slice.
- Renderer tests compare the installed texture by identity to prove it remains frozen throughout
  playback and is replaced exactly once after stopping.
- Existing scene-oracle tests state the shared coordinate system, inclusive selection geometry,
  breakpoint line geometry, viewport geometry, and reclaimed hit area.
