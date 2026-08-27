# Column Ruler — Design

Status: DESIGNED 2026-08-27 (grilling session). No code written. CONTEXT.md terms landed
(**Column Ruler**, **Ruler Scrub**); ADR-0014 records the scroll decision taken inside this
design. Builds on the Pro View spec (2026-08-21) — this adds a third region to the canvas that
spec laid out, and changes nothing about its axis, camera or cell editing.

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

- **Scope: Pro View only.** In the Compressed View the mini-timeline is at the *bottom*, so
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
  column the finger is on *now* sounds; columns crossed in between pass silently. A fast sweep is
  a sparse, blurred run through the song rather than ~100 voices in 200ms. (Rejected: a minimum
  dwell, which silences fast sweeps entirely; no limit at all.)
- **The cursor is the playhead's flag** at the fixed `playheadX` (25% in the Pro View), travelling
  only during a Ruler Scrub. See ADR-0014 — selecting a column always recentres the canvas, so a
  cursor cannot be a free position indicator.
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

**Label anchoring**: `index % labelStep === 0`, so column 0 reads `0:00`. **Known cosmetic
mismatch**: the canvas' existing "larger" background accent is `(index + 1) % 4 === 0`, i.e.
columns 3, 7, 11 — the *last* column of each beat. So every label sits one column left of the
accent below it. Accepted (they are different markings at different heights); neither moves.

**Ticks**: a minor tick every 4th column, a major tick at each labelled column, and **no
per-column ticks** — at 50 columns/canvas on a phone those are 8px apart and read as a picket
fence, and the notes grid below already draws every column boundary. A desktop hover highlight of
the column-width cell under the cursor is what shows the press resolution.

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
- The cursor flag draws at `playheadX` at rest, and at the scrubbed column's x during a Ruler
  Scrub. It draws in both smooth-scroll modes: with the setting on it caps the playhead line,
  with it off it caps the selected-column overlay, and both are at the same x.
- Theme colors through the existing `ThemeProvider` channel.
- `onGeometryChange` gains the ruler's own top and height, for the same reason it already reports
  the timeline's: the template must not hold a second copy of the number.

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
  Ruler Scrub is the opposite case — the canvas is *not* moving — so that suppression has to be
  lifted for `surface === 'ruler'` or the cursor freezes for the whole gesture. **This is the one
  place the existing machinery does not simply extend**, and it should be the first thing phase C
  proves with a test.
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
