# Pro View Composer — Design

Status: IMPLEMENTED 2026-08-21 (phases A–E on new-composer; CONTEXT.md terms landed: Pro
View, Compressed View, Editable Zone, View Lock). Builds directly on ADR-0007 — this is the
"future pure view" that ADR reserved: same absolute Note Number axis, a second view
function beside the Song Grid's.

Sections 6, 7 and 8 carry the notes implementation added to the design; everything else
below is the spec as it was written, and was built as written.

## 1. Goal

A toggleable composer canvas mode (the **Pro View**) that renders the absolute Note Number
axis directly — one row per semitone, every track's notes at their true numbers, notes
editable by tapping the canvas — while the **Compressed View** stays byte-identical. The
song format does not change; a song opens identically in either view.

## 2. Decisions (locked during grilling)

- **Toggle**: a persisted composer setting (`proView`, checkbox, default off), flips live,
  never stored in the song file. Ships for both games, desktop and mobile.
- **Axis**: chromatic rows over the game's full addressable span — every instrument's
  addable numbers at every Basepoint — plus visual padding; widened only when the loaded
  song holds outlier numbers (nothing is ever off-axis, clamped, or hidden).
- **Row height fixed, no vertical zoom**: the game's base layout (`perColumn`: 21/15 rows)
  plus padding fits the notes region's height. Note size never changes across layers.
- **View Lock** (default locked): frame pinned to the current track's Editable Zone,
  centered, no vertical scrolling; wheel and drag keep today's exact meanings. Unlocked
  (button in the right CanvasTool column): drag pans 2D, wheel STAYS horizontal,
  flick/coast stays horizontal-only. Re-locking eases back to the zone; layer switches
  ease to the new zone in either mode (unlocked stays unlocked).
- **Editable Zone**: two horizontal lines at the current layer's min/max addable numbers
  (instrument + effective Basepoint); overlay dims everything outside; in-zone rows with
  no button are striped and inert. All notes always visible — other layers' and stranded
  ones render dimmed under the overlay, never hidden. The zone follows Basepoint changes
  and instrument swaps immediately.
- **Tap = edit only**, never column selection or centering: toggles YOUR layer's note on
  addable cells (other layers never block); tap on your own stranded note deletes it
  (the canvas is the strand-cleanup surface); inert elsewhere. Long-press on your own
  note opens the existing duration popover. Canvas edits share the keyboard press code
  path — same sound preview, same playback-state rules, same undo history. (Amended in
  implementation, adjudicated — §7 has both: the canvas snapshots undo history where the
  keyboard's toggle never has, and a covered cell's tap is inert without the keyboard's
  preview sound.)
- **Playhead at 1/4 canvas width** (Pro View only; Compressed keeps center).
- **Layout**: sticky top bar = mini-timeline strip + its breakpoint buttons, nothing else
  moves up. Left column (play + roster) and right column (canvas tools + the new View
  Lock button) unchanged. Tempo changers stay at the bottom, always visible, aligned
  under the right column. Canvas fills the remaining height.
- **Row-label strip**: sticky vertical strip at the canvas' left inside edge (VSRG-style).
  Button rows show the current keyboard's label in the user's `noteNameType` wording
  (exactly what the key shows); no-button rows show a faint absolute pitch name (C♯4).
- **Keyboard overlay**: keyboard sits below the viewport as a faded, barely-visible sliver
  that still flashes active notes; tapping it raises it over a plain faded backdrop (no
  blur); the first tap on the canvas dismisses it and is SWALLOWED (never also edits);
  the recording-audio state replaces the overlay's content.
- **Scope fence**: no accidental-true MIDI import, no note dragging/moving, no vertical
  zoom, Compressed View untouched (centered playhead, bottom timeline, all behavior).

## 3. Current state being replaced (Pro-View-side only)

