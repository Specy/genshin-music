# Column Ruler — Design

Status: IMPLEMENTED 2026-08-27 (phases A-D, uncommitted on Dev). CONTEXT.md terms landed
(**Column Ruler**, **Ruler Scrub**); ADR-0014 records the scroll decision taken inside this
design. **Read USER REVISION 2026-08-27 at the end before acting on §2's rejections** — one of
them (edge auto-scroll during a Ruler Scrub) was reversed by the user and is now built.

Built as written, with three corrections to the text found during implementation, each marked
AS BUILT below: section 4's "the ladder almost never engages" is wrong at phone widths (a 360px
phone at columnsPerCanvas 50 gives a 6px column, so a 4-column tick is 24px against the 46px need
and the step becomes the bar); section 9's phase A "no UI change" could not be literally true,
since implementing section 4's formulas necessarily reserves the band; and section 10's risk 1
needed TWO fixes rather than one, because the overlay and the cursor flag are moved by different
code paths. A post-implementation pass also made the flag transient (50%-alpha desktop hover,
fully opaque scrub, hidden at rest) and extended every moving Pro row layer through the translucent
ruler band: notes, tails, row shading, column backing, and the left pitch strip and its labels.
Builds on the Pro View spec (2026-08-21) — this adds a third region to the canvas that spec laid
out, and changes nothing about its axis, camera or cell editing.

## 1. Goal

A ~20px band across the top of the Pro View canvas, between the mini-timeline and the notes
region: a **Column Ruler**. Every column on it is pressable — pressing one selects that column,
sounds it, and brings the canvas to it — and it is labelled at intervals with the timestamp each
labelled column begins at. Dragging along it is a **Ruler Scrub**: the canvas holds still, the
selection follows the finger, and each column passed sounds (rate-limited).

The motivating gap is not the timestamps. It is that **the Pro View has no click-to-select-column
at all**: `composerInput.stageReleaseIntent` resolves a settled tap on the notes stage to
`cell-tap` (edit a note) in the Pro View and to `select-column` only in the Compressed View, so
today the only ways to change column in the Pro View are a stage drag, a mini-timeline scrub, or
the keyboard. The ruler is that missing surface; the timestamps are what it is marked with.

## 2. Decisions (locked during grilling)

- **Scope: Pro View only.** In the Compressed View the mini-timeline is at the _bottom_, so
  "below the timeline" does not parse, and a stage tap there already selects the column.
- **Press target: every column.** The whole band is column-addressed at the same x-resolution as
  the notes below. Labels are readings printed on it, not the buttons themselves.
- **Labels: every 4th column, thinned only when they would collide horizontally.** Following the
  finer of the two groupings the canvas already draws (the "larger" background variant at
  `(index + 1) % 4 === 0`) rather than the 12/16 bar-group striping.
- **Label text: timestamp only, `formatMs` m:ss.** Not the column number, not a bar number.
- **Repeats are accepted.** At the default bpm 220 a column is 272.7ms and a 4-column tick is
  1.09s, so labels are just distinct; past roughly bpm 300 two adjacent labels print the same
  string. That is allowed — no distinctness condition on the ladder, no sub-second format.
  (Rejected: thinning until labels differ; switching to `0:06.5` when spacing is tight.)
- **Tap: select + sound + recentre.** Re-tapping the same column sounds it again.
- **Ruler Scrub: the canvas holds still and the cursor follows the finger.** What you touch is
  what you hear. The release settles the canvas on the landed column. (Rejected: the canvas
  moving under the finger like a stage drag, which would put the sounding column at the playhead
  several columns to the left of the fingertip — a contradiction on a surface whose premise is
  "press this piece to hear that column".)
- **Scrub audio is throttled to at most one column per ~50ms.** When the throttle opens, the
  column the finger is on _now_ sounds; columns crossed in between pass silently. A fast sweep is
  a sparse, blurred run through the song rather than ~100 voices in 200ms. (Rejected: a minimum
  dwell, which silences fast sweeps entirely; no limit at all.)
- **The cursor is transient pointer feedback**: it marks an active Ruler Scrub on every device and
  the column under a desktop mouse hover. Hover is 50% opacity; holding the pointer down makes it
  fully opaque, distinguishing a preview from an active scrub. It is hidden at rest and after touch
  release, so it does not duplicate the persistent selection/playhead mark.
- **Height: ~20px, the same on desktop and mobile.** One height, no branch. Accepted knowingly:
  it is under the ~44px touch guideline, mitigated by the band being enormously wide even when
  thin, and by the mini-timeline above remaining the coarse alternative. (Rejected: ~30px on
  mobile to match `composerTimelineHeight`; a thin drawn band with a hit area reaching into the
  notes region, which would steal presses aimed at notes whenever the camera is unlocked.)
- **Name**: **Column Ruler**, gesture **Ruler Scrub**. Not "timeline" — that is the whole-song
  minimap directly above it, and two adjacent things called timelines is how this gets confusing.

## 3. Current state being replaced

Nothing. This is additive: a third region on a canvas that today has two.

Worth stating because it constrains the diff — the Compressed View's canvas, the Pro View's axis,
camera, View Lock, cell editing, duration popover and row-label strip are all untouched, and
`composerCanvasElementHeight`'s sum is the only existing geometry statement that changes.

## 4. View model — the formulas

```
COLUMN_RULER_HEIGHT = 20                       // px, both platforms

composerCanvasElementHeight(notesHeight, timelineHeight, proView) =
    notesHeight + TIMELINE_BAND_PADDING * 2 + timelineHeight
              + (proView ? COLUMN_RULER_HEIGHT : 0)

composerColumnRulerY(timelineHeight) =         // Pro View only; null otherwise
    TIMELINE_BAND_PADDING * 2 + timelineHeight

composerNotesRegionY(proView, timelineHeight) =
    proView ? TIMELINE_BAND_PADDING * 2 + timelineHeight + COLUMN_RULER_HEIGHT : 0

proNotesRegionHeight(bodyHeight, timelineHeight) =                 // one term added
    max(PRO_MIN_NOTES_HEIGHT_PX,
        bodyHeight * (PRO_CANVAS_HEIGHT_VH / 100) - chrome
                   - timelineHeight - COLUMN_RULER_HEIGHT)
```

`composerCanvasElementHeight` gains a `proView` parameter — today it takes none precisely because
the two regions swap places inside a constant sum, and that stops being true here.
`composerCanvasCssSize` must reproduce the new term, or the prerendered placeholder and the live
canvas disagree about the canvas' height (`test/composerCanvasCss.test.ts` is the gate).

**The bill**: genshin's canonical frame is ~36 rows over a ~900px region, so a desktop row goes
24 → 23.4px (−2.4%); a 420px landscape phone goes 11 → 10.5px (−5%).

**Label cadence.** The ladder is `4 → barLength → 2 × barLength → 4 × barLength → …`, where
`barLength = 4 * beatMarks` (12 or 16, already computed in `ComposerRenderer`). Step up while
`labelStep * columnWidth < MIN_LABEL_SPACING_PX`. Deliberately **not** a plain doubling: at
`beatMarks: 3` the stripes are 12 columns wide, so a 4 → 8 step would put every label across a
stripe seam. This ladder keeps every step both a multiple of 4 and aligned to a seam.

In practice the ladder almost never engages — at desktop widths a 4-column tick is 140–350px and
a label needs ~46px including its gutter. What actually forces thinning is tempo, and after the
"repeats accepted" decision, nothing does.

**AS BUILT — that paragraph is wrong about phones.** Desktop at 1920 never steps up at any
`columnsPerCanvas` option, as stated. But a 360px phone at `columnsPerCanvas` 50 gives a 6px
column, so a 4-column tick is 24px against the 46px need and the step becomes the bar (12 or 16).
The ladder is load-bearing on mobile, not a safety net.

**Label anchoring**: `index % labelStep === 0`, so column 0 reads `0:00`. **Known cosmetic
mismatch**: the canvas' existing "larger" background accent is `(index + 1) % 4 === 0`, i.e.
columns 3, 7, 11 — the _last_ column of each beat. So every label sits one column left of the
accent below it. Accepted (they are different markings at different heights); neither moves.

**Ticks**: a minor tick every 4th column, a major tick at each labelled column, and **no
per-column ticks** — at 50 columns/canvas on a phone those are 8px apart and read as a picket
fence, and the notes grid below already draws every column boundary. The transient desktop hover
flag at the addressed column's edge shows the press resolution.