`ComposerRenderer` draws `perColumn` Song-Grid rows per column
(`COMPOSER_NOTE_POSITIONS[row] * height / NOTES_PER_COLUMN`), one fixed-height canvas
(45vh·scale notes region + timeline strip at the BOTTOM), playhead fixed at the canvas'
horizontal center with columns moving under it, and pointer input meaning column
select / drag / flick / coast only. Notes are edited exclusively through
`ComposerKeyboard` below the canvas; tempo changers render under it. None of this
changes while `proView` is off.

## 4. View model — the formulas

All in one new pure module `src/lib/components/pages/Composer/proViewGeometry.ts`
(pixi-free, importable from vitest, same discipline as composerCanvasGeometry.ts):

- **Addressable span**: `lo = min over INSTRUMENTS of min(getSoundingTable(i))`,
  `hi = max over INSTRUMENTS of max(getSoundingTable(i)) + 11` (Basepoint offsets are
  0..11 upward). Assigned buttons are already in the sounding tables (their nominal).
- **Axis**: `axisMin = min(lo, lowest song number) − AXIS_PADDING_ROWS`,
  `axisMax = max(hi, highest song number) + AXIS_PADDING_ROWS`, `AXIS_PADDING_ROWS = 3`.
  Recomputed on song load and on structure changes (outliers can be deleted; axis may
  shrink back — acceptable, it only varies for already-weird files).
- **Rows**: row index `r(n) = axisMax − n` (row 0 on top, pitch rises upward).
  `rowHeight = notesRegionHeight / (perColumn + 2)` (the “+2” is the framing padding).
- **Camera**: `y(n) = r(n) * rowHeight − cameraY`. Locked:
  `cameraY = (r(zoneMax) + r(zoneMin) + 1) / 2 * rowHeight − notesRegionHeight / 2`,
  clamped to `[0, axisRows*rowHeight − notesRegionHeight]`. Unlocked: cameraY free within
  the same clamp. Both lock transitions and layer switches ease cameraY (reuse the
  existing ease timing).
- **Editable Zone** for the current layer: `offset = basepointOffset(effectiveTrackPitch
(instrument, songPitch))`; `zone = {t + offset : t ∈ getSoundingTable(name)}`;
  lines at `max(zone)` (top) and `min(zone)` (bottom); addable rows are exactly `zone`'s
  rows; `numberToButton(name, pitch, n)` answers taps (−1 ⇒ inert or strand-delete).
- **Playhead**: `playheadX = width * 0.25` in Pro View (0.5 in Compressed); the
  `containerX = playheadX − scrollPosition * columnWidth` formula is otherwise unchanged.
- **Absolute names**: add `noteNameForMidi(n)` (C♯4-style; octave = `floor(n/12) − 1`) —
  no such helper exists yet; it lives in noteIds.ts beside `isAccidentalMidi`.

## 5. Settings & state

- `BaseSettings.ts`: add `proView: SettingsCheckbox` (name `composer_pro_view`, category
  `composer_settings`, `songSetting: false`, `value: false`); bump the composer
  `settingVersion` (73 → 74; stored settings reset to defaults — house rule).
- View Lock is EPHEMERAL UI state, not a setting: every composer mount starts locked.
- Keyboard overlay raised/lowered: ephemeral, starts lowered.
- i18n: new keys (setting name/tooltip, View Lock labels/tooltips, overlay hints) in
  `src/lib/i18n/locales/en/index.ts`, mirrored into the 9 `static/locales/*.json` with
  English text (translation deferred, same as the changelog precedent).

## 6. Renderer changes (ComposerRenderer.ts + ComposerCache.ts)

One renderer, two view functions — no fork. `proView` enters ComposerRendererState as a
scalar (read in ComposerCanvas.svelte's $effect object, per that file's dependency rule).

- **Note placement**: compressed keeps `gridRowForNumberCached` + COMPOSER_NOTE_POSITIONS;
  pro places at `y(number)` with per-column vertical culling (only rows inside the camera
  window get sprites; the column-view pooling stays as is).
- **Textures**: pro cell size is `(columnWidth, rowHeight_pro)` — the ComposerCache
  instance is rebuilt on mode flips exactly as it is on resize today; same
  `noteTextureKey` statuses. Own-layer strands reuse the accidental-marked look; the
  '♯/♭ nearest-row' compression trick is NOT used in pro (a number IS its row) — the
  accidental texture variants simply mark strandedness there.