**Timestamps** come from `ComposedSong.columnsDurationMs(0, i)` — the ADR-0008
boundary-differenced grid, offset 0, which is the exact ms the transport commits column `i` at.
**Not** `calculateSongLength`, which accumulates unrounded and is a second implementation. The
ruler and the `song-info` readout at the window's bottom will print the same string for the
selected column, which is a correctness check a user can see.

## 5. Renderer changes (ComposerRenderer.ts)

- A `columnRulerStrip` container at `composerColumnRulerY`, a sibling of `timelineStrip` and
  `notesColumnsContainer`, offset so its contents are written in strip-local coordinates (the
  pattern `timelineStrip` already uses).
- Its content scrolls with the notes: the same `notesColumnsContainer.x` offset, so a tick and its
  column are always at one x. At scroll position 0 the leading 25% of the band is empty, exactly
  as the notes region is — no negative times are drawn.
- **Pooled `Text` objects for the labels**, updated only when the visible label set changes, never
  per frame — the same mitigation the Pro View's row-label strip already applies.
- The cursor flag is hidden with neither scrub nor mouse hover. It draws at 50% opacity for desktop
  hover and full opacity while pressed, at the addressed column's x in both smooth-scroll modes; a
  stationary hover is re-resolved while the canvas moves so the flag remains under the pointer.
- Pro note sprites, sustain tails, octave/inert row backgrounds, the column background, and the left
  pitch strip and its labels use the ruler's height as top bleed. A row is culled only when its
  bottom clears the ruler's top edge, not as soon as it clears the notes region's top edge.
- The left pitch strip draws after the ruler, so its backing and row label remain uninterrupted in
  the ruler's upper-left corner. It is pointer-inert, leaving the ruler's hit surface unchanged.
- Theme colors through the existing `ThemeProvider` channel.
- `onGeometryChange` gains the ruler's own top and height, for the same reason it already reports
  the timeline's: the template must not hold a second copy of the number. The mobile/coarse-pointer
  side chevrons use those reported bounds to cover the ruler plus notes region while their desktop
  bounds remain notes-only.

## 6. Input routing

- `motion` gains a third dragging surface: `{ kind: 'dragging'; surface: 'stage' | 'timeline' |
'ruler'; position }`. **`motion.position` is never written for the ruler surface** — that is the
  whole mechanism of "the canvas holds still", since `syncScrollSchedule` returns at its first
  statement while `kind === 'dragging'` and the frames paint `motion.position`.
- A `rulerPointer` mirroring `stagePointer`, including its one-gesture-at-a-time `id` rule.
- Hit area: the band's own y range, full canvas width. **No `TIMELINE_INSET_*`** — those exist to
  clear the three DOM timeline buttons, which stand over the timeline band, not this one.
- The notes stage needs no exclusion: `testStageHitarea` already rejects `y < 0` in
  notes-region-local coordinates, and the ruler is above the region. But the ruler must be a
  **later child of the stage than the notes container**, so pixi hit-tests it first — the same
  load-bearing child-order rule `testTimelineHitarea` documents.
- Press → select the column under x **with audio**, open the throttle window.
- Move → resolve the column under x; when it changes, `selectColumn(col, /* ignoreAudio */
!throttleOpen)`. Selection tracks every column precisely; only the sounding is sparse.
- Release → `easeTo(state.selected)`, clear `rulerPointer`.

## 7. Cross-cutting behaviors

- **During playback**: free, and needs no branch. `selectColumn` returns before the preview when
  `transport.isRunning` (`Composer.svelte`), so the ruler becomes a silent moving seek and each
  crossing re-anchors — exactly what the notes-stage drag already does.
- **Mute/Solo and Stranded Notes**: free. Previews go through `playSound`, which gates on
  `isTrackAudible` and skips notes the instrument cannot voice.
- **Duration Hold**: a Ruler Scrub moves the selection, so it edits the span one column per column
  crossed. That is CONTEXT.md's documented rule ("from any source"), not an exception to write.
- **Tools multi-select**: with the tools panel open and the clipboard empty, `selectColumn`
  extends the range, so a Ruler Scrub sweeps out a column range for copy/erase. Inherited — the
  stage drag already does this in both views.
- **View Lock / zoom / Basepoint / instrument swap**: no interaction. The ruler is horizontal;
  none of those touch the horizontal axis.
- **Recording audio**: the ruler hides with the notes stage (`isRecordingAudio`), as the stage
  does; the mini-timeline stays up, unchanged.

## 8. Verification

- Existing suites green for both games, check + lint; the ADR-0007 parity fixtures must not move
  (nothing here touches the song format).
- New pure units: the label ladder over every `columnsPerCanvas` option × both `beatMarks` values
  × a range of canvas widths (asserting labels never collide and every step is a multiple of 4
  and seam-aligned); label anchoring puts `0:00` at column 0; timestamps equal
  `columnsDurationMs(0, i)` across tempo changers; the geometry formulas of §4, including
  `composerCanvasCssSize` reproducing the new term (extend `test/composerCanvasCss.test.ts`).
- `test/composerRenderer.test.ts` additions: ruler hit area accepts its band and rejects the notes
  region; a ruler press selects and sounds; a Ruler Scrub leaves `scrollPosition` unchanged for
  its whole duration and the release settles on the landed column; the audio throttle sounds at
  most one column per window while selection tracks every crossing.
- Browser-driving smoke (`proView: true` pre-seeded): the ruler at both games, light + dark, at
  the narrowest and widest `columnsPerCanvas`, at scroll position 0 and at the song's end.

## 9. Phases

- **A — geometry**: `COLUMN_RULER_HEIGHT`, the §4 formulas in `composerCanvasGeometry`, the
  `composerCanvasCssSize` term, the label ladder as a pure function, all pure tests. No UI change.
- **B — renderer**: the strip, ticks, pooled labels, cursor flag, theme wiring,
  `onGeometryChange`. Read-only — no input yet. Smoke screenshots.
- **C — input**: the `ruler` drag surface, `rulerPointer`, hit area and child order, tap and
  Ruler Scrub with the audio throttle, release settle. Renderer + interaction tests.
- **D — polish**: hover highlight, mobile pass, changelog entry, spec status flip.

## 10. Risks & mitigations

- **The mark must repaint while the canvas holds still.** `update()` deliberately suppresses
  overlay/mark repaints while `motion.kind === 'dragging'`, because during a stage drag the
  canvas is moving and painting the mark early puts it on the new column against old pixels. A
  Ruler Scrub is the opposite case — the canvas is _not_ moving — so that suppression has to be
  lifted for `surface === 'ruler'` or the cursor freezes for the whole gesture. **This is the one
  place the existing machinery does not simply extend**, and it should be the first thing phase C
  proves with a test.
  **AS BUILT — it needed two fixes, not one, because two different marks move.** Lifting the
  suppression for `surface === 'ruler'` is what moves the selected-column OVERLAY. The cursor FLAG
  is moved by a separate `syncRulerCursorMark()` called on the crossing itself, because in glide
  mode `update()` has nothing to notice and would paint neither. Each is pinned by its own test.
- **AS BUILT, found in review after phase C**: the pooled label restyle was gated on the ink having
  moved alone, so a slot hidden across a theme edit and revealed by a later widening kept the dead
  theme's ink — white on white across a light/dark flip. `syncProStrip` has no such case because
  its restyle is gated on the whole key. Fixed by also restyling slots above the previous painted
  count; pinned by "a reading hidden across a theme edit comes back in the NEW ink".
- **Compressed View regression** while adding a `proView` parameter to
  `composerCanvasElementHeight` → the parameter defaults to the current behavior, and the
  CSS-agreement test is the gate.