- **New draw layers** (bottom→top): octave striping + no-button row striping (one
  Graphics, redrawn on camera/zone/theme change) → notes → out-of-zone overlay (two
  translucent rects) + the two zone lines → playhead → row-label strip (leftmost,
  screen-fixed x, tracks cameraY; pixi Text pooled per visible row) → timeline strip.
  AS BUILT the striping is not one canvas-wide Graphics but each COLUMN's own tail
  Graphics — the only place in the pooled scene that sits between a column's background
  and its notes, since a column view's children are a fixed prefix plus note sprites drawn
  in array order. The consequence is accepted rather than worked around: the bands stop
  where the song's columns stop, so the empty canvas past the last column stays unruled.
- **A camera move REPAINTS the drawn window** rather than translating the container, and
  that is not an implementation detail: notes are painted at `y(number) − cameraY` and
  culled against the window, so a column view that stayed on screen holds sprites at the
  old offset and none at all for the rows that just entered; translating would also move
  the notes region's hitarea (`0..height` in container space) away from the pointer. The
  repaint costs what one note edit costs and only runs while a camera ease is running.
- **Timeline strip at TOP** in pro: strip y = 0, notes region below it
  (`composerCanvasGeometry` gains the pro branch; `onGeometryChange` reports a
  `timelineTop` flag so ComposerCanvas.svelte pins the DOM button row at top:0).
- **Playhead** uses the 0.25 fraction in pro (constant beside COMPOSER_PLAYHEAD_CONFIG).
  As built it is one constant PAIR, `PLAYHEAD_X_FRACTION = {compressed: 0.5, pro: 0.25}`,
  so the Compressed View's centre is written down in the same place as the Pro View's
  quarter rather than staying an unnamed 0.5 the pro branch is compared against.
- **Canvas height** in pro: the notes region fills the viewport height left over by the
  top strip inside `.top-panel-composer` (body height − composer paddings − strip), via a
  pro branch in composerCanvasSize/composerCanvasCssSize (the placeholder must not jump,
  same discipline as today; mobile uses the same vh caveats already documented there).

## 7. Input routing

- **Locked**: the existing pointer/wheel/flick/coast machinery byte-identical, except the
  CLICK outcome: where compressed's settled tap means selectColumn, pro's tap resolves
  `(column, row→number)` and dispatches the edit rules below. Wheel horizontal always.
- **Unlocked**: pointer drags gain dy → cameraY (clamped); dx path unchanged;
  flick velocity measured horizontally only (release with vertical motion just stops);
  a Catch still never edits (existing rule).
- **The drag slop is EITHER-AXIS, and only in pro.** A press that travelled more than
  DRAG_SLOP_PX in x OR y stops being a tap and cancels the pending long press — recorded
  even while the frame is locked, where the vertical half moves nothing, because a press
  that visibly travelled is not a hold in either state. The Compressed View keeps the
  horizontal-only test it always had: there a stray vertical wander still clicks, and
  making it not click would have been a regression in the view this feature must not
  touch. (Same threshold, not a new one — spec §12.)
- **Tap dispatch** (new renderer callback `onCellTap(column, number)` → Composer.svelte):
  1. keyboard overlay raised → dismiss, swallow;
  2. own-layer note at (column, number) → remove (stranded included — this is delete);
  3. `numberToButton ≥ 0` → toggle add via the shared path;
  4. otherwise inert.
- **The shared path**: Composer.svelte extracts the core of `toggleNoteImmediate` into a
  `toggleNoteInColumn(columnIndex, button)` both the keyboard press and the tap call:
  same preview sound, same history push, same playback-state behavior. Canvas edits do
  NOT move `song.selected`.
- **A cell tap requires a press THIS CANVAS recorded** (as built). pixi hit-tests a
  page-wide pointerup against the canvas by coordinate, so a release over the canvas that
  STARTED on a DOM element above it still arrives at the stage handler — the sheet's
  backdrop div does not swallow releases by covering the canvas. In the Compressed View
  that release has always selected a column and still does; in the Pro View it would have
  been an EDIT, so the pro branch also asks that a press was recorded here (found and
  fixed in phase D).
- **The undo snapshot is taken at the canvas dispatch site only** (as built).
  `addToHistory` is the tools panel's compound entry and the composer keyboard has never
  pushed one for a plain note toggle; moving the push into the shared path would have
  changed what a keyboard press does. So canvas gestures are undoable, keyboard toggles
  are unchanged, and an inert tap pushes nothing.
- **A tap on a cell covered by an own-layer span is inert WITHOUT sound** (as built). The
  keyboard previews the note on a covered press (it is a performance as well as an edit);
  a canvas tap is only an edit, so the covered case returns before the preview rather than
  playing a note it will not write.
- **Long-press** (same threshold the keyboard uses) on an own-layer note →
  `onCellLongPress(column, number, screenRect)` → ComposerDurationPopover, which gains a
  virtual-rect anchor beside its HTMLElement one.
- **View Lock button**: fifth CanvasTool in the right column (pro only), toggles
  locked/unlocked, icon swap + tooltip.

## 8. Layout / DOM (Composer.svelte + App.css + ComposerKeyboard.svelte)

`.composer-grid` gains a `composer-grid-pro` modifier class:

- `.top-panel-composer` stretches to the full leftover height; the canvas wrapper fills it.
- Keyboard: `.composer-keyboard-wrapper` becomes a fixed bottom sheet —
  lowered = translated down to a faded sliver (still mounted, still flashing active
  notes; tapping it raises), raised = translateY(0) above a plain rgba backdrop div
  (click → dismiss). Transitions are transform/opacity only.
  **Recording audio force-raises the sheet** for as long as the recording runs, whatever
  the user last tapped: the recording UI REPLACES the keyboard's content (§9) and carries
  the only control that stops the recording, so the sheet is `raised || isRecordingAudio`.
- Tempo changers: in pro they render in their own always-visible slot aligned under the
  right CanvasTool column (outside the overlay); compressed keeps them where they are.
  TWO NOTES FROM BUILDING IT:
  - they were already SIBLINGS of `.composer-keyboard-wrapper` inside ComposerKeyboard
    rather than children of it, so lowering the sheet would not have taken them down;
    the extraction into ComposerTempoChangers still earned its keep, because as a sibling
    of the KEYBOARD they still disappeared with its error and recording branches, and
    only a slot outside it can be stacked above the sheet's backdrop.
  - "aligned under the column" became a GRID ROW OF that column in phase E's mobile pass:
    floated into the window's corner they were pinned to the window while the tools packed
    down from the top, and on a landscape phone the two met — the tempo buttons covered the
    View Lock. As the column's sixth row they cannot overlap at any window height (the
    tools shrink toward them instead), which also gives the column a definite height it
    otherwise lacked.
- The `song-info` overlay must not collide with the sliver (move it up by the sliver's
  height in pro). It still overlaps the row-label strip's lowest labels at phone widths,
  which is accepted: moving it left would put it under the mobile hamburger instead.
- Mobile (`max-width: 1000px` block): same structure; the sliver/backdrop pattern is
  already a bottom-sheet idiom; verify the canvas vh math against the URL-bar caveats
  documented in composerCanvasGeometry.
  **The left canvas chevron is inset by the row-label strip's width** — `.canvas-buttons`
  is `display: none` on a fine-pointer desktop and appears exactly on the coarse-pointer
  and narrow layouts, where a 45px column-select button drawn from the canvas' left edge
  would stand on the labels; it starts at `proStripWidth(rowHeight)` instead.
  **Portrait is not a Pro View question**: the app covers any portrait viewport with its
  own `.rotate-screen` overlay (`@media screen and (orientation: portrait)`, App.css), in
  both views and on every route, so the phone case that matters is landscape.