- **Pixi `Text` cost** on a band that moves with every scroll frame → pool and update on
  visible-label-set changes only, never per frame (the row-label strip's existing rule).
- **A 20px touch target on phones** → accepted, see §2. If it proves bad in use, the escape is
  the mobile height branch we rejected, not a hidden hit area.

## 11. Out of scope

- Breakpoint markers, tools-selection ranges or bar numbers drawn on the ruler. The mini-timeline
  above shows breakpoints and the notes region marks them per column.
- Any Compressed View ruler.
- A setting to hide it. The band is unconditional in the Pro View.
- Scroll-into-view (selecting a visible column without moving the canvas) — see ADR-0014, which
  records why, and which any future attempt supersedes rather than extends.

## USER REVISION 2026-08-27 — edge auto-scroll during a Ruler Scrub

**The rejection recorded above is not standing.** §2 locks "the canvas holds still and the cursor
follows the finger" and rejects "the canvas moving under the finger like a stage drag"; the user
subsequently asked for edge auto-scroll and, told it had been rejected, **explicitly reversed that
rejection**. It is implemented at their request. A future session reading §2 should read this
section as the later decision rather than protecting the user from a call they have already
un-made. What §2's rejection still stands for is unchanged and is not what this adds: the canvas
does not follow the finger, and a scrub anywhere but the two edge bands moves nothing at all.

- **The zone is the chevron buttons' own geometry.** Two bands, each `.canvas-buttons`'s
  `min-width: 2.8rem` wide (`composerCanvasGeometry.CANVAS_SIDE_BUTTON_WIDTH`, pinned against
  App.css in test/composerCanvasCss.test.ts): `[stripInset, stripInset + BAND]` on the left, where
  ComposerCanvas.svelte insets the left chevron clear of the row-label strip with the same
  `proStripWidth(rowHeight)`, and `[canvasWidth - BAND, canvasWidth]` on the right. Reusing the
  buttons' footprint is what makes the gesture learnable — the place you push to walk the song is
  the place that already walks it one column per tap.
- **Always active during a scrub, on every device and every setting**, including where those
  buttons are not rendered at all (desktop `hover: hover` at wide widths) or replaced outright
  (`useKeyboardSideButtons`). The band is "the edge of the canvas, as wide as this app has always
  called an edge"; a gesture that changed shape with a media query is one nobody could learn. It is
  Pro-only by construction and carries no view branch — the Compressed View has no ruler.
- **X only.** `y` is not consulted: once a scrub owns the band pixi delivers every move to it
  wherever the finger goes, so requiring the finger to stay inside a 20px band to keep creeping
  would end the creep by accident.
- **Linear 2 → 10 columns per second by depth into the band**, depth 0 at the inner boundary and 1
  at the canvas edge, clamped to 1 past the outer limit (over the row-label strip on the left, off
  the canvas on the right). Columns per second and not pixels, so a push means the same thing at
  every zoom. Two is slow enough to stop on a column; ten is ~4s across a screen — pushed to the
  edge the creep is a way to travel, while a whole-song jump remains the mini-timeline's above.
- **Driven by the FRAME, not by moves.** A finger held motionless in a band emits no pointer
  events, and it is exactly the held finger that has to keep moving the canvas; the frames already
  run for the whole of any drag. `rulerPointer` gained `lastX`, an unrounded `creepPosition`
  accumulator (snap mode's whole-column invariant would otherwise round a sub-frame rate away) and
  `creepAtMs`. See `ComposerRenderer.advanceRulerCreep`.
- **The selection stays pinned under the stationary pointer**: each frame re-resolves the column
  under `lastX` against the position that frame is about to paint, and publishes through the SAME
  crossing rule a move does — `crossRulerColumn`, factored out of `handleRulerSlide`, so the ~50ms
  `RULER_SCRUB_AUDIO_MS` throttle and the "diff against the scrub's own last column" rule are
  written once and shared.
- **Position is clamped to `[0, columns.length - 1]`, and the clamp is where the creep stops.** It
  is not an ending: the finger is still down and the gesture is still a scrub.
- **Everything else is unchanged**, deliberately: the release still eases to `state.selected`, so
  ADR-0014's recentring is exactly what it was; the `isRecordingAudio` gate, the wheel-settle
  cancel and the hover behaviour are untouched; and a scrub made while the song plays remains a
  silent moving seek, because Composer.svelte's own gates already make that free for every crossing
  whatever moved the finger over it.

The invariant comments this invalidates were rewritten rather than annotated (the Motion type's
`ruler` paragraph, `handleRulerDown`'s promise, `handleRulerSlide`'s "nothing is written into the
motion"): the rule now reads **the FINGER never writes the position; the edge bands creep it**.
ADR-0014's own §"A Ruler Scrub is expressible only because a drag already suspends the invariant"
is unaffected in substance — the suspension is still bounded by the gesture — though its aside that
`motion.position` is "never written" for this surface now means "never written by a move".