## 9. Cross-cutting behaviors

- **Basepoint change**: notes rewrite (ADR-0007) AND the zone moves by the same interval,
  so locked framing follows automatically on the next paint; undo restores both.
- **Instrument swap**: zone + strip labels recompute from the new instrument; camera
  eases to the new zone.
- **Layer switch**: statuses recolor (existing), zone/strip/framing follow.
- **Recording audio**: overlay content swaps to the recording UI (as the keyboard does
  today); canvas taps stay live.
- **Theme**: new draw layers subscribe through the existing theme channel (striping,
  overlay, lines, strip text all from ThemeProvider colors).

## 10. Verification

- Existing suites green for BOTH games (`npm test`), check + lint — Compressed View
  regression gate; the ADR-0007 parity fixtures must not change.
- New vitest units (pure, on proViewGeometry + noteIds additions): axis span per game
  (bounds, padding, outlier extension/shrink), zone per (instrument, Basepoint)
  including assigned-button instruments (drums, Ukulele chords) and per-track overrides,
  camera centering + clamps (locked, small instrument, axis edges), tap resolution
  (row→number→button; strand-delete; other-layer non-blocking), `noteNameForMidi`,
  strip label resolution (button wording vs faint absolute).
- Renderer/DOM smoke via the browser-driving recipe (headless chromium, settings
  pre-seeded with `proView: true`): screenshots of locked/unlocked, zone move on
  Basepoint change, layer switch ease, keyboard raised/dismissed, top timeline, both
  games, light + dark theme; a tap-edit followed by undo asserted through the exported
  song JSON.

## 11. Phases (each ends green; worktree agents)

- **A — domain**: proViewGeometry.ts + noteIds additions (`noteNameForMidi`) + settings
  entry/version bump + all pure tests. No UI change; suites green with `proView` unused.
- **B — geometry & layout**: pro branches in composerCanvasGeometry (full-height canvas,
  top strip) + Composer.svelte/App.css restructure behind the setting (overlay skeleton,
  tempo-changer slot, View Lock button placeholder). Compressed untouched with the
  setting off; smoke screenshots both modes.
- **C — renderer**: pro view function in ComposerRenderer (rows, camera, culling,
  striping, zone lines/overlay, 1/4 playhead, row-label strip, top timeline strip),
  locked framing + eases. Input still view-only (no tap edits yet). Smoke.
- **D — input**: tap dispatch + shared toggle path extraction, long-press popover anchor,
  unlocked 2D drag + View Lock behavior, overlay raise/dismiss/swallow. Unit +
  interaction tests; smoke with edits + undo.
- **E — polish**: i18n keys + locales mirror, changelog entry, mobile pass, docs sync
  (spec status flip; CONTEXT.md already carries the terms), final both-game suites +
  full smoke sweep.

## 12. Risks & mitigations

- **Compressed regression** while threading `proView` through the renderer → every pro
  branch behind one boolean read at the top of the affected paths; suites + parity
  fixtures as the gate; phase B/C diffs reviewed against "setting off = no-op".
- **Pixi Text cost in the strip** (~26 visible labels, re-set on camera move) → pool the
  Text objects, update only on visible-row-set changes, never per frame.
- **Gesture ambiguity** (tap vs drag vs long-press on touch) → reuse the existing
  click-threshold + Catch rules verbatim; long-press uses the keyboard's threshold; no
  new thresholds invented.
- **Mobile viewport math** (URL bar vs full-height canvas) → the vh caveats are already
  documented in composerCanvasGeometry; the pro branch states its formula there and the
  smoke run covers a mobile-size viewport.
- **Texture/cache churn on mode flip** → mode flip = one cache rebuild, same as a resize
  today; no per-frame allocation.

## 13. Out of scope (deferred, stated in ADR-0007 or grilling)

Accidental-true MIDI import + Basepoint inference; note dragging/moving and edge-resize
(the long-press popover is v1's span editor; edge-grab can layer on later); vertical
zoom; 2D flick/coast; per-song view memory; Compressed View playhead reposition.
