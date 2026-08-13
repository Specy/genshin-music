// This class owns all pixi state: ONE Application (the notes region and, below it, the
// mini-timeline strip - see timelineStrip), the ComposerCache, the scroll/drag state machine, and
// the update(state) entry point. It keeps a POOL of per-column views (see ColumnView below) and
// diffs the state it last PAINTED against the one it was handed now to decide how much of the scene
// to repaint - see update() and paintedState. ComposerCanvas.svelte owns lifecycle only - it
// constructs this class in onMount, awaits init(), feeds it state via update(), and renders the
// surrounding DOM.
//
// `notesApp`, `notesColumnsContainer`, `drawNotesStage` keep their names now that the timeline
// shares the canvas: "notes" names the REGION the columns occupy, which is what every one of those
// sites is about, and the strip is stated against it (its y is `height + TIMELINE_BAND_PADDING`;
// its x and its width are the canvas' less the DOM buttons' footprint - see stripWidth()).
// `this.height` is that region and not the canvas - see canvasHeight() for the only two places that
// want the whole thing.
//
// Theme reaches this class via subscribeTheme(cb); ComposerCanvas.svelte separately derives the
// handful of theme values its own DOM needs via $derived off the same ThemeProvider singleton.
// This duplicates a few color formulas between the two files (numeric here for pixi draw calls,
// CSS strings there) - deliberate, not an oversight. What this class hands back through
// ComposerRendererCallbacks.onGeometryChange is the canvas' width, the split between its two
// regions and hasCache: pixi/DOM-measurement-derived values the template cannot re-derive on its
// own, and which the three absolutely-positioned timeline buttons are placed against. The other
// callbacks carry user input the same way round - a pointer on either region becomes a selectColumn
// or a toggleBreakpoint.
import { game } from '$game';
import { isMobile } from 'is-mobile';
import {
  Application,
  Container,
  Graphics,
  Sprite,
  type FederatedPointerEvent,
  type Texture,
} from 'pixi.js';
import { ThemeProvider, subscribeTheme } from '$core/theme/ThemeProvider.svelte';
import { clamp, colorToRGB, nearestEven } from '$core/utils/Utilities';
import type { Timer } from '$core/utils/Utilities';
import { TEMPO_CHANGERS } from '$core/legacyConfig';
import type { NoteColumn, ColumnNote, InstrumentData } from '$core/Songs/SongClasses';
import {
  computeRowLayerStatuses,
  computeStrandedRows,
  displayButtonForId,
} from '$core/Songs/noteIds';
import { ComposerCache, type ComposerCacheData } from './ComposerCache';
import {
  TIMELINE_BAND_PADDING,
  TIMELINE_INSET_LEFT,
  TIMELINE_INSET_RIGHT,
  composerCanvasElementHeight,
  composerCanvasSize,
  composerTimelineHeight,
} from './composerCanvasGeometry';

const NOTES_PER_COLUMN = game.notes.perColumn;
const COMPOSER_NOTE_POSITIONS = game.notes.composerPositions;

/**
 * THE PLAYHEAD, and the coordinate system the whole class is written in.
 *
 * A fixed vertical line at the canvas' horizontal centre. It is not a cursor that moves over the
 * columns - the columns move under IT, and where it crosses them is the START of the column the
 * composer is on. So `scrollPosition` (a FRACTIONAL column index, see the field) is by definition
 * the column-space coordinate under this line, and the container offset that realises it is
 * `playheadX - scrollPosition * columnWidth` - see containerX().
 *
 * The LAYOUT is the same in both scroll modes: the offset puts the START of the scrolled-to column
 * at the centre either way. Before the playhead existed it put that column's RIGHT edge there, so
 * the column being played sat left of the middle - that is the change this coordinate system made,
 * and it applies whether or not the line is drawn.
 *
 * WHETHER THE LINE IS ON SCREEN is playheadIsVisible, written onto playheadGraphics.visible by
 * init() and by update() - see overlayColumn for the overlay it is mutually exclusive with.
 *
 * WHAT IS DRAWN is a bar spanning the NOTES REGION's height plus a triangle at each end pointing
 * INWARDS along it - down from the top, up from the bottom. The notes region's bottom is where the
 * canvas' own bottom edge was before the mini-timeline moved into this canvas; running the bar to
 * the canvas height instead would put it and its arrowhead through the strip. The bar alone is a
 * thin line over a busy grid of note icons and bar shading, and it is the only column marker in
 * glide mode; the arrowheads are
 * what make it findable at a glance without widening the bar enough to hide the notes beside it.
 *
 * The colour is the theme's `accent` and comes through ComposerRendererTheme.playhead rather than
 * being read here - see that field, and note that the whole line is redrawn only by drawPlayhead's
 * two callers, so it trails a theme edit by the same debounce the textures do.
 */
const PLAYHEAD_WIDTH = 3;
const PLAYHEAD_ALPHA = 0.9;
/** Half-width and length of each arrowhead, in px. */
const PLAYHEAD_ARROW_HALF_WIDTH = 6;
const PLAYHEAD_ARROW_LENGTH = 8;

/**
 * The cap put on the notes Application's Ticker while a motion is running - see startMotionFrames.
 *
 * pixi's cap is a frame-SKIP gate rather than a clock of its own: `Ticker.update` computes
 * `delta = (now - lastFrame) | 0` and returns without emitting when that is below `1000 / maxFPS`
 * (node_modules/pixi.js/lib/ticker/Ticker.mjs, the maxFPS setter and update()'s early return). So
 * the executed frames are unevenly spaced on a display whose refresh rate is not a multiple of
 * this. This class derives every position from the wall clock rather than by integrating a delta,
 * so uneven gaps cost smoothness and never accumulate into drift - see motionPositionAt.
 *
 * At 48 on a 60Hz display the gaps alternate between one and two display frames. What the cap does
 * NOT reduce on any display is the number of times the browser wakes the page: pixi's `_tick` still
 * runs on every requestAnimationFrame and the gate only skips the listener body.
 *
 * Setting it ABOVE the display's refresh rate is a no-op, because the gate never fires.
 */
const COMPOSER_MOTION_MAX_FPS = 48;

/**
 * `.timeline-scroll`'s `border-radius: 0.3rem`, which the strip has to draw for itself now that no
 * DOM element sits under it.
 *
 * ONLY THE ROUNDING CAME ACROSS to the strip's CONTENT, not the `overflow: hidden` that element
 * carried beside it. The strip's background is a roundRect; nothing clips the content container, so
 * a tools selection anchored at column 0 fills the strip's two left corner wedges (~5px² each:
 * r²(1 - π/4) at r=4.8) square where that element used to cut them, and a breakpoint marker at
 * column 0 - anchored at 0.5, so half of it sits at negative strip x - is no longer cut by the arc
 * either. Those two are left unclipped deliberately: the fix is a stencil mask, which is a
 * batch-breaking push/pop on EVERY render, and the content container is the one that carries the
 * strip's hitArea, so masking it would also PRUNE hit testing (EventBoundary.hitPruneFn consults a
 * container's mask effect) and kill the clause that keeps a running scrub alive once the pointer
 * wanders off the strip.
 *
 * THE VIEWPORT OUTLINE IS CLIPPED, and that one is not optional. Since the strip was inset clear of
 * the three DOM buttons (TIMELINE_INSET_LEFT/RIGHT) its overflow no longer runs off the edge of the
 * canvas - it runs into the two bands those buttons stand on, which are visible canvas. The outline
 * overflows by design at both ends of every song (timelineViewport's x is negative for the first
 * half-canvas of columns), so at a 1920px viewport on a 100-column song at scroll 0 it would paint
 * its 3px strokes across the whole left band, showing through the 3.2px seams between the buttons.
 * viewportGraphics is a leaf with no hitArea and lives under an `interactiveChildren = false`
 * sibling, so masking IT prunes nothing - see initViewportClip.
 *
 * The residue, measured at that viewport: half of a 10px breakpoint marker at the song's first and
 * last column, of which 3.2px falls in a seam and the rest behind a button.
 */
const TIMELINE_STRIP_RADIUS = 4.8;

/**
 * How long the canvas takes to reach a column it was asked to ease to WHILE SMOOTH SCROLLING IS ON
 * - see easeTo, whose gate makes every ease an instant settle while it is off.
 *
 * FIXED rather than proportional to the distance, which is what makes the wheel feel faster the
 * harder it is spun: a burst of events that moves the target eight columns takes the same wall time
 * as one event moving it one.
 */
const SCROLL_EASE_MS = 140;

/**
 * How far a pointer must travel across the notes stage before the press becomes a DRAG rather than
 * a click - see handleStageSlide.
 *
 * Before this it was a whole column: `handleStageSlide` only acted once the accumulated movement
 * crossed `columnSize.width`, so a 0.9-column drag still released as a click and jumped the canvas
 * to wherever the pointer happened to be. A few pixels is enough to keep a jittery click a click.
 *
 * The whole-column threshold is back for the drag's STEP while smooth scrolling is off (see
 * snapManualPosition), and deliberately NOT for this discriminator, which is a few px in both
 * modes: what counts as a click rather than a scroll is a question about the hand, not about the
 * grid the scroll then moves on.
 */
const DRAG_SLOP_PX = 3;

/**
 * What ComposerRenderer.overlayColumn holds when NO column carries the selected overlay, which is
 * the whole of R1's "the line and the highlight are mutually exclusive" in one value. A column index
 * is a non-negative array index, so `index === NO_OVERLAY_COLUMN` is false for every drawn column
 * and `columnViews.get(NO_OVERLAY_COLUMN)` is undefined - so paintColumn, paintSelectionOverlay and
 * syncOverlayColumn all need no mode test of their own.
 */
const NO_OVERLAY_COLUMN = -1;

/**
 * Columns of over-draw kept on each side of the strip the canvas actually shows.
 *
 * With a snapping scroll one column of bleed would do - the window moved a whole column at a time,
 * so a column was either drawn or off-screen. A gliding scroll spends most of its time BETWEEN two
 * integer positions, with a column straddling each edge, and the frame that first needs the column
 * beyond it is the frame it becomes visible on. The bleed is what makes entering columns get
 * painted before they are on screen rather than on the frame they appear.
 */
const WINDOW_BLEED_COLUMNS = 2;

/**
 * The PIXEL half of what the drawn window is a function of - the other half is the scroll position,
 * which is fractional and travels separately (see isColumnVisible). `columnsPerCanvas` is NOT in it
 * and cannot be: `columnWidth` is `nearestEven(width / columnsPerCanvas)`, so a canvas fits between about
 * `columnsPerCanvas` and `columnsPerCanvas + 2.5` whole columns depending on how that rounding
 * landed, and at the small widths the mobile/preview canvases use the slack is the larger figure.
 * The window is derived from the pixels for that reason rather than from a column count plus a
 * margin that would have to be big enough for the worst rounding.
 */
export interface ColumnWindowGeometry {
  /** The notes canvas' width, in px. */
  width: number;
  /** One column's width, in px. */
  columnWidth: number;
  /** The playhead's distance from the canvas' left edge, in px. */
  playheadX: number;
}

interface ComposerRendererTheme {
  timeline: {
    hex: string;
    hexNumber: number;
    selected: number;
    border: number;
  };
  sideButtons: {
    hex: string;
    rgb: string;
  };
  main: {
    background: number;
    backgroundHex: string;
    backgroundOpacity: number;
  };
  /**
   * The span-tail colour of the CURRENT layer. Captured here rather than read live in the draw
   * path: a `ThemeProvider.get(...)` inside a draw is both an allocation per painted column and a
   * reactive read, which would join (and, on any run that skipped it, leave) the canvas $effect's
   * dependency set. The channel that repaints tails after a theme edit is subscribeTheme ->
   * handleThemeChange -> recalculateCacheAndSizes, which drops the pool and repaints everything.
   *
   * paintTails does not read THIS field - see ComposerRenderer.paintTailAccent for the copy it
   * reads instead and why the two are updated at different moments.
   */
  tailAccent: number;
  /**
   * The playhead's colour, captured for the same reason tailAccent is: drawPlayhead must not do a
   * live `ThemeProvider.get(...)`.
   *
   * It is the SAME theme key as tailAccent - `accent`, which is what the current layer's span tails
   * are drawn in - so the line matches the layer being edited rather than being a colour of its
   * own. They are separate fields because tailAccent has a second copy that moves at a different
   * moment (paintTailAccent), and this one does not: drawPlayhead's callers are init() and
   * recalculateCacheAndSizes, and the second of those is the theme path, so the line and the pool
   * are recoloured by the same call.
   */
  playhead: number;
}

// The reactive input ComposerCanvas.svelte pushes into update() on every relevant change via its
// own $effect.
//
// EVERY FIELD HERE IS A VALUE OR A PLAIN ARRAY - no `$state` proxy, and nothing reached through the
// song. Two separate reasons, both load-bearing:
//
//  - update() DIFFS these fields (see needsUnconditionalRepaint, and update() for the version half). A field reached through a live song is the
//    same object on both sides of the comparison, so the branch it gates is permanently false -
//    silently. `structureVersion` exists because the column array keeps one identity across the
//    edits that mutate it in place, so an identity comparison does not see those; `columns`'
//    identity is diffed beside it, because a structure version is per-instance and a freshly loaded
//    song starts at 0.
//  - draw() indexes the arrays per column and per note (hundreds of element reads per full
//    repaint), and an element read through Svelte's deep proxy is a Proxy trap plus a dependency
//    registration - measured at ~20x a plain read. `columns` comes from ComposedSong's
//    `#structure`-guarded getter; `instruments`, `breakpoints` and `selectedColumns` are
//    `$state.raw` at their declarations. A future field backed by a deep `$state` array must be
//    hoisted into a plain copy in the canvas's $effect rather than indexed in the loops.
//
// `beatMarks`, `columnsPerCanvas`, `bpm`, `smoothScroll` and `lookaheadMs` are the settings values
// this class needs, taken as scalars rather than as the `ComposerSettings.data` object they come
// from. That object's identity never changes when a setting is edited, so a diff could not see one;
// and reading them in the canvas's $effect - rather than deep inside a draw that may or may not run
// - is what subscribes that effect to them at all. ComposerCanvas.svelte's $effect is the one place
// all five are read off `settings`, which is also what keeps `bpm` the same number the playback
// loop waits by - see that field.
export interface ComposerRendererState {
  columns: NoteColumn[];
  /**
   * ComposedSong's graph version, captured. Comparable only against another capture from the SAME
   * song, which is why `columns` above is diffed alongside it.
   */
  structureVersion: number;
  /**
   * Whether the song is playing, which is half of the `isPlaying && smoothScroll` condition -
   * "the transport owns the scroll position" - that syncScrollSchedule and handleWheel both gate
   * on. It used to be read nowhere in this class and was excluded from the repaint diff on the
   * grounds that it changed no pixel - true while the scroll snapped. It decides whether a moved
   * `selected` is a glide or a jump now, so syncScrollSchedule reads it on every update; it is
   * still not in needsUnconditionalRepaint, because what it changes is the SCHEDULE rather than any
   * column's appearance.
   */
  isPlaying: boolean;
  isRecordingAudio: boolean;
  // The instrument roster, passed as its OWN field rather than reached through the song. It used
  // to be `song: ComposedSong` and the draw path read `state.song.instruments` - which meant the
  // canvas's $effect depended on the roster only implicitly, through a read that happens deep
  // inside renderer.update(). That worked while every edit handed the effect a freshly cloned
  // `song`; with a stable song identity the effect would never re-run on an instrument change,
  // and it is dropped entirely on any early-returning draw. Explicit prop, explicit dependency.
  //
  // Diffed BY ARRAY IDENTITY: InstrumentSettingsPopup edits the live InstrumentData in place and
  // ComposedSong.setInstrument then publishes a clone of it, so a value comparison between two
  // captures compares the mutated object against its own copy and reports equal.
  instruments: InstrumentData[];
  selected: number;
  currentLayer: number;
  // Read by computeCanvasSize, which runs at init and on the resize/theme path rather than per
  // draw. It scales BOTH canvas dimensions, so it decides every column's x, every note's y and the
  // size of both canvases. Composer.svelte passes it as a static prop, which is the reason
  // needsUnconditionalRepaint does not compare it.
  inPreview?: boolean;
  /** ComposerSettings' `beatMarks`, as a number: decides the light/dark bar-group alternation. */
  beatMarks: number;
  /**
   * ComposerSettings' `columnsPerCanvas`, as a number. Read ONCE, in the constructor: a changed
   * value arrives as a fresh ComposerRenderer instead, because Composer.svelte wraps the canvas in
   * {#key settings.columnsPerCanvas.value}. It is on the state object so the canvas's $effect
   * reads it like every other input, not because update() re-reads it.
   */
  columnsPerCanvas: number;
  breakpoints: number[];
  selectedColumns: number[];
  /**
   * ComposerSettings' `smoothScroll`, which chooses between TWO MUTUALLY EXCLUSIVE ways of marking
   * where the composer is - and, since it also gates manual motion, between a canvas that moves
   * continuously and one that moves in whole columns. It decides six things:
   *  - whether a playback tick GLIDES through its column or snaps to it (syncScrollSchedule);
   *  - whether the playhead line is on screen (playheadIsVisible, which also gates it on the
   *    recording flag, written onto playheadGraphics.visible by init() and update());
   *  - whether the SELECTED-column overlay exists at all (overlayColumn, which is
   *    NO_OVERLAY_COLUMN while this is on);
   *  - whether the WHEEL eases the canvas itself or only moves `selected` and lets the transport
   *    re-anchor (handleWheel) - which is the one that is not about a mark on screen;
   *  - whether a manual DRAG follows the pointer continuously or moves a whole column at a time,
   *    on the notes stage and on the mini-timeline alike (snapManualPosition);
   *  - whether the wheel and every settle EASE or arrive at once (the gate at the top of easeTo).
   * The last two are a deliberate reversal: manual motion was continuous in both modes for one
   * round, and the setting now covers it. The tools-selection overlay is a different sprite state
   * and is unaffected by this in either direction - see ColumnView.paintSelection.
   *
   * It does NOT change the layout: the container offset puts the start of the scrolled-to column
   * under the canvas centre in both modes, so the two are comparable at one layout.
   *
   * It is keyed on the SETTING and not on `isPlaying`, so a stopped composer with this on shows the
   * line and no overlay. needsUnconditionalRepaint compares it, because a toggle changes pixels on
   * columns whose own `version` counter did not move.
   */
  smoothScroll: boolean;
  /**
   * ComposerSettings' `bpm`, as a number: what lets this class work out how long a column lasts and
   * therefore how fast to travel through it - see columnDurationMs.
   *
   * THE SETTING AND NOT `song.bpm`, which is the one thing here that has to be right: the playback
   * loop this glide has to keep time with waits `(60000 / settings.bpm.value) * changer` ms per
   * column (Composer.svelte's togglePlay), so reading the same value is what makes them the same
   * number by construction rather than by an argument that has to hold. It used to take the song's,
   * on the argument that Composer.svelte keeps the two equal - it does not on two ordinary paths.
   * `song.bpm` is seeded from the DEFAULT settings at declaration and re-seeded nowhere when the
   * stored settings land in onMount, and createNewSong builds a ComposedSong at its own default; so
   * a user with a persisted composer bpm who opens the composer with no songId, or makes a new
   * song, had the glide running at one tempo and the transport at another.
   */
  bpm: number;
  /**
   * ComposerSettings' `lookaheadTime`, in ms - how far AHEAD of being heard a column's notes are
   * scheduled with the audio clock.
   *
   * The composer selects column i and schedules its notes to sound `lookaheadMs` later, so the
   * state has always run ahead of the audio by that much. While the scroll snapped this was
   * invisible - a highlight appearing a quarter second early reads as a highlight - but a
   * continuously moving playhead running a quarter second ahead of the music reads as being out of
   * time, and at the shipped defaults (220bpm, 250ms) that is very nearly a whole column. So the
   * glide for a column is scheduled to START `lookaheadMs` in the future, which is when that column
   * is actually heard.
   *
   * Nothing else has to be held back to match: while smooth scrolling is on there is no selection
   * overlay for the line to disagree with (see overlayColumn), so the line alone says where the
   * music is.
   */
  lookaheadMs: number;
}

// onGeometryChange reports pixi/DOM-measurement-derived geometry back up to the Svelte template,
// which cannot compute it independently. Since the mini-timeline moved onto the notes canvas, the
// SPLIT between the two regions is part of that: the three timeline buttons are absolutely
// positioned over the strip the canvas draws, so the template needs the strip's own top and height
// to put them there rather than a second copy of composerCanvasGeometry.composerTimelineHeight().
// It reports no INSET: where the buttons sit horizontally is decided by App.css, and the renderer
// derives the strip's own bounds from the same TIMELINE_INSET_* constants that stylesheet is
// cross-checked against (test/composerCanvasCss.test.ts) - a reported inset would be a second
// statement of a number the CSS already owns.
export interface ComposerRendererCallbacks {
  selectColumn: (index: number, ignoreAudio?: boolean) => void;
  toggleBreakpoint: () => void;
  onGeometryChange: (geometry: {
    width: number;
    /** the NOTES region's height - the canvas is this plus two padding rows plus timelineHeight */
    height: number;
    /** TIMELINE_BAND_PADDING: one row of it sits between the notes region and the strip */
    timelinePadding: number;
    timelineHeight: number;
    hasCache: boolean;
  }) => void;
}

/**
 * Whether a column is inside the drawn window. This is the DEFINITION - stated as the overlap test
 * it really is, over the strip the column occupies - and visibleColumnRange() below is the closed
 * form of the same set. test/composerRenderer.test.ts pins the two against each other rather than
 * assuming they agree, over the option list it reads out of ComposerSettings.data.columnsPerCanvas
 * and over fractional scroll positions as well as integer ones.
 *
 * `scrollPosition` is fractional during a glide, which is what the two forms have to agree on:
 * every column-counting shortcut that was exact while the scroll snapped stops being exact halfway
 * between two columns.
 *
 * Strict on both sides, so a column touching the bleed boundary exactly is outside. That is a
 * choice about a measure-zero case and not a claim that it matters; what matters is that both forms
 * make the SAME choice.
 */
export function isColumnVisible(
  pos: number,
  scrollPosition: number,
  geometry: ColumnWindowGeometry
) {
  const { width, columnWidth, playheadX } = geometry;
  const bleed = WINDOW_BLEED_COLUMNS * columnWidth;
  //where the column's own strip lands on the canvas, in px from its left edge
  const left = playheadX + (pos - scrollPosition) * columnWidth;
  return left + columnWidth > -bleed && left < width + bleed;
}

interface ColumnPaintParams {
  index: number;
  notes: ColumnNote[];
  currentLayer: number;
  instruments: InstrumentData[];
  sizes: { width: number; height: number };
  cache: ComposerCacheData;
  background: Texture;
  isBreakpoint: boolean;
  isSelected: boolean;
  isToolsSelected: boolean;
}

/**
 * WHICH COLUMN a pooled view last painted, as the PAIR that identifies it - written by
 * ComposerRenderer.paintColumn, read by columnIsAlreadyPainted (2026-08-06 reactive-model plan,
 * phase 4).
 *
 * Both halves are load-bearing, and neither is sufficient alone:
 *  - `version` is NoteColumn's plain render counter, bumped by ComposedSong's mutators over the
 *    range a changed note COVERS. It is what says the same column's CONTENT moved.
 *  - `column` is the NoteColumn object itself, because the counter is monotonic per INSTANCE and
 *    two different columns' counters are unrelated numbers (see the CONSUMER CONTRACT at
 *    NoteColumn.version). addColumns, removeColumns and pasteColumns splice the live array IN
 *    PLACE, so column objects move to new indexes under an array identity that never changed -
 *    and two of them sitting at the same number is an ordinary coincidence, not a rare one.
 *    test/composerRenderer.test.ts builds both collisions deliberately and asserts them, because
 *    the row that merely inserts a column does not happen to produce either.
 *
 * The version comparison is `!==` and not `>`, which is what NoteColumn.version's CONSUMER CONTRACT
 * asks of a consumer - a restored or freshly inserted column carries a counter BELOW every live
 * one. Stated as it actually stands: while `column` is in the key the two forms cannot differ,
 * because a given NoteColumn's counter only ever increments, so the version read at paint time is
 * never above the one read now. `!==` is what keeps that from being load-bearing - the equivalence
 * disappears the moment the object half does, and both version-only forms (with `!==` and with `>`)
 * fail the collision rows.
 */
interface ColumnPaintKey {
  column: NoteColumn;
  version: number;
}

/**
 * WHAT IS MOVING THE SCROLL POSITION, as four mutually exclusive states. One field holds it (see
 * ComposerRenderer.motion), which is what makes "two sources wrote the position in the same frame"
 * unrepresentable rather than merely unlikely.
 *
 * THE TICKER RULE, and the whole of R2's idle requirement in one line: the notes Application's
 * Ticker runs if and only if this is not `resting`. FOUR methods write the field - enterMotion,
 * rest, settleAt and destroy - and each pairs its write with the matching startMotionFrames /
 * stopMotionFrames call in the same statement pair, which is what keeps the two from drifting
 * apart. enterMotion is the only one that starts them; the other three all assign `resting`.
 *
 * THE RESTING INVARIANT: `resting` means the position is the whole column index this class last
 * asked `selectColumn` for, and every transition into it that anything can observe goes through
 * rest() or settleAt() - destroy() is the third and nothing reads the field after it. rest()
 * assigns from `state.selected` rather than from the position, because `selected` is what every
 * click, edit and jump downstream reasons in terms of; settleAt() assigns the position a finished
 * motion reached, which is the index it handed `selectColumn` on the way in.
 *
 * ITS SCOPE IS WHAT `smoothScroll` DECIDES, and the invariant's content is the same either way:
 *  - GLIDING: "at rest" is a strictly smaller set of moments than "the position is an integer" - a
 *    playback glide, a drag or an ease splits them for the length of the gesture, and `resting` is
 *    the name for when they are back together.
 *  - SNAPPING: the two are the same set again. `playback` is unreachable (its only entry is inside
 *    `isPlaying && smoothScroll`) and so is `easing` (easeTo settles instead), which collapses this
 *    union to `resting | dragging`; and `dragging` holds only quantised values. So the position is
 *    a whole column at EVERY instant, not merely at rest - one assertion that catches any smooth
 *    motion in that mode from any source, including one added later.
 */
type Motion =
  /** Nothing is moving the position. */
  | { kind: 'resting' }
  /**
   * The scrollSegments queue owns the position - see ScrollSegment and scrollPositionAt. Entered
   * only while smooth scrolling is on.
   */
  | { kind: 'playback' }
  /**
   * A wheel or a drag release, running to a whole column over SCROLL_EASE_MS. Entered only while
   * smooth scrolling is on - see the gate at the top of easeTo.
   */
  | { kind: 'easing'; from: number; to: number; startMs: number; durationMs: number }
  /**
   * A pointer is down and the canvas is following it. `position` is written by the pointermove
   * handler and read by the frame - the handler paints nothing itself, so a pointer stream faster
   * than the frame rate coalesces into one applyScrollPosition per frame instead of one per event.
   *
   * It is the one motion both modes reach. While smooth scrolling is OFF the handlers write it
   * through snapManualPosition, so it holds a whole column and moves once per column crossed.
   */
  | { kind: 'dragging'; surface: 'stage' | 'timeline'; position: number };

/**
 * ONE COLUMN'S WORTH OF PLAYHEAD TRAVEL, as an absolute wall-clock schedule: between `startMs` and
 * `endMs` the playhead moves from the start of column `from` to the start of column `from + 1`,
 * linearly. Tempo changers need no special handling anywhere - a 1/4 column simply schedules a
 * segment a quarter as long over the same distance, so the scroll speeds up through it.
 *
 * WHY A QUEUE OF THESE rather than a single "current glide". A segment is scheduled to start
 * `lookaheadMs` in the FUTURE (see ComposerRendererState.lookaheadMs), so between scheduling it and
 * it beginning, the previous segment must keep running. At the shipped defaults one column at
 * tempo 1 lasts about as long as the lookahead, so that is one segment in flight - but a 1/8 column
 * at 220bpm lasts 34ms against a 250ms lookahead, and then seven of them are pending at once. A
 * two-slot "current + next" holds for tempo 1 and silently drops segments on a fast run.
 *
 * `endMs` starts as a PREDICTION from the bpm and the column's tempo changer, because the segment
 * has to be drawable before the tick that ends it arrives. scheduleScrollSegment replaces the
 * previous segment's prediction with the measurement when the next one is scheduled, so the
 * timeline stays contiguous and the playback loop's own drift correction is inherited rather than
 * fought.
 */
interface ScrollSegment {
  /** The column whose START the playhead is at when this segment begins. */
  from: number;
  startMs: number;
  endMs: number;
}

/**
 * One column of the notes stage, owned by ComposerRenderer's pool and REUSED: acquired when a
 * column enters the drawn window, released back to the free list when it leaves, never destroyed
 * in between. Before the pool existed, drawNotesStage destroyed and rebuilt every display object
 * in the window on every update - ~276 of them per playback tick at the default columnsPerCanvas.
 *
 * Four child slots are fixed for the life of the view - background, selection overlay, breakpoint
 * marker, tail Graphics - followed by note sprites grown on demand. THAT ORDER IS THE DRAW ORDER:
 * pixi renders a container's children in array order, and `zIndex` decides nothing unless the
 * PARENT sets sortableChildren, which nothing here does. It is the same order the pre-pool code
 * produced by nesting the overlay and the breakpoint marker inside the background Sprite and adding
 * the rest as siblings.
 *
 * paint() writes the view's own placement and presentation (the container's x, y, alpha and
 * visible) and every property of a child that varies from column to column - the background's
 * texture, the overlay's texture, alpha and visibility, the marker's texture and visibility, and
 * each note sprite's texture, row and alpha - whether or not THIS column uses it: an unused overlay
 * is hidden, a surplus note sprite is hidden. Writing them without first checking what the view
 * already holds is what makes a reused view safe; a "set it only if it changed" paint is how a pool
 * ends up showing the previous occupant's texture, alpha or row.
 *
 * What it leaves alone: the child positions that are the same for every column (the background, the
 * overlay and the marker sit at the container's origin, and a note sprite's x does too, so those
 * are the constructor's zeroes), and the tail Graphics' DRAWING - ComposerRenderer.paintTails
 * clears and refills that immediately after every paint(). Nothing writes that Graphics' own
 * placement or alpha, so it draws from the container's origin at full opacity and the per-bar alpha
 * lives in the fill ops.
 *
 * test/composerRenderer.test.ts is what keeps those two paragraphs honest rather than aspirational:
 * it reads the placement, texture, position, alpha and visibility of every child off a pool that
 * has been driven incrementally, and compares them both against the drawing rules and against a
 * second renderer freshly mounted at the same state.
 */
class ColumnView {
  readonly container = new Container();
  /** Cleared and refilled by ComposerRenderer.paintTails - the view owns the object, not the drawing. */
  readonly tailGraphics = new Graphics();
  /**
   * What this view last painted, or null for "there is nothing here to compare a column against".
   * Owned by ComposerRenderer rather than by paint(): it is written by paintColumn immediately
   * after paint() + paintTails, so the key and the pixels are recorded in one place, and cleared by
   * releaseColumnView.
   *
   * WHAT MAKES A NON-NULL KEY MEAN "this view is showing that column, at the index it is mapped to"
   * is the acquire/paint pairing: columnIsAlreadyPainted only ever reads a view found in
   * `columnViews`, a view only enters that map through acquireColumnView, and acquireColumnView's
   * one caller is paintColumn, which paints it at that index and writes this field on the next
   * line. So the key cannot describe a different column, a different index, or a moment before the
   * view's current occupancy.
   *
   * It carries no index for that reason - the map key is the index - and the index-derived half of
   * a column's paint (its x, its bar-group slot, the every-4th larger variant) cannot have moved
   * under a view that has been at one map index since it was painted.
   *
   * CLEARING IT ON RELEASE IS REDUNDANT AGAINST THAT PAIRING, and kept anyway: a released view
   * keeps every pixel it painted and can wait out arbitrarily many updates outside the scene graph,
   * including the full repaints that would have corrected it, so if a future path ever acquired a
   * view WITHOUT painting it, a stale key would be the difference between a repaint and another
   * column's pixels. Stated as a redundancy rather than as the mechanism because no test in
   * test/composerRenderer.test.ts distinguishes the two - measured: removing this line alone leaves
   * the file green.
   */
  paintKey: ColumnPaintKey | null = null;
  private readonly background: Sprite;
  private readonly overlay: Sprite;
  private readonly breakpointMarker: Sprite;
  private readonly noteSprites: Sprite[] = [];
  /** How many of noteSprites are currently shown; the rest are hidden, not removed. */
  private paintedNotes = 0;

  constructor(cache: ComposerCacheData) {
    this.background = new Sprite(cache.standard[0]);
    this.overlay = new Sprite(cache.standard[2]);
    this.overlay.visible = false;
    this.breakpointMarker = new Sprite(cache.breakpoints[1]);
    this.breakpointMarker.visible = false;
    this.container.addChild(this.background);
    this.container.addChild(this.overlay);
    this.container.addChild(this.breakpointMarker);
    this.container.addChild(this.tailGraphics);
  }

  paint(params: ColumnPaintParams): void {
    const { cache, notes, instruments, currentLayer, sizes } = params;
    this.container.x = sizes.width * params.index;
    // The other three of the container's own presentation properties, written for the same reason
    // the child properties below are: this object outlives the column it is painting for, and the
    // pool is keyed on it. Nothing in this class writes them elsewhere today, so these are writes
    // of the values they already hold - which is the point: a release/acquire cycle that starts
    // hiding or fading a view does not need a matching restore added somewhere else to be safe.
    this.container.y = 0;
    this.container.alpha = 1;
    this.container.visible = true;
    this.background.texture = params.background;
    this.paintSelection(cache, params.isSelected, params.isToolsSelected);
    this.breakpointMarker.texture = cache.breakpoints[1];
    this.breakpointMarker.visible = params.isBreakpoint;
    const strandedRows = computeStrandedRows(notes, instruments);
    let painted = 0;
    for (const [button, layerStatus] of computeRowLayerStatuses(notes, currentLayer, instruments)) {
      if (layerStatus === 0) continue;
      const texture = cache.notes[layerStatus];
      const sprite = this.noteSpriteAt(painted, texture);
      sprite.texture = texture;
      sprite.y = (COMPOSER_NOTE_POSITIONS[button] * sizes.height) / NOTES_PER_COLUMN;
      //stranded notes (id has no button on its own instrument) are visibly dimmed
      sprite.alpha = strandedRows.has(button) ? 0.45 : 1;
      sprite.visible = true;
      painted++;
    }
    for (let i = painted; i < this.paintedNotes; i++) this.noteSprites[i].visible = false;
    this.paintedNotes = painted;
  }

  /**
   * The selection overlay: ONE sprite carrying two different states, so texture AND alpha depend on
   * the (isSelected, isToolsSelected) PAIR rather than on either alone. `toolsOnly` is what makes
   * the selected column win over a tools selection covering it.
   *
   * With smooth scrolling ON, `isSelected` is false for every column (ComposerRenderer.overlayColumn
   * is NO_OVERLAY_COLUMN, which no index equals), so `toolsOnly` collapses to `isToolsSelected` and
   * this draws the tools band and nothing else. That is R1's mutual exclusion, and it needs no code
   * here: a column that is both the playhead's column and tools-selected shows the tools band, with
   * the line crossing it. The precedence above is what OFF mode still gets.
   */
  paintSelection(cache: ComposerCacheData, isSelected: boolean, isToolsSelected: boolean): void {
    const toolsOnly = isToolsSelected && !isSelected;
    this.overlay.texture = toolsOnly ? cache.standard[3] : cache.standard[2];
    this.overlay.alpha = toolsOnly ? 0.4 : 0.8;
    this.overlay.visible = isSelected || isToolsSelected;
  }

  private noteSpriteAt(index: number, texture: Texture): Sprite {
    const existing = this.noteSprites[index];
    if (existing) return existing;
    //grown on demand and never shrunk: the array ends up as deep as the densest column this view
    //has ever held, bounded by the number of display rows (game.notes.composerPositions.length)
    const sprite = new Sprite(texture);
    this.noteSprites.push(sprite);
    this.container.addChild(sprite);
    return sprite;
  }

  destroy(): void {
    // `context: true` also destroys the tail Graphics' own GraphicsContext (and its GPU geometry);
    // Container.destroy hands the same options to every child. There is no `texture` key, so the
    // ComposerCache textures the sprites merely BORROW are left alone - the cache owns those and
    // destroys them itself.
    this.container.destroy({ children: true, context: true });
  }
}

export class ComposerRenderer {
  private notesApp: Application | null = null;
  private wheelCanvas: HTMLCanvasElement | null = null;
  private cache: ComposerCache | null = null;
  private themeDispose: (() => void) | null = null;

  // Persistent scene objects, created once per renderer instance - in FIELD INITIALISERS rather than
  // in init(), which test/composerRenderer.test.ts relies on: it counts plain Container
  // constructions after mounting to mean "the pool grew", so a container built inside init() would
  // read as a pooled view against nothing. notesColumnsContainer's children are the pooled
  // ColumnViews currently on screen (see the pool below); timelineContentContainer's are rebuilt by
  // drawTimelineStage, which only runs from draw() - on the full repaint and on the narrowed one
  // alike, which is why draw()'s own docstring lists the whole timeline rebuild among the things
  // narrowing does not save.
  private readonly notesColumnsContainer = new Container();
  /**
   * THE MINI-TIMELINE'S PLACE ON THE ONE CANVAS: a plain container holding the timeline's content
   * and its viewport outline, offset to `(TIMELINE_INSET_LEFT, height + TIMELINE_BAND_PADDING)` so
   * everything below it stays written in strip-local coordinates - drawTimelineStage's whole
   * geometry, viewportGraphics' 1.5px inset and testTimelineHitarea's `0..stripWidth()` by
   * `0..timelineHeight` bounds alike (pixi inverts the container's world transform before calling
   * `contains`, so the hitarea never sees either offset).
   *
   * THE POINTER HANDLERS ARE NOT COVERED BY THAT. `FederatedPointerEvent.globalX` is canvas space,
   * so handleTimelineDown and handleTimelineSlide convert it with stripX() explicitly; assuming the
   * container transform reaches them is what leaves handleTimelineDown's `sliderOffset` mixing two
   * coordinate spaces.
   *
   * ADDED TO THE STAGE LAST, and that order is load-bearing rather than cosmetic: pixi's
   * EventBoundary.hitTestRecursive walks a container's children in REVERSE and returns on the first
   * hit, so the strip is asked about a pointer before the notes container is. See
   * testTimelineHitarea for the deferral that makes the two agree, and test/composerRenderer.test.ts's
   * mount(), which states the whole child order.
   *
   * NOT its own render group: RenderGroupPipe breaks the stage's batch around every group, so a
   * second one buys an extra draw call and saves nothing - moving viewportGraphics queues only that
   * child, never a walk of the strip's static children.
   */
  private readonly timelineStrip = new Container();
  private readonly timelineContentContainer = new Container();
  private readonly viewportGraphics = new Graphics();
  /**
   * THE STRIP'S `overflow: hidden`, for the one child that needs it - see TIMELINE_STRIP_RADIUS.
   *
   * A SIBLING of viewportGraphics and not a child of it: the outline is MOVED every frame
   * (syncTimelineViewport writes its x and nothing else), and a mask parented to it would travel
   * with it and clip nothing. As a child of timelineStrip it stands still in strip space while the
   * outline slides under it.
   *
   * Redrawn only when the strip's size changes (syncViewportClip), which keeps it off both the
   * per-frame path and the per-update one: a `clear()` here would otherwise land in
   * test/composerRenderer.test.ts's global Graphics-clear count, which is how that file attributes
   * a repaint to a column.
   */
  private readonly viewportClip = new Graphics();
  /**
   * The playhead line. A sibling of notesColumnsContainer on the notes stage, added AFTER it so it
   * renders on top, and never moved: it is the fixed thing in this coordinate system and the
   * columns are what scroll. Only a resize redraws it (its height is the canvas'), which is why
   * drawPlayhead is called from init and from recalculateCacheAndSizes and nowhere else.
   *
   * SHOWN AND HIDDEN through `visible`, written from playheadIsVisible by init() and by update().
   * Not by skipping the drawing: `clear()` dirties the GraphicsContext, so a draw/clear toggle pays
   * a geometry rebuild per click, while `visible` keeps the uploaded geometry and pixi skips an
   * invisible container's whole subtree at render time.
   */
  private readonly playheadGraphics = new Graphics();

  /**
   * The column pool. `columnViews` is what is ON SCREEN, keyed by column index; `freeColumnViews`
   * holds detached views waiting to be reused. The invariant, maintained by acquire/release and
   * nothing else: a view is in exactly one of the two, views in the map are children of
   * notesColumnsContainer in ASCENDING INDEX ORDER, and views in the free list have no parent.
   *
   * Ascending order is not cosmetic bookkeeping - it is what makes the pooled scene graph the same
   * tree the pre-pool rebuild produced, so "the pool changed nothing visible" is a claim about the
   * tree rather than about columns happening not to overlap.
   *
   * Every view holds textures from the CURRENT ComposerCache, so cache regeneration destroys the
   * pool outright (dropColumnPool) rather than releasing it - see recalculateCacheAndSizes.
   */
  private readonly columnViews = new Map<number, ColumnView>();
  private readonly freeColumnViews: ColumnView[] = [];

  private state: ComposerRendererState;
  /**
   * The state of the last update() that actually PAINTED the notes stage, or null when nothing
   * on screen can be trusted to match a state at all - no cache yet, recording audio, or the pool
   * just dropped. Null forces the next update onto the full path.
   *
   * It is the left-hand side of every comparison in needsUnconditionalRepaint and of update()'s
   * version comparison; `this.state` is NOT, because
   * that one is overwritten on every call including the ones that paint nothing - diffing against
   * it would compare the incoming state against a moment that never reached the screen.
   *
   * THE FRAMES also paint, and do not touch this - which is not an omission. Everything this is
   * compared for is CONTENT, and a frame changes none of it: it moves the scroll position, which is
   * not a field of the state at all, and paints the columns that entered the window as a
   * consequence. So the columns on screen after a frame still show what this state says they show.
   *
   * Holding the object is safe: ComposerCanvas.svelte's $effect builds a fresh literal per run and
   * never mutates one it has handed over.
   */
  private paintedState: ComposerRendererState | null = null;
  /**
   * The state of the PREVIOUS update() call, whatever that call did - which is a different moment
   * from paintedState, and the difference is load-bearing.
   *
   * paintedState is the baseline for "what do the pixels currently show", so it is deliberately
   * only recorded by a run that painted. syncScrollSchedule is asking something else: "what did the
   * composer last tell me", so that a `selected` one higher than last time reads as a playback tick
   * and anything else reads as a jump. Those two questions had one answer while every update either
   * painted or changed nothing - and stopped having one when a running MOTION gave update() a third
   * outcome, the call that records a baseline and leaves the screen to the frame. Reading
   * paintedState there made every update after a non-painting one look like a discontinuity, which
   * re-anchored the schedule and snapped the playhead back to `selected` mid-column.
   */
  private previousState: ComposerRendererState | null = null;
  /**
   * The longest span in the song, cached against (columns identity, structure version) - the same
   * pair the two sites diff, for the same reason: needsUnconditionalRepaint holds the array
   * identity, update() holds the version, because a moved version narrows the repaint instead of
   * forcing it. The version moves on a graph edit but reads 0
   * on two different songs; the array identity moves on a song swap but not on every edit. Dropping
   * either half of the key returns a bound from the previous graph for the case the other half
   * covers, and test/composerRenderer.test.ts has a row for each.
   *
   * It bounds the backward scan in paintTails; an underestimate silently drops tails, so it is
   * recomputed rather than maintained incrementally. O(notes) once per structural edit, which is
   * user-paced - a tick that only moves `selected` leaves both halves of the key alone and reuses
   * the cached span.
   */
  private maxSpanCache: { columns: NoteColumn[]; structureVersion: number; span: number } | null =
    null;
  /**
   * The tail accent the pool is painted in, which is a different moment from `theme.tailAccent`.
   *
   * handleThemeChange replaces `this.theme` synchronously and then schedules the repaint through
   * recalculateCacheAndSizes' 50ms debounce. An update() landing in between takes the fast path and
   * repaints only the column that entered the window - so reading the new accent there would put
   * one column in the new colour beside a window still painted in the old one. This copy moves with
   * the repaint instead, so the columns on screen agree with each other. (The notes stage as a
   * whole still trails the DOM and the timeline for the length of that debounce; the textures do
   * too, and both catch up in the same repaint.)
   */
  private paintTailAccent: number;

  /**
   * WHERE THE CANVAS IS SCROLLED TO, as a fractional column index: the column-space coordinate
   * under the playhead (see PLAYHEAD_COLOR's note for the coordinate system). An integer while
   * `motion` is `resting`, fractional for the length of any other motion.
   *
   * It is this class's own value and NOT a mirror of `state.selected`, which is the whole point:
   * `selected` moves in whole columns at tick boundaries and runs ahead of the audio by the
   * lookahead, while this moves continuously and in time with what is heard - and during a drag or
   * an ease it moves with the user's hand while `selected` steps a column at a time behind it. See
   * the Motion type for the invariant that says when the two are back together.
   */
  private scrollPosition = 0;
  /**
   * WHICH COLUMN CARRIES THE SELECTED OVERLAY, or NO_OVERLAY_COLUMN for "no column does". Recomputed
   * from the incoming state by update() and by the constructor, and by nothing else; read by
   * paintColumn, paintSelectionOverlay and syncOverlayColumn. The first two must agree, because the
   * narrowed repaint reaches columns through both.
   *
   * It is `state.smoothScroll ? NO_OVERLAY_COLUMN : state.selected` - R1's mutual exclusion, keyed
   * on the setting and not on whether the song is playing. In snap mode that is the rule the class
   * had before the playhead existed; in glide mode there is no overlay for the line to disagree
   * with, which is what retired the "follow the playhead, not `selected`" rule this field used to
   * implement.
   */
  private overlayColumn: number;
  /**
   * WHICH COLUMN THE POOL CURRENTLY SHOWS THE OVERLAY ON, or null for "nothing on screen has been
   * painted for a state at all". The painted counterpart of overlayColumn, in the same relation to
   * it as paintedState is to state, and it is what lets a frame move the overlay without a caller
   * having to hand it the previous value - see syncOverlayColumn.
   *
   * Reset by dropColumnPool alongside paintedState, because the pool it describes has stopped
   * existing.
   */
  private paintedOverlayColumn: number | null = null;
  /**
   * The scheduled travel, oldest first and contiguous - see ScrollSegment. Empty means nothing is
   * gliding and scrollPosition is wherever it was put.
   */
  private scrollSegments: ScrollSegment[] = [];
  /** What is moving the scroll position, and with it whether the Ticker runs - see Motion. */
  private motion: Motion = { kind: 'resting' };
  /**
   * The rounded viewport x the outline was last MOVED to, or NaN for "it has never been moved". The
   * gate that keeps the outline off the per-frame path - see syncTimelineViewport.
   */
  private writtenViewportX = Number.NaN;
  /** The strip size viewportClip was last cut to, or NaN for "never" - see syncViewportClip. */
  private clipWidth = Number.NaN;
  private clipHeight = Number.NaN;

  private numberOfColumnsPerCanvas: number;
  private width: number;
  private height: number;
  private columnSize: { width: number; height: number };
  private timelineHeight = 30;
  private stageBackgroundColor: number;
  private theme: ComposerRendererTheme;

  /**
   * The press a stage drag may grow out of, or null for "no pointer is down on the notes stage".
   *
   * Separate from `motion` because a press is NOT yet a drag: the motion is entered only once the
   * pointer has travelled DRAG_SLOP_PX (see handleStageSlide), so a click during playback leaves the
   * glide it landed on completely alone. The drag is stated as an OFFSET from (`x`,
   * `anchorPosition`) rather than accumulated per move - an accumulator drifts, and a drift here is
   * a canvas that has slid out from under the finger.
   *
   * `x` is the press. `anchorPosition` is written twice and only the second write is the one that
   * matters: handleStageSlide replaces it with the live scroll position at the instant the drag
   * starts, which is what keeps a glide running under a hesitating finger from being given back.
   * The press's value is what the field is initialised to.
   *
   * `id` IS THE POINTER THAT OWNS THE GESTURE, and it is what makes this one field rather than a
   * map: the composer has exactly one scroll position, so a second concurrent pointer cannot be a
   * second drag - it can only corrupt this one. pixi dispatches per pointerId AND per mouse button
   * (EventBoundary.mapPointerDown fires 'pointerdown' for every button, and EventSystem registers
   * pointerdown on the canvas element), so "a second pointer" is a second finger on a touch screen
   * OR a right-button press during a left-button drag. Without the id, that second press reached
   * handleStageDown and overwrote (`x`, `anchorPosition`) with its own; the first pointer's next
   * move was then measured against a position it had never been at, and a 10px nudge moved the
   * canvas 7 columns. Every handler below compares before it acts, so the FIRST press owns the
   * surface until it is released and the second is ignored outright.
   *
   * The merge is what made this reachable: before it, a press over the mini-timeline landed on a
   * DIFFERENT canvas element with its own EventBoundary, so the two surfaces could not see each
   * other's pointers.
   */
  private stagePointer: { id: number; x: number; anchorPosition: number } | null = null;
  /**
   * The pointerId scrubbing the mini-timeline, or null for "no pointer is down on the strip".
   *
   * THE STRIP'S HALF OF THE ONE-GESTURE-AT-A-TIME RULE - see stagePointer's `id` for the other half
   * and for why an id rather than a boolean. The timeline needs a field of its own because its press
   * IS its drag (handleTimelineDown enters the motion at once), so `motion` would answer "a timeline
   * drag is running" for a gesture the window listener had already cancelled.
   */
  private timelinePointer: number | null = null;
  /**
   * The distance, in timeline px, from the position the viewport rectangle stands for to where the
   * pointer grabbed it - so the rectangle stays under the finger rather than jumping its centre
   * there. Only meaningful while `onSlider` - the two are written together by handleTimelineDown.
   */
  private sliderOffset = 0;
  /** Whether the timeline press landed inside the viewport rectangle rather than beside it. */
  private onSlider = false;
  private cacheRecalculateDebounce: Timer = 0;

  constructor(
    private readonly canvasContainer: HTMLElement,
    initialState: ComposerRendererState,
    private readonly callbacks: ComposerRendererCallbacks
  ) {
    this.state = initialState;
    this.scrollPosition = initialState.selected;
    // Seeded here as well as in update() because a renderer can paint a whole scene without ever
    // being handed a state: init() -> subscribeTheme -> recalculateCacheAndSizes -> draw().
    this.overlayColumn = initialState.smoothScroll ? NO_OVERLAY_COLUMN : initialState.selected;
    this.numberOfColumnsPerCanvas = initialState.columnsPerCanvas;
    // Placeholders - init() always overwrites width/height/columnSize with the real computed
    // size before any Application is created.
    this.width = 300;
    this.height = 150;
    this.columnSize = { width: nearestEven(300 / this.numberOfColumnsPerCanvas), height: 150 };
    this.stageBackgroundColor = ThemeProvider.get('primary').rgb().rgbNumber();
    // Placeholder - init() calls subscribeTheme(this.handleThemeChange) before anything else
    // runs, and that callback fires synchronously once, overwriting this before first draw().
    this.theme = {
      timeline: {
        hex: ThemeProvider.layer('primary', 0.1).toString(),
        hexNumber: ThemeProvider.layer('primary', 0.1).rgb().rgbNumber(),
        selected: ThemeProvider.get('composer_accent').negate().rgb().rgbNumber(),
        border: ThemeProvider.get('composer_accent').rgb().rgbNumber(),
      },
      sideButtons: {
        hex: ThemeProvider.get('primary').darken(0.08).toString(),
        rgb: colorToRGB(ThemeProvider.get('primary').darken(0.08)).join(','),
      },
      main: {
        background: ThemeProvider.get('primary').rgb().rgbNumber(),
        backgroundHex: ThemeProvider.get('primary').toString(),
        backgroundOpacity: ThemeProvider.get('primary').alpha(),
      },
      tailAccent: ThemeProvider.get('accent').rgbNumber(),
      playhead: ThemeProvider.get('accent').rgbNumber(),
    };
    this.paintTailAccent = this.theme.tailAccent;
  }

  // ComposerCanvas.svelte's onMount must await this before ever calling update().
  async init(): Promise<void> {
    const { width, height, columnWidth } = this.computeCanvasSize();
    this.width = width;
    this.height = height;
    this.columnSize = { width: columnWidth, height };
    this.timelineHeight = composerTimelineHeight();

    this.notesApp = new Application();
    await this.notesApp.init({
      width: this.width,
      //the whole canvas: the notes region AND the band the mini-timeline sits in - see canvasHeight
      height: this.canvasHeight(),
      background: this.stageBackgroundColor,
      autoDensity: true,
      autoStart: false,
      antialias: true,
      resolution: window.devicePixelRatio ?? 1.4,
    });
    this.canvasContainer.appendChild(this.notesApp.canvas);
    this.wheelCanvas = this.notesApp.canvas;
    // ON THE CANVAS ELEMENT, which now covers the mini-timeline as well - so a wheel over the strip
    // scrolls the composer where before the merge it reached no listener at all. Deliberate: the
    // strip is part of the same surface now, and the alternative would be an element-space y test
    // here purely to reproduce a dead zone nobody asked for.
    this.wheelCanvas.addEventListener('wheel', this.handleWheel);
    this.applyNotesCanvasOpacity();
    this.notesApp.renderer.background.color = this.theme.main.background;
    this.notesColumnsContainer.eventMode = 'static';
    this.notesColumnsContainer.interactiveChildren = false;
    this.notesColumnsContainer.hitArea = this.testStageHitarea;
    this.notesColumnsContainer.on('pointerdown', this.handleStageDown);
    this.notesColumnsContainer.on('pointerup', this.handleStageUp);
    this.notesColumnsContainer.on('pointermove', this.handleStageSlide);
    this.notesApp.stage.addChild(this.notesColumnsContainer);
    /**
     * ITS OWN RENDER GROUP, which is what makes scrolling it cheap enough to do every frame.
     *
     * pixi applies a plain container's transform on the CPU: moving one marks it in its parent
     * render group, and the next render runs updateTransformAndChildren over EVERY descendant,
     * handing each one that has a render pipe to updateRenderable - which for a Sprite repacks its
     * four vertices into the batch buffer (visibility is not tested there; RenderGroupPipe.execute
     * does that later). The window here is a few hundred nodes, so that is a few hundred
     * matrix appends and vertex repacks per frame. A render group root's transform is applied at
     * draw time as a uniform instead, and updateTransformAndChildren does not recurse into one
     * (node_modules/pixi.js/lib/scene/container/utils/updateRenderGroupTransforms.mjs, the
     * `if (!container.renderGroup)` guard), so moving this costs one matrix update whatever it
     * holds.
     *
     * What it costs back: the group cannot merge into the stage's batch, so the playhead and the
     * timeline strip beside it are a second draw call. And a column entering or leaving the pool
     * now sets structureDidChange on THIS group rather than on the stage's, so the instruction
     * rebuild it forces no longer invalidates the playhead's - the pool churn is if anything
     * cheaper than before.
     *
     * Not cacheAsTexture: that also enables a render group, but its texture is only refreshed by an
     * explicit updateCacheTexture() call, so the pool adding and removing views would show stale
     * pixels until something asked.
     */
    this.notesColumnsContainer.enableRenderGroup();
    //a sibling added after the columns, so it renders over them
    this.notesApp.stage.addChild(this.playheadGraphics);
    this.drawPlayhead();
    //R1's half of the mode gate that update() cannot cover: a renderer can paint a whole scene
    //without ever being handed a state, through subscribeTheme below
    this.playheadGraphics.visible = this.playheadIsVisible(this.state);

    /**
     * THE FRAME LOOP, on the notes Application's own Ticker - see the Motion type for the rule that
     * says when it runs, and startMotionFrames/stopMotionFrames for the only two callers of
     * start/stop.
     *
     * pixi's TickerPlugin registers `app.render` on this ticker at UPDATE_PRIORITY.LOW during
     * `Application.init`, regardless of `autoStart` - `autoStart` only decides whether `start()` is
     * called (node_modules/pixi.js/lib/app/TickerPlugin.mjs). That listener is REMOVED here, so
     * every render this class does is one it asked for: onMotionFrame renders only on a frame that
     * actually moved the position, which is what makes a schedule stalled on a late tick cost no
     * renders at all, and it leaves update()-driven repaints rendering synchronously rather than
     * waiting up to a capped frame for the next tick.
     *
     * ONE TICKER FOR THE WHOLE CANVAS: the mini-timeline is a container on this same stage, so it
     * rides on the render a frame already makes and never asks for one of its own. What the merge
     * did NOT remove is a second requestAnimationFrame - `Ticker.autoStart` is false and the
     * timeline Application's ticker was never started, so it had asked for none.
     */
    this.notesApp.ticker.remove(this.notesApp.render, this.notesApp);
    this.notesApp.ticker.maxFPS = COMPOSER_MOTION_MAX_FPS;
    this.notesApp.ticker.add(this.onMotionFrame, this);

    this.timelineContentContainer.eventMode = 'static';
    this.timelineContentContainer.interactiveChildren = false;
    this.timelineContentContainer.hitArea = this.testTimelineHitarea;
    this.timelineContentContainer.on('pointerdown', this.handleTimelineDown);
    this.timelineContentContainer.on('pointerup', this.handleTimelineUp);
    this.timelineContentContainer.on('pointermove', this.handleTimelineSlide);
    this.timelineStrip.addChild(this.timelineContentContainer);
    // viewportGraphics is a sibling added after the content container, so it renders on top.
    this.timelineStrip.addChild(this.viewportGraphics);
    this.initViewportClip();
    this.positionTimelineStrip();
    //THE LAST child of the stage, which is what makes pixi hit-test the strip before the columns -
    //see the field. Draw order is free here, the two regions never overlapping in y.
    this.notesApp.stage.addChild(this.timelineStrip);

    window.addEventListener('resize', this.recalculateCacheAndSizes);
    window.addEventListener('pointerup', this.resetPointerDown);
    // pointercancel, which pixi does not deliver at all: EventSystem._addEvents registers
    // pointermove/down/leave/over/up on the DOM and nothing for cancel, so an OS gesture, an edge
    // swipe or palm rejection ends the pointer stream with no event either handler can see. A drag
    // is a MOTION now rather than a boolean, and a `dragging` motion nothing ends freezes the whole
    // canvas: syncScrollSchedule returns at its first statement on every update after it, so the
    // scene stops following `selected` while the song plays on, and the Ticker rule keeps the
    // frames running for the life of the renderer.
    window.addEventListener('pointercancel', this.resetPointerDown);
    window.addEventListener('blur', this.resetPointerDown);

    // REPORTED HERE AND NOT ONLY FROM recalculateCacheAndSizes, which is behind a 50ms debounce:
    // the three timeline buttons are absolutely positioned from this report now, so waiting for the
    // debounce would render them collapsed to nothing for those 50ms. `hasCache` is false here,
    // which is the value the template already starts at, so the only thing this moves earlier is
    // the geometry.
    this.notifyGeometry();
    this.themeDispose = subscribeTheme(this.handleThemeChange);
    // subscribeTheme's callback fires synchronously once before returning, which already
    // calls recalculateCacheAndSizes via handleThemeChange - no separate call needed here.
  }

  /**
   * THE ONLY DOM MEASUREMENT this class makes. The arithmetic over it lives in
   * composerCanvasGeometry.composerCanvasSize, which ComposerCanvas.svelte also renders as a CSS
   * expression for the placeholder it shows before this renderer exists - see that function.
   */
  private computeCanvasSize(): { width: number; height: number; columnWidth: number } {
    const sizes = document.body.getBoundingClientRect();
    const { width, height } = composerCanvasSize({
      bodyWidth: sizes.width,
      bodyHeight: sizes.height,
      inPreview: Boolean(this.state.inPreview),
    });
    const columnWidth = nearestEven(width / this.numberOfColumnsPerCanvas);
    return { width, height, columnWidth };
  }

  /**
   * THE WHOLE CANVAS: the notes region, then the band the mini-timeline sits in. The only two things
   * that want this number are the Application's initial size and the resize - everything else in
   * this class wants `this.height`, which is the notes region and is what every note's y, every
   * tail, the cache's texture height, the playhead and the stage hitarea are stated against.
   *
   * It comes to exactly the height the composer's canvas + timeline DIVs occupied before the merge
   * (`.canvas-relative` + `.timeline-wrapper-bg`'s two 0.2rem padding rows + the strip), so the grid
   * row around it does not reflow.
   */
  private canvasHeight(): number {
    return composerCanvasElementHeight(this.height, this.timelineHeight);
  }

  /**
   * The strip's place on the canvas: directly under the notes region, one padding row down, and
   * inset from the left by the two breakpoint buttons that float over the canvas there.
   *
   * THE ONE WRITE THAT PUTS THE WHOLE SUBTREE IN STRIP-LOCAL COORDINATES. drawTimelineStage's
   * geometry, viewportGraphics' position and testTimelineHitarea's bounds are all written as
   * `0..stripWidth()` and never carry the inset themselves, because pixi inverts this container's
   * world transform before calling `hitArea.contains` and applies it when rendering the children.
   * The two POINTER HANDLERS are the exception and must convert explicitly - see stripX().
   */
  private positionTimelineStrip(): void {
    this.timelineStrip.x = TIMELINE_INSET_LEFT;
    this.timelineStrip.y = this.height + TIMELINE_BAND_PADDING;
  }

  /**
   * Attaches the clip that keeps the viewport outline inside the strip - see TIMELINE_STRIP_RADIUS
   * for why the outline needs one and the rest of the strip does not.
   *
   * ADDED TO THE STRIP AFTER the outline, so it neither renders (a mask is `includeInBuild = false`
   * while it is one) nor changes what draws over what. What it DOES change is hit testing on
   * viewportGraphics, which pixi prunes against a container's mask: that container has no hitArea
   * and its only interactive sibling sets `interactiveChildren = false`, so it was never a pointer
   * target to begin with.
   */
  private initViewportClip(): void {
    this.timelineStrip.addChild(this.viewportClip);
    this.viewportGraphics.mask = this.viewportClip;
    this.syncViewportClip();
  }

  /**
   * The clip's shape, which is the strip's own: exactly what drawTimelineStage gives the background,
   * corner radius included, so the outline is cut by the same arc the bar is drawn with.
   *
   * GATED ON THE SIZE HAVING MOVED. Only a resize or a theme change can change it, and rebuilding a
   * GraphicsContext per draw() would both dirty geometry no frame needs and put a `clear()` inside
   * the window test/composerRenderer.test.ts counts Graphics clears in to decide which columns a
   * repaint touched.
   */
  private syncViewportClip(): void {
    const width = this.stripWidth();
    if (width === this.clipWidth && this.timelineHeight === this.clipHeight) return;
    this.clipWidth = width;
    this.clipHeight = this.timelineHeight;
    this.viewportClip.clear();
    this.viewportClip.roundRect(0, 0, width, this.timelineHeight, TIMELINE_STRIP_RADIUS);
    //a mask is read as coverage rather than as colour, so the fill's own colour never reaches a pixel
    this.viewportClip.fill({ color: 0xffffff });
  }

  /**
   * THE STRIP'S DRAWN WIDTH: the canvas less the two ends the DOM buttons stand on (see
   * TIMELINE_INSET_LEFT). Every timeline value that means "across the whole song" divides by this;
   * every value that means "what the canvas is showing" still divides by `this.width`.
   *
   * FLOORED AT 1 because it is a divisor. The insets come to a fixed 121.6px whatever the canvas is,
   * and computeCanvasSize can in principle land below that in preview at an extreme viewport
   * (`body * 0.85 - 45`, then times 0.8) - the floor turns a non-finite scroll position into a
   * degenerate but finite one rather than propagating NaN into `selected`.
   */
  private stripWidth(): number {
    return Math.max(1, this.width - TIMELINE_INSET_LEFT - TIMELINE_INSET_RIGHT);
  }

  /** One song column's width ON THE STRIP - the one statement timelineViewport() and draw() share. */
  private timelineColumnWidth(): number {
    return this.stripWidth() / this.state.columns.length;
  }

  /**
   * A pointer's x in the STRIP'S own space. `FederatedPointerEvent.globalX` is CANVAS space
   * (node_modules/pixi.js/lib/events/FederatedMouseEvent.mjs), and the container transform pixi
   * inverts for `hitArea.contains` has no reach over it - so the two handlers that read `globalX`
   * convert here rather than relying on positionTimelineStrip's offset.
   */
  private stripX(canvasX: number): number {
    return canvasX - TIMELINE_INSET_LEFT;
  }

  /** The playhead's x, and with it the anchor of every column position - see PLAYHEAD_COLOR. */
  private playheadX(): number {
    return this.width / 2;
  }

  private windowGeometry(): ColumnWindowGeometry {
    return { width: this.width, columnWidth: this.columnSize.width, playheadX: this.playheadX() };
  }

  /** The notes container's offset that puts `scrollPosition` under the playhead. */
  private containerX(): number {
    return this.playheadX() - this.scrollPosition * this.columnSize.width;
  }

  /**
   * WHETHER THE LINE IS ON SCREEN. `smoothScroll` is the mode gate R1 states; `isRecordingAudio` is
   * there because the playhead is a SIBLING of notesColumnsContainer rather than a child of it, so
   * drawNotesStage hiding the columns for a recording has no reach over it - without this the
   * recording shows an empty background with a red line standing still in the middle of it, still
   * because applyScrollPosition returns before touching anything while that flag is set.
   */
  private playheadIsVisible(state: ComposerRendererState): boolean {
    return state.smoothScroll && !state.isRecordingAudio;
  }

  /**
   * The bar and its two arrowheads, in ONE fill: three shapes queued against the same Graphics and
   * filled together, so the colour and alpha cannot drift apart between them.
   *
   * Each arrowhead is a triangle whose apex points INWARDS along the bar - the top one down, the
   * bottom one up - with its base flush against the canvas edge, so nothing is drawn outside the
   * canvas and neither arrow needs clipping. Both are centred on the same x the bar is, which is
   * what makes the whole mark read as one object rather than three.
   */
  private drawPlayhead(): void {
    const centre = this.playheadX();
    const bottom = this.height;
    this.playheadGraphics.clear();
    this.playheadGraphics.rect(centre - PLAYHEAD_WIDTH / 2, 0, PLAYHEAD_WIDTH, bottom);
    this.playheadGraphics.poly([
      centre - PLAYHEAD_ARROW_HALF_WIDTH,
      0,
      centre + PLAYHEAD_ARROW_HALF_WIDTH,
      0,
      centre,
      PLAYHEAD_ARROW_LENGTH,
    ]);
    this.playheadGraphics.poly([
      centre - PLAYHEAD_ARROW_HALF_WIDTH,
      bottom,
      centre + PLAYHEAD_ARROW_HALF_WIDTH,
      bottom,
      centre,
      bottom - PLAYHEAD_ARROW_LENGTH,
    ]);
    this.playheadGraphics.fill({ color: this.theme.playhead, alpha: PLAYHEAD_ALPHA });
  }

  private recalculateCacheAndSizes = () => {
    if (this.cacheRecalculateDebounce) clearTimeout(this.cacheRecalculateDebounce);
    this.cacheRecalculateDebounce = setTimeout(() => {
      if (!this.notesApp) return;
      const { width, height, columnWidth } = this.computeCanvasSize();
      const oldCache = this.cache;
      // BEFORE the resize, which is what canvasHeight() reads: it is stated against `this.height`,
      // so resizing first would size the canvas to the PREVIOUS frame's notes region and leave the
      // strip drawn over the columns until the next resize caught up.
      this.width = width;
      this.height = height;
      this.columnSize = { width: columnWidth, height };
      this.notesApp.renderer.resize(width, this.canvasHeight());
      //...and the strip sits under the notes region, which has just moved
      this.positionTimelineStrip();
      this.cache = this.generateCache(columnWidth, height, isMobile() ? 2 : 4, this.timelineHeight);
      // EVERY input to a pooled view changed here: the column geometry AND every texture it holds
      // (the old cache's textures are destroyed 500ms below, so a surviving pool would end up
      // pointing at destroyed GPU resources). Nothing in the state diff can see any of this - theme
      // and resize have no props channel - so the pool is dropped outright rather than released for
      // reuse, and draw() below repaints from nothing.
      this.dropColumnPool();
      // ...and the accent the pool paints tails in moves here, with the repaint below, rather than
      // when handleThemeChange replaced this.theme - see the field.
      this.paintTailAccent = this.theme.tailAccent;
      //the line spans the notes region's height and sits at its horizontal centre, so both of its
      //inputs just moved
      this.drawPlayhead();
      this.notifyGeometry();
      // draw() rebuilds and explicitly repaints the static scenes after cache regeneration.
      this.draw();
      // QUIRK: destroying the previous cache is delayed 500ms after the new one is created -
      // destroying it immediately causes visible texture glitches (found empirically; root
      // cause not identified).
      setTimeout(() => {
        oldCache?.destroy();
      }, 500);
    }, 50);
  };

  private generateCache(
    columnWidth: number,
    height: number,
    margin: number,
    timelineHeight: number
  ): ComposerCache | null {
    const colors = {
      l: ThemeProvider.get('primary'), //light
      d: ThemeProvider.get('primary'), //dark
    };
    colors.l = colors.l.luminosity() < 0.05 ? colors.l.lighten(0.4) : colors.l.lighten(0.1);
    colors.d = colors.d.luminosity() < 0.05 ? colors.d.lighten(0.15) : colors.d.darken(0.03);
    if (!this.notesApp) return null;
    return new ComposerCache({
      width: columnWidth,
      height,
      margin,
      timelineHeight,
      app: this.notesApp,
      colors: {
        accent: ThemeProvider.get('composer_accent').rotate(20).darken(0.5),
        mainLayer: ThemeProvider.get('composer_main_layer'),
        secondLayer: ThemeProvider.get('composer_secondary_layer'),
        bars: [
          { color: colors.l.rgb().rgbNumber() }, //lighter
          { color: colors.d.rgb().rgbNumber() }, //darker
          { color: ThemeProvider.get('composer_accent').rgb().rgbNumber() }, //current
          { color: ThemeProvider.get('composer_accent').negate().rgb().rgbNumber() }, //selected
        ],
      },
    });
  }

  // The notes canvas' own CSS opacity, taken from the theme's background alpha. It is a DOM style
  // on the pixi canvas ELEMENT rather than anything in the pixi scene, so a scene description
  // cannot see it while it drives the whole canvas to invisible on its own.
  // test/composerRenderer.test.ts reads the element's whole inline style beside the scene, and
  // states the declaration it expects from ThemeProvider - see its expectedCanvasStyle.
  private applyNotesCanvasOpacity = () => {
    if (this.wheelCanvas)
      this.wheelCanvas.style.opacity = String(this.theme.main.backgroundOpacity);
  };

  // ── the scroll schedule ────────────────────────────────────────────────────────────────────────

  /**
   * How long column `index` lasts, by the arithmetic Composer.svelte's playback loop waits by: it
   * rounds `(60000 / bpm) * changer` to whole ms, which is the same rounding Song.roundTime does.
   * Matching the rounding is what keeps a glide the same length as the column it travels through,
   * so the two do not drift apart within a column.
   *
   * What this deliberately leaves out is that loop's `delayOffset` drift term - the correction it
   * carries from tick to tick for how late the last one was. A segment inherits that a different
   * way, through the MEASURED instant scheduleScrollSegment writes as its start (see ScrollSegment),
   * which is why the same arithmetic here does not have to know about it.
   */
  private columnDurationMs(index: number): number {
    const column = this.state.columns[index];
    const changer = column ? (TEMPO_CHANGERS[column.tempoChanger]?.changer ?? 1) : 1;
    //a zero/absent bpm would make every segment infinitely long and freeze the playhead
    const bpm = this.state.bpm > 0 ? this.state.bpm : 220;
    return Math.max(1, Math.round((60000 / bpm) * changer));
  }

  private scheduleScrollSegment(column: number, startMs: number, durationMs: number): void {
    const last = this.scrollSegments[this.scrollSegments.length - 1];
    // The measurement replacing the prediction - see ScrollSegment - but ONLY WHERE IT SHORTENS
    // the previous segment, which is the case where the tick came in early. Stretching it instead
    // would move the playhead BACKWARDS: the position inside a segment is a fraction of its length,
    // so lengthening one at a fixed instant puts the playhead behind where the frame before it
    // already drew. A tick arriving LATE therefore leaves the prediction alone and the playhead
    // clamps at the column boundary until the new segment's turn - a brief stall at the line, which
    // reads as the music being late rather than as the canvas stepping back. Nothing accumulates
    // either way, because every segment is anchored on the tick that scheduled it rather than on
    // the one before.
    if (last && startMs > last.startMs && startMs < last.endMs) last.endMs = startMs;
    this.scrollSegments.push({ from: column, startMs, endMs: startMs + durationMs });
  }

  /**
   * The scheduled position at a wall-clock instant, or null when nothing is scheduled.
   *
   * Expired segments are dropped as it goes, EXCEPT the last one, which is kept so a schedule that
   * has run out holds the playhead at the end of the column it reached rather than snapping back to
   * an integer or resetting to `selected`. That is what a late tick looks like: a brief stall at
   * the line, which reads as the music being late rather than as the canvas glitching.
   */
  private scrollPositionAt(nowMs: number): number | null {
    const segments = this.scrollSegments;
    while (segments.length > 1 && segments[0].endMs <= nowMs) segments.shift();
    const segment = segments[0];
    if (!segment) return null;
    if (nowMs <= segment.startMs) return segment.from;
    const length = segment.endMs - segment.startMs;
    const progress = length > 0 ? Math.min(1, (nowMs - segment.startMs) / length) : 1;
    return segment.from + progress;
  }

  /**
   * What update() decides about the scroll before anything paints, because every path below it
   * reads `scrollPosition` for the container offset.
   *
   * WHILE THE SONG PLAYS WITH SMOOTH SCROLLING ON, three cases, and the schedule is the same
   * statement in all of them: an update carrying `selected = i` means the playhead is at the START
   * of column i one lookahead from now, and travels through it over that column's length.
   *  - A PLAYBACK TICK - `selected` advancing by exactly one from a state that was ALSO playing -
   *    appends that segment to the queue. The one before it ends where this one begins, which is
   *    what makes the timeline contiguous.
   *  - ANY OTHER MOVE - play being pressed, a click, the wheel, a drag, a breakpoint jump - is a
   *    discontinuity, so the queue is dropped and the playhead re-anchored on the new column
   *    before the same segment is scheduled from there. WITHOUT THAT SCHEDULE the next tick's
   *    segment would be the only one in the queue, and since it starts a lookahead in the future,
   *    the first frame would find nothing covering the present and jump the playhead to that
   *    segment's start column. It is the same gap at play time and after a jump; both are here.
   *  - `selected` NOT MOVING leaves the schedule alone, so an edit made during playback - note
   *    entry is not gated on isPlaying - does not interrupt the glide.
   *
   * Everything else snaps: any move while smooth scrolling is off or the song is stopped. Stopping
   * snaps to `selected` too, and the direction depends on where the playhead had got to: pausing
   * mid-column pulls it FORWARD by up to a lookahead's worth of travel, while a song running off
   * its own end pushes it BACK by the part of the last column it had already entered (the tick that
   * ends playback comes a whole column after the one that selected that column). Either way the
   * alternative is leaving the playhead somewhere `selected` is not, and every click, edit and jump
   * downstream reasons in terms of `selected`.
   *
   * THREE STATEMENTS ABOUT THE MANUAL MOTIONS OUTRANK PARTS OF THAT, all guarded near the top:
   *  - a DRAG outranks everything for its duration. It is the user's hand on the canvas, so a tick
   *    arriving mid-drag is dropped rather than queued and the snap below cannot yank the canvas
   *    back to a column boundary the drag has just left - which would fire once per column crossed,
   *    Svelte flushing the selectColumn round-trip in a microtask between two pointermove events.
   *    The release settles, and the next tick after it takes the discontinuity branch and resumes.
   *    The one thing that branch DOES do is re-quantise the live position when `smoothScroll` went
   *    off mid-gesture.
   *  - an EASE CANNOT OUTLIVE THE MODE it belongs to: with `smoothScroll` off there is no eased
   *    motion, so a running one finishes at its own target at once.
   *  - an EASE otherwise outranks the SNAP but not the transport. It is already heading for a column
   *    it asked for, so resting would just jump it to its own destination; but a playback tick, a
   *    breakpoint jump or an undo moving `selected` off that target abandons it, which is the snap
   *    those paths expect. `state.selected === motion.to` is what tells the two apart.
   */
  private syncScrollSchedule(
    previous: ComposerRendererState | null,
    state: ComposerRendererState
  ): void {
    if (this.motion.kind === 'dragging') {
      // A MODE FLIP MID-GESTURE. The gesture continues - the anchor is what the finger grabbed, and
      // re-taking it would jump the canvas under a pointer that never moved - so all that changes
      // is the grid the position is written on. Without this the canvas would sit on a fraction
      // until the next pointermove or the release, while the overlay the same update just turned
      // back on sits on a whole column.
      //
      // FLOOR, and not the round every later move uses: floor is the column the drag has ALREADY
      // handed to selectColumn, so it is the column the mark is on, and landing there is how the
      // canvas and the mark end up on the same one without this method calling selectColumn from
      // inside an update. From the next pointermove onwards snapManualPosition rounds, and that
      // move publishes its own column in the ordinary way.
      //
      // Written unconditionally rather than behind a change test, for the reason ColumnView.paint
      // writes properties the object already holds: flooring an integer is a no-op. (OFF->ON needs
      // nothing at all: the next move writes a continuous position, and the anchor was never
      // quantised - see snapManualPosition.)
      if (!state.smoothScroll) this.motion.position = Math.floor(this.motion.position);
      return;
    }
    // RECORDING OUTRANKS EVERYTHING, including a drag - the guard above it is the one exception
    // this branch is deliberately placed after, since a pointer cannot be down during a recording
    // the user started with the same pointer.
    //
    // The transport runs the whole song while AudioRecorder captures it in real time, so every tick
    // below would schedule a segment and keep the ticker emitting for the length of the recording.
    // Nothing it computed would reach the screen - applyScrollPosition returns before touching the
    // scene while this flag is set, and drawNotesStage hides the columns - but the frames were still
    // taken: measured at 62 rAF callbacks and 29 emits per second on a 60Hz clock, against a capture
    // that dropouts if the main thread stalls. rest() is what makes both zero.
    //
    // What it does NOT stop is the once-per-tick repaint: `isRecordingAudio` is on
    // needsUnconditionalRepaint, so every transport tick still reaches draw(), which hides the
    // columns, rebuilds the timeline content and renders the canvas once - measured at one render
    // per tick, back when that was one render of each of two Applications. That is the rate the
    // composer ran at before any of the smooth-scroll
    // work existed, and the timeline strip stays visible during a recording, so it is also the only
    // sign the recording is progressing.
    if (state.isRecordingAudio) return this.rest();
    // AN EASE CANNOT SURVIVE THE MODE IT BELONGS TO. Turning smooth scrolling off mid-ease would
    // otherwise leave 140ms of smooth motion running in the mode whose whole point is that there is
    // none. settleAt(motion.to) rather than falling through to rest(): the ease's target is the
    // column that was ASKED for, and `selected` may still be a microtask behind it, so resting
    // would yank the canvas back and the next update would push it forward again.
    if (!state.smoothScroll && this.motion.kind === 'easing') return this.settleAt(this.motion.to);
    if (state.isPlaying && state.smoothScroll && previous !== null) {
      const advancedOneColumn = previous.isPlaying && state.selected === previous.selected + 1;
      if (advancedOneColumn) {
        this.scheduleScrollSegment(
          state.selected,
          this.now() + state.lookaheadMs,
          this.columnDurationMs(state.selected)
        );
        this.enterMotion({ kind: 'playback' });
        return;
      }
      if (previous.isPlaying && state.selected === previous.selected) {
        // The glide carries on untouched - an edit during playback is not a discontinuity. The
        // QUEUE is what decides whether that is a motion at all: with nothing scheduled there is
        // nothing to travel through, and entering `playback` anyway would leave the frames running
        // against an empty schedule for as long as the song played.
        if (this.scrollSegments.length > 0) this.enterMotion({ kind: 'playback' });
        else this.rest();
        return;
      }
      this.scrollSegments.length = 0;
      this.scrollPosition = state.selected;
      this.scheduleScrollSegment(
        state.selected,
        this.now() + state.lookaheadMs,
        this.columnDurationMs(state.selected)
      );
      this.enterMotion({ kind: 'playback' });
      return;
    }
    if (this.motion.kind === 'easing' && state.selected === this.motion.to) {
      this.scrollSegments.length = 0;
      return;
    }
    if (
      this.motion.kind === 'playback' &&
      previous !== null &&
      previous.isPlaying &&
      !state.isPlaying
    ) {
      // PAUSING, which is the one stop that is not a discontinuity: the playhead is mid-column and
      // halting it dead is the jump this eases away. It settles BACKWARD onto the column it is
      // inside - the last one whose notes were played - and not onto `selected`, which the
      // transport had already advanced to but whose notes are still a lookahead from being heard.
      // So pressing play again resumes on the column the line is parked at, rather than skipping
      // the one that was only half heard.
      //
      // REACHING THE END OF THE SONG arrives as the same isPlaying transition - Composer.svelte's
      // playback tick calls togglePlay(false) when it runs out of columns, WITHOUT advancing
      // `selected` past the last one - but it is the one stop that must not settle backward. There
      // is no resume to park for, and the notes the transport already scheduled are on the audio
      // clock and will sound; the playhead belongs where the song ends. Settling backward left it a
      // lookahead short, which is invisible at tempo 1 (a lookahead is about one column) and gross
      // where the song ends in fast tempo changers: eight 1/8 columns last 34ms each against a
      // 250ms lookahead, so the line parked eight columns from the end. At lookahead 0 the playhead
      // and `selected` never diverge, which is why that case never showed it.
      //
      // SWITCHING SMOOTH SCROLLING OFF mid-glide also leaves the playhead mid-column, and does NOT
      // ease. That is a mode change rather than a transport one: the line disappears and the
      // overlay appears in the same update, so there is nothing left on screen for a 140ms slide to
      // be a slide OF. It normally falls through to rest() (this branch needs `motion.kind ===
      // 'playback'`, which the mode change does not produce on its own); when the setting goes off
      // and the song pauses in the SAME update it reaches here instead, and easeTo's own gate
      // settles it. Either way it does not ease.
      const lastColumn = Math.max(0, state.columns.length - 1);
      // `selected` sitting on the last column is what "ran out of song" looks like from here. A
      // manual pause ON that column reads the same and is treated the same, deliberately: the
      // difference between the two answers is at most the lookahead, and at the end of a song
      // parking on the end is the better of them either way.
      const ranToTheEnd = state.selected >= lastColumn;
      const target = ranToTheEnd
        ? lastColumn
        : clamp(Math.floor(this.scrollPosition), 0, lastColumn);
      // Ordered as handleWheel and settleStageDrag order it, and for the same reason: this write
      // reaches Svelte, and the update it schedules arrives after this call has installed the
      // motion - where the `easing && selected === to` branch above is what keeps it from being
      // undone. Skipped when the column is already selected, which is the common case (the
      // transport advances `selected` a lookahead early, so a pause in the first part of a column
      // finds them already equal).
      if (target !== state.selected) this.callbacks.selectColumn(target, true);
      this.easeTo(target);
      return;
    }
    this.rest();
  }

  /** Wall clock, on the same timebase the frames read - see onMotionFrame. */
  private now(): number {
    return performance.now();
  }

  /**
   * ENTER A MOTION, and with it start the frames. The only writer that enters a NON-resting motion
   * and the only caller of startMotionFrames, which is what keeps the Ticker's running state from
   * drifting out of step with `motion` (rest, settleAt and destroy are the three that leave one,
   * and each stops the frames in the same statement pair).
   *
   * ANY MOTION THAT IS NOT `playback` DROPS THE QUEUE, which is what gives the union ownership of
   * it. Without this a drag left the pre-drag segments lying there - syncScrollSchedule returns at
   * its first statement for the whole drag, so nothing extends or clears them - and they describe
   * columns the canvas left seconds ago. syncScrollSchedule's "an edit during playback is not a
   * discontinuity" branch tests only whether the queue is NON-EMPTY, so it would re-enter
   * `playback` on that dead queue, and scrollPositionAt keeps its last segment forever: measured at
   * a jump from column 60.6 back to 42 on the next frame.
   */
  private enterMotion(next: Exclude<Motion, { kind: 'resting' }>): void {
    if (next.kind !== 'playback') this.scrollSegments.length = 0;
    this.motion = next;
    this.startMotionFrames();
  }

  /**
   * BACK TO REST ON `state.selected`. One of the three methods that assign `resting` (settleAt and
   * destroy are the others) and the only one that assigns the position from the STATE rather than
   * from where a motion got to - see the Motion type for why `selected` is the authority at rest.
   *
   * It does not paint, and it does not have to: its only caller is syncScrollSchedule, which runs
   * before update()'s repaint decision, and update() applies the position it left behind when that
   * position moved.
   */
  private rest(): void {
    this.motion = { kind: 'resting' };
    this.stopMotionFrames();
    this.scrollSegments.length = 0;
    this.scrollPosition = this.state.selected;
  }

  /**
   * A MOTION FINISHING WHERE IT SAID IT WOULD: applies `position` and rests there, rather than on
   * `state.selected`. The two are the same column - every settle asks selectColumn for exactly this
   * index on its way in - and if that callback were ever ignored, the next update()'s rest() would
   * assign `selected` and update() would apply it, so the disagreement cannot outlive one update.
   */
  private settleAt(position: number): void {
    this.motion = { kind: 'resting' };
    this.stopMotionFrames();
    this.scrollSegments.length = 0;
    this.applyScrollPosition(position);
  }

  /**
   * Ease to a whole column over SCROLL_EASE_MS, starting from wherever the canvas is now.
   *
   * Restarting from the CURRENT position on every call is what makes a burst of wheel events one
   * continuously accelerating glide rather than N eases fighting each other; the caller measures the
   * next target from the ease's own `to` (see handleWheel) so the burst composes rather than stalls.
   */
  private easeTo(target: number): void {
    // SNAP MODE HAS NO EASED MOTION AT ALL. Every caller here is a manual settle or a pause, and
    // with the setting off the canvas moves in whole columns and arrives at once. The gate is here
    // rather than at the four call sites so a fifth caller inherits it instead of having to
    // remember it, and so no caller can reach an ease by calling easeTo directly.
    if (!this.state.smoothScroll) return this.settleAt(target);
    if (target === this.scrollPosition) return this.settleAt(target);
    this.enterMotion({
      kind: 'easing',
      from: this.scrollPosition,
      to: target,
      startMs: this.now(),
      durationMs: SCROLL_EASE_MS,
    });
  }

  private startMotionFrames(): void {
    this.notesApp?.ticker.start();
  }

  private stopMotionFrames(): void {
    this.notesApp?.ticker.stop();
  }

  /**
   * WHERE THE CURRENT MOTION PUTS THE PLAYHEAD at a wall-clock instant, or null for "nowhere new".
   *
   * Read off the WALL CLOCK rather than integrated from the ticker's delta, in every branch. pixi
   * clamps `deltaMS` to `minFPS` (100ms by default), so a hidden tab's worth of missed frames comes
   * back as one 100ms step and an integrating animation would silently lose the rest; and the
   * maxFPS gate makes the executed frames unevenly spaced, which a wall-clock position absorbs for
   * free. Note `ticker.lastTime` is the PREVIOUS tick's timestamp inside a listener - the ticker
   * writes it after emitting - so this uses now() and not that.
   */
  private motionPositionAt(nowMs: number): number | null {
    const motion = this.motion;
    switch (motion.kind) {
      case 'resting':
        //unreachable while the rule at Motion holds: the frames are stopped at rest
        return null;
      case 'playback':
        return this.scrollPositionAt(nowMs);
      case 'easing': {
        const elapsed = nowMs - motion.startMs;
        if (elapsed >= motion.durationMs) return motion.to;
        const t = motion.durationMs > 0 ? elapsed / motion.durationMs : 1;
        //easeOutCubic: leaves at speed and lands softly, which is what a flick should feel like
        const eased = 1 - (1 - t) ** 3;
        return motion.from + (motion.to - motion.from) * eased;
      }
      case 'dragging':
        //the pointer handler already wrote it; the frame only applies it
        return motion.position;
    }
  }

  /**
   * THE FRAME. Registered on the notes Application's Ticker at the default priority, and the only
   * per-frame work this class does - see init() for the loop's wiring and Motion for when it runs.
   *
   * One applyScrollPosition per frame at most, for playback, drag and ease alike, and none at all
   * on a frame where the position did not move: a pointer stream faster than the frame rate
   * coalesces here, and a schedule stalled on a late tick costs this call and nothing else.
   *
   * A SNAP-MODE DRAG moves the position only once per column crossed, so most of its frames do
   * nothing here - and the overlay that mode draws can move while the position does not. That is
   * not this method's problem to solve: `overlayColumn` is written in the constructor and by
   * update(), and the constructor's write precedes any frame - so once the loop is running, an
   * update is the only thing that can make it stale, and update() carries the matching condition.
   */
  private onMotionFrame = (): void => {
    const now = this.now();
    const position = this.motionPositionAt(now);
    if (position === null) return;
    if (this.motion.kind === 'easing' && position === this.motion.to)
      return this.settleAt(position);
    if (position !== this.scrollPosition) this.applyScrollPosition(position);
  };

  /**
   * MOVE THE SCENE TO A SCROLL POSITION, INCREMENTALLY. Brings the notes container's offset, the
   * drawn window's membership, the selection overlay and the timeline viewport into agreement with
   * `scrollPosition` without touching what any surviving column painted. draw() does the same four
   * things from scratch on its own path; this is the version a frame can afford, and it is reached
   * from the frame and, for everything that snaps, from update().
   *
   * It is the same work the pre-playhead drawSelectedMoved did, minus the assumption that the
   * position is an integer. What a column paints is a function of its index and its content, so a
   * view that stays in the window keeps what it has; only membership, the two overlays and the
   * offsets move.
   */
  private applyScrollPosition(position: number): void {
    if (!this.notesApp) return;
    const cacheData = this.cache?.cache;
    this.scrollPosition = position;
    if (!cacheData || this.state.isRecordingAudio) return;
    this.notesColumnsContainer.x = this.containerX();
    const { first, last } = this.visibleColumnRange();
    this.releaseColumnViewsOutside(first, last);
    const counterLimit = this.counterLimit();
    for (let index = first; index <= last; index++) {
      // Columns that were already in the window keep what they painted: their content, their
      // index-derived background and their tails are all unchanged by a window shift.
      if (!this.columnViews.has(index))
        this.paintColumn(index, cacheData, this.columnSize, counterLimit);
    }
    this.syncOverlayColumn(cacheData);
    this.syncTimelineViewport();
    this.notesApp.render();
  }

  /**
   * MOVE THE SELECTED OVERLAY to the column overlayColumn now names, if it is not already there.
   *
   * The two columns are the one that lost the overlay and the one that gained it. Neither changes
   * its BACKGROUND - selection is a separate overlay sprite - and after a large jump either may be
   * outside the window, in which case paintSelectionOverlay finds no view and does nothing; a column
   * entering the window later is painted in full by paintColumn, which writes the overlay from the
   * same field.
   *
   * With smooth scrolling on this repaints ONE column ONCE - the one that was carrying the overlay
   * when the setting was turned on - and nothing after that: overlayColumn stays NO_OVERLAY_COLUMN
   * for as long as the setting is on, so the comparison holds from the update after the toggle
   * onwards. (`paintSelectionOverlay(NO_OVERLAY_COLUMN)` finds no view and is the no-op half.)
   */
  private syncOverlayColumn(cacheData: ComposerCacheData): void {
    const previous = this.paintedOverlayColumn;
    if (previous === this.overlayColumn) return;
    this.paintedOverlayColumn = this.overlayColumn;
    if (previous !== null) this.paintSelectionOverlay(previous, cacheData);
    this.paintSelectionOverlay(this.overlayColumn, cacheData);
  }

  /**
   * THE TIMELINE VIEWPORT, and the gate that keeps the outline off the per-frame path.
   *
   * The whole song spans the canvas width here, so on a song of a few hundred columns the rectangle
   * moves a fraction of a pixel per frame while the notes container moves several whole ones. What
   * is gated is the WRITE: assigning `viewportGraphics.x` puts the Graphics into the stage render
   * group's childrenToUpdate, and the next render hands it to GraphicsPipe.updateRenderable ->
   * Batcher.updateElement, which sets the stage batcher dirty and makes BatcherPipe re-upload that
   * batcher's whole attribute buffer - the playhead, the strip's background, its selection band, its
   * breakpoint markers and this outline together. Skipping the write on a frame that would not have
   * moved the outline by a whole pixel leaves the batcher clean and the buffer alone.
   *
   * Before the two canvases were merged this gated a second Application's render() instead. What it
   * must NOT gate now is `notesApp.render()`, which is shared with the columns: those move several
   * whole pixels on exactly the frames this skips.
   *
   * HOW FAR THE OUTLINE CAN TRAIL THE CANVAS: just under a whole pixel, not half of one. The gate
   * compares ROUNDED positions, so two x values that round to the same integer are held to be the
   * same - and those can be almost 1.0 apart (write at x = 10.4999, then skip every frame down to
   * x = 9.5001). Measured over a 600-move drag on a 400-column song at the shipped defaults, the
   * worst gap between the outline's x and the position the canvas was actually at came to 0.89px;
   * test/composerRenderer.test.ts states the bound as < 1px and would fail if this became a floor or
   * a wider quantiser. On the song this matters on - a few hundred columns across the strip - a
   * pixel is a quarter of a column, which is finer than the outline's own edge.
   *
   * WHAT ALSO MOVED with the rewrite: the previous code wrote `viewportGraphics.x` unconditionally
   * and gated the second Application's render(), so the SCENE always held the exact value and only
   * the frame lagged. The error now lives in the scene graph. Nothing reads it - handleTimelineDown's
   * grab test goes through timelineViewport() rather than through the Graphics - but a future reader
   * that reached for `viewportGraphics.x` would be reading a position up to a pixel old.
   */
  private syncTimelineViewport(): void {
    const x = this.timelineViewport().x;
    const rounded = Math.round(x);
    if (rounded === this.writtenViewportX) return;
    this.writtenViewportX = rounded;
    this.viewportGraphics.x = x;
  }

  /**
   * The outline on the mini-timeline, as the span of the song the canvas is showing. Both numbers
   * are derived from the pixel geometry for the reason ColumnWindowGeometry gives - the canvas does
   * not hold exactly `columnsPerCanvas` columns - and both the drawn rectangle and the
   * drag-the-viewport hit test in handleTimelineDown read them from here, so the thing the user
   * grabs is the thing they see.
   */
  private timelineViewport(): { x: number; width: number } {
    const relativeColumnWidth = this.timelineColumnWidth();
    //...while THESE two stay canvas quantities: they answer "which columns is the canvas showing",
    //not "where on the strip", so scaling them by the inset as well would shrink the outline's span
    //twice and make the rectangle report a different set of columns than the canvas holds
    const columnsOnScreen = this.width / this.columnSize.width;
    const firstVisible = this.scrollPosition - this.playheadX() / this.columnSize.width;
    return {
      x: relativeColumnWidth * firstVisible,
      width: Math.floor(relativeColumnWidth * columnsOnScreen),
    };
  }

  /**
   * A POINTER-DERIVED POSITION, on the grid the mode asks for: unchanged while smooth scrolling is
   * on, the NEAREST whole column while it is off.
   *
   * ROUND rather than floor, and that is a property rather than a taste: the snap-mode drag sits at
   * any instant exactly where the glide-mode drag would SETTLE to from the same pointer position
   * (settleStageDrag and handleTimelineUp both round), so the release is a no-op instead of a jump
   * and the two modes are related by one equation the tests can state. The cost is that the canvas
   * can lead the finger by up to half a column, which is what snapping to a grid does everywhere.
   *
   * Applied to the position WRITTEN INTO THE MOTION and never to the anchor. An anchor rounded once
   * per move accumulates its own rounding and the canvas walks away from the finger.
   */
  private snapManualPosition(position: number): number {
    return this.state.smoothScroll ? position : Math.round(position);
  }

  /** The column under a canvas x, fractional - the inverse of the offset containerX() applies. */
  private columnAtCanvasX(x: number): number {
    return this.scrollPosition + (x - this.playheadX()) / this.columnSize.width;
  }

  /**
   * THE WHEEL: one column per event - EASED while smooth scrolling is on, arriving at once while it
   * is off. Nothing here tests the setting; the gate is inside easeTo, which every non-transport
   * path below ends in.
   *
   * WHAT THE STEP IS MEASURED FROM depends on who owns the position, and it has to, because the
   * value this produces is compared by Svelte against `selected`:
   *  - WHILE THE TRANSPORT OWNS IT (playing with smooth scrolling on) the step is measured from
   *    `selected` itself. The playhead is a LOOKAHEAD BEHIND `selected` by construction, so a step
   *    measured from the playhead asks for a column the transport is already on - an unchanged
   *    write, which notifies nothing and moves neither the canvas nor the music. Measured at the
   *    shipped defaults, that swallowed a forward wheel for the first 113 of every 273ms column
   *    while sending a backward one two columns back. `selected` is fresh here: the ticks that
   *    move it are a column apart, so the microtask-staleness a burst suffers cannot arise.
   *  - OTHERWISE from the running ease's own TARGET, which is the whole of how a burst composes:
   *    wheel events arrive several to a frame, and a step measured from the current position would
   *    give every event in a burst the same destination. `this.state.selected` cannot serve there -
   *    it is a snapshot Svelte refreshes a microtask later, so inside a burst it is the value from
   *    before the previous event.
   *
   * WHILE THE TRANSPORT OWNS THE POSITION it also does not ease: moving `selected` is enough,
   * because the update that produces takes syncScrollSchedule's discontinuity branch, which
   * re-anchors the playhead there and re-schedules. Easing as well would put the canvas behind
   * music that has already jumped.
   *
   * A DRAG OUTRANKS IT, which is syncScrollSchedule's rule applied to the one input that can arrive
   * mid-gesture: a mouse with a wheel can be scrolled with its button held, and easing from under a
   * held pointer replaces the `dragging` motion, so the release would run handleStageUp's CLICK
   * path and sound a note from a gesture the user performed as a drag.
   */
  private handleWheel = (e: WheelEvent) => {
    if (this.motion.kind === 'dragging') return;
    const transportOwned = this.state.isPlaying && this.state.smoothScroll;
    const from = transportOwned
      ? this.state.selected
      : this.motion.kind === 'easing'
        ? this.motion.to
        : this.scrollPosition;
    const target = clamp(Math.round(from) + Math.sign(e.deltaY), 0, this.state.columns.length - 1);
    this.callbacks.selectColumn(target, true);
    if (transportOwned) return;
    this.easeTo(target);
  };

  /**
   * A pointer going down on the notes stage. It records the press and NOTHING else - the drag
   * motion is entered by the first move past DRAG_SLOP_PX (see handleStageSlide), so a click during
   * playback leaves the glide it landed on running.
   *
   * IGNORED OUTRIGHT WHILE ANOTHER POINTER ALREADY OWNS THE SURFACE - see stagePointer's `id`. The
   * hitarea cannot make this decision: pixi hands `contains` a point and no pointerId, so the guard
   * has to live where the event does.
   */
  private handleStageDown = (e: FederatedPointerEvent) => {
    if (this.stagePointer) return;
    this.stagePointer = { id: e.pointerId, x: e.globalX, anchorPosition: this.scrollPosition };
  };

  /**
   * THE STAGE DRAG, on the grid `smoothScroll` asks for: with it ON the canvas follows the pointer
   * continuously, in pixels rather than whole columns; with it OFF the position is quantised to the
   * nearest column and the canvas steps once per column crossed. snapManualPosition is the whole of
   * that difference, and it is applied to the position but never to the anchor.
   *
   * It paints nothing. The position is written into the motion and the frame applies it, which is
   * what keeps a pointer stream faster than the frame rate from producing a render per event.
   *
   * `selectColumn` is called with the FLOOR of the position, and only when that floor changes -
   * at most once per column crossed. Floor because the playhead marks the START of the column it is
   * in, so at position 40.9 the column under the line is 40 and `selected` must agree with the line
   * at every instant. (The release rounds instead - see settleStageDrag.) While snapping, the
   * position is already whole and the floor is the identity.
   */
  private handleStageSlide = (e: FederatedPointerEvent) => {
    const pointer = this.stagePointer;
    //a move from a pointer that is not the one holding the drag would be measured against an anchor
    //it never pressed at - see stagePointer's `id`
    if (!pointer || e.pointerId !== pointer.id) return;
    const motion = this.motion;
    const dragging = motion.kind === 'dragging' && motion.surface === 'stage';
    if (!dragging) {
      if (Math.abs(e.globalX - pointer.x) <= DRAG_SLOP_PX) return;
      // THE ANCHOR IS TAKEN HERE, at the instant the drag actually starts, and not at the press.
      // The press is not the grab - the slop test above is - and whatever was already moving the
      // canvas keeps writing the position in between: a glide, or a wheel's ease. Anchoring on the
      // press gives all of that back on the first drag frame, measured at 0.41 columns backward for
      // a 0.4-column hesitation on a playing song, which is the most ordinary way to use the
      // gesture. `this.scrollPosition` is what is on screen, which is the thing a finger grabs.
      pointer.anchorPosition = this.scrollPosition;
    }
    const lastColumn = this.state.columns.length - 1;
    const raw = pointer.anchorPosition + (pointer.x - e.globalX) / this.columnSize.width;
    const clamped = clamp(raw, 0, lastColumn);
    // RE-ANCHORED at either end: without this, dragging past the end and back leaves a dead zone
    // the size of the overshoot before the canvas moves again. On the CONTINUOUS value, before the
    // quantiser below - see snapManualPosition for why the anchor is never rounded.
    if (clamped !== raw) {
      pointer.x = e.globalX;
      pointer.anchorPosition = clamped;
    }
    const position = this.snapManualPosition(clamped);
    if (dragging) motion.position = position;
    else this.enterMotion({ kind: 'dragging', surface: 'stage', position });
    // With smooth scrolling off the position is already integral, so this floor is the identity.
    // What it does NOT do on its own is keep the mark and the canvas together: this call reaches
    // Svelte and comes back as an update, while the position written above reaches the screen on
    // the next frame, and the two orders are not the same picture. onMotionFrame and update() are
    // where that is resolved - see both.
    const column = Math.floor(position);
    // NOT FREE, and left as it is deliberately: Composer.svelte's selectColumn ALSO extends the
    // tools selection while that panel is open, which replaces `selectedColumns` and so lands on
    // needsUnconditionalRepaint - a full window repaint plus a whole timeline rebuild, once per
    // column crossed. That is what dragging with the tools panel open has always done; making the
    // drag able to say "move the cursor, do not extend the selection" would need a third argument
    // on ComposerRendererCallbacks and would change what the gesture means.
    if (column !== this.state.selected) this.callbacks.selectColumn(column, true);
  };

  /**
   * A pointer coming up over the notes stage: a drag settles, a press that never became one is a
   * CLICK and picks the column under it.
   *
   * A click is a pick rather than a scroll, so it snaps - and `selectColumn` here is called WITHOUT
   * `ignoreAudio`, so the clicked column sounds at once; easing the canvas to a column the user has
   * already heard would put the picture behind the sound.
   */
  private handleStageUp = (e: FederatedPointerEvent) => {
    //a release from a pointer that never owned the press is not this gesture ending - see
    //stagePointer's `id`. It must not settle the drag under the finger still holding it, and it must
    //not take the click path below, which SOUNDS the column it lands on.
    if (this.stagePointer && e.pointerId !== this.stagePointer.id) return;
    this.stagePointer = null;
    const motion = this.motion;
    if (motion.kind === 'dragging' && motion.surface === 'stage') return this.settleStageDrag();
    // The column the pointer is actually OVER, inverted through the live scroll position rather
    // than derived from `selected` and a fixed slot. The two agree whenever the scroll is at
    // rest; during a glide `selected` is a column ahead of what is on screen, and this is what
    // makes a click land where it was aimed.
    const clicked = Math.floor(this.columnAtCanvasX(e.globalX));
    if (clicked === this.state.selected) return;
    this.callbacks.selectColumn(clamp(clicked, 0, this.state.columns.length - 1));
  };

  /**
   * Where a stage drag comes to rest: the NEAREST column - eased to while smooth scrolling is on,
   * arrived at instantly while it is off (the gate lives in easeTo).
   *
   * Round rather than floor, unlike the `selectColumn` calls the drag itself makes. A floor-settle
   * always gives movement back, up to a full column on every single release, which reads as sticky;
   * round splits the give-back and caps it at half a column, which is what snapping to a grid does
   * everywhere else. While snapping, the drag has been writing that same rounded value all along,
   * so this release moves nothing at all.
   */
  private settleStageDrag(): void {
    const motion = this.motion;
    if (motion.kind !== 'dragging' || motion.surface !== 'stage') return;
    const target = clamp(Math.round(motion.position), 0, this.state.columns.length - 1);
    this.callbacks.selectColumn(target, true);
    this.easeTo(target);
  }

  /**
   * A pointer going down on the mini-timeline. Unlike the stage, this enters the drag AT ONCE and
   * jumps to the pointer, because that is what the affordance does: pressing anywhere on the
   * timeline navigates there.
   *
   * IGNORED OUTRIGHT WHILE ANOTHER POINTER IS ALREADY SCRUBBING - see timelinePointer. Because a
   * running scrub makes testTimelineHitarea answer the WHOLE canvas (that is how a scrub keeps
   * receiving moves once the pointer wanders off the strip), a second pointerdown anywhere on the
   * canvas - the middle of the note grid included - was routed here and teleported the live scrub to
   * it: measured at a 93-column jump on a 100-column song from a press on the notes.
   */
  private handleTimelineDown = (e: FederatedPointerEvent) => {
    if (this.timelinePointer !== null) return;
    this.timelinePointer = e.pointerId;
    //the rectangle drawn on the timeline, so grabbing it and grabbing what is drawn agree
    const viewport = this.timelineViewport();
    //IN THE STRIP'S SPACE, which the rectangle's own x is stated in - `globalX` is canvas space and
    //the strip's inset is not undone for it anywhere else (see stripX)
    const pointerX = this.stripX(e.globalX);
    this.onSlider = pointerX > viewport.x && pointerX < viewport.x + viewport.width;
    // WHERE ON THE RECTANGLE the pointer landed, as an offset from the position that rectangle
    // stands for. That position is `relativeColumnWidth * scrollPosition` - the playhead's own
    // column - because the line sits at the canvas' horizontal middle, so `firstVisible +
    // columnsOnScreen / 2` collapses to the scroll position identically (see timelineViewport).
    // Taken from that identity rather than from the DRAWN centre, whose width is floored to whole
    // pixels: half a pixel of the strip is a sixteenth of a column on a 100-column song, which is
    // enough to make a grab that never moves ask for the column before the one it grabbed.
    // BOTH TERMS IN STRIP SPACE. This is the one expression in the class that mixes a strip
    // quantity with a pointer position, and they were the same space only while the strip ran the
    // canvas' full width - converting one and not the other is an 80px error here, about five
    // columns of a 100-column song, that no scene assertion can see.
    this.sliderOffset = this.timelineColumnWidth() * this.scrollPosition - pointerX;
    this.enterMotion({ kind: 'dragging', surface: 'timeline', position: this.scrollPosition });
    this.handleTimelineSlide(e);
  };

  /**
   * The end of a scrub. Called both by pixi's own pointerup and by the window listener, which is why
   * the event is optional - resetPointerDown has no pixi event to pass on for a pointercancel or a
   * blur, and those must settle the scrub regardless of which pointer they name.
   *
   * A release from a pointer that is not the one scrubbing is NOT this gesture ending: a second
   * finger going down and up over the canvas would otherwise settle the drag the first finger is
   * still holding, leaving that finger's remaining moves writing into a motion nobody is in.
   */
  private handleTimelineUp = (e?: FederatedPointerEvent) => {
    if (e && this.timelinePointer !== null && e.pointerId !== this.timelinePointer) return;
    this.timelinePointer = null;
    const motion = this.motion;
    if (motion.kind !== 'dragging' || motion.surface !== 'timeline') return;
    const target = clamp(Math.round(motion.position), 0, this.state.columns.length - 1);
    this.callbacks.selectColumn(target, true);
    this.easeTo(target);
  };

  /**
   * THE TIMELINE DRAG: absolute rather than an offset from an anchor, since the whole song spans
   * the strip. The position is `(x / stripWidth) * columns.length`, which is the expression the throttled
   * version already computed (`totalWidth / columnSize.width` cancels to `columns.length`) with its
   * floor replaced by snapManualPosition - so it is continuous while smooth scrolling is on and
   * quantised to whole columns while it is off. The timeline snaps with the notes stage rather than
   * on its own rule: the setting would otherwise mean "snap here, glide there".
   *
   * The four-event THROTTLE is gone with it. Its purpose was to rate-limit `selectColumn`, because
   * each call was a Svelte round-trip ending in a snap-repaint; a move now writes a number and
   * paints nothing, and `selectColumn` is limited by the floor changing instead - at most once per
   * column crossed, which is a tighter limit at speed and a more responsive one at a crawl.
   *
   * Grabbing the rectangle resolves to the position it stands for, so a press on what is already
   * on screen moves nothing at all: sliderOffset is the distance from that position to the pointer
   * and this adds it straight back. See handleTimelineDown for where the offset comes from.
   */
  private handleTimelineSlide = (e: FederatedPointerEvent) => {
    //...and only from the pointer that started the scrub - see timelinePointer
    if (this.timelinePointer !== null && e.pointerId !== this.timelinePointer) return;
    const motion = this.motion;
    if (motion.kind !== 'dragging' || motion.surface !== 'timeline') return;
    const lastColumn = this.state.columns.length - 1;
    const pointerX = this.stripX(e.globalX);
    const x = this.onSlider ? pointerX + this.sliderOffset : pointerX;
    const raw = clamp((x / this.stripWidth()) * this.state.columns.length, 0, lastColumn);
    const position = this.snapManualPosition(raw);
    motion.position = position;
    const column = Math.floor(position);
    if (column !== this.state.selected) this.callbacks.selectColumn(column, true);
  };

  // Called by ComposerCanvas.svelte's prev/next-breakpoint buttons and its own
  // composer_canvas shortcut listener.
  handleBreakpoints = (direction: 1 | -1) => {
    const { selected, columns, breakpoints } = this.state;
    const breakpoint =
      direction === 1 //1 = right, -1 = left
        ? breakpoints.filter((v) => v > selected).sort((a, b) => a - b)
        : breakpoints.filter((v) => v < selected).sort((a, b) => b - a);
    if (breakpoint.length === 0) return;
    if (columns.length >= breakpoint[0] && breakpoint[0] >= 0) {
      this.callbacks.selectColumn(breakpoint[0]);
    }
  };

  /**
   * WHAT COUNTS AS A GRAB ON THE NOTES STAGE: the whole canvas, and not the strip the columns
   * happen to occupy.
   *
   * The container is NARROWER than the canvas wherever the song runs out - the first column starts
   * AT the playhead, so at scroll position 0 the left half of the canvas is empty; at the last
   * column the right half is; and a song shorter than the screen, which is every song that has just
   * been started, is surrounded by empty canvas at every scroll position it has. Those margins are
   * part of the same surface as far as a finger is concerned, so they route to the same three
   * handlers rather than to a gesture of their own. Nothing downstream needs to know: the drag is a
   * DELTA from wherever the press landed (see handleStageSlide) and never reads the column under it,
   * and the click path was already clamped, so a release out there picks the nearest end column.
   *
   * The CANVAS bound is still enforced, and is why this is not simply `true`. pixi registers its
   * pointerup on globalThis rather than on the canvas element, so a release ANYWHERE on the page is
   * hit-tested against this container; without the bound, letting go of a button elsewhere in the
   * composer would reach handleStageUp as a click and both select and SOUND an end column.
   *
   * `x` and `y` arrive in the container's own space, so the canvas' left edge sits at `-container.x`.
   * That offset is read back off the container rather than recomputed from `scrollPosition`: it is
   * the exact value pixi inverted to produce `x`, and applyScrollPosition leaves the two disagreeing
   * for as long as an audio recording is running.
   *
   * THE `y` BOUND IS THE NOTES REGION and not the canvas, which is load-bearing now that the
   * mini-timeline shares the canvas: `this.height` stops at the padding row above the strip, so a
   * timeline scrub's release does not also reach handleStageUp - which calls selectColumn WITHOUT
   * `ignoreAudio` and would sound a column on every scrub.
   *
   * The reverse case needs nothing here. The timeline strip is a LATER child of the same stage, so
   * pixi hit-tests it first (it walks children in reverse and returns on the first hit), and its own
   * hitarea answers every point while its drag runs - so a timeline drag never reaches this
   * container at all. That makes the stage child ORDER load-bearing rather than cosmetic;
   * test/composerRenderer.test.ts's mount() states it.
   */
  private testStageHitarea = {
    contains: (x: number, y: number) => {
      //while the stage is being dragged the pointer must keep reaching this container even outside
      //the canvas, which is what puts it on the composed path pixi dispatches pointerup along
      if (this.stagePointer) return true;
      const canvasX = x + this.notesColumnsContainer.x;
      if (canvasX < 0 || canvasX > this.width || y < 0 || y > this.height) return false;
      return true;
    },
  };

  /**
   * WHAT COUNTS AS A GRAB ON THE MINI-TIMELINE. `x` and `y` arrive in the content container's own
   * space, which pixi produces by inverting the strip's world transform - so the strip's offset onto
   * the canvas is already undone here, in x as well as in y, and the bounds are the strip's own
   * `0..stripWidth()` by `0..timelineHeight`.
   *
   * THE x BOUND IS WHAT KEEPS THE BUTTONS FROM ALSO SCRUBBING. The three DOM buttons stand on
   * exactly `[0, TIMELINE_INSET_LEFT]` and `[width - TIMELINE_INSET_RIGHT, width]` in canvas space,
   * which is precisely what this rejects - so a press anywhere in those two bands reaches no handler
   * at all, whether it lands on a button (which swallows it in the DOM) or on 3.2px of bare canvas
   * beside one (which falls through and is declined here, and by the notes stage on `y >
   * this.height`). Bands rather than margin boxes: the right-hand button's `margin-left: auto` makes
   * its margin box the whole `[TIMELINE_INSET_LEFT, width]` remainder, and 3.2px of the band it
   * stands on is the clearance in front of it rather than a margin of its own.
   */
  private testTimelineHitarea = {
    contains: (x: number, y: number) => {
      // DEFERRED WHILE A PRESS OWNS THE NOTES SURFACE, which is new with the merged canvas and is
      // load-bearing rather than defensive. This container is a LATER child of the same stage, so
      // pixi hit-tests it BEFORE the notes container and returns on the first hit; without this, a
      // stage drag whose pointer wanders down into the strip is claimed here and the drag freezes
      // until the pointer comes back up. `stagePointer` is the PRESS rather than the drag, so the
      // deferral covers the whole gesture including the pre-slop part.
      //
      // The two ownership tests below and above cannot both hold: handleTimelineDown is reachable
      // only if this hitarea answered, which needs `stagePointer === null`, and handleStageDown only
      // if this one declined, which a running timeline drag never does.
      //
      // WHAT NEITHER OF THEM DECIDES is which POINTER is being asked about - `contains` is handed a
      // point and nothing else. So both of these route a SECOND concurrent press exactly as if it
      // were the first one's continuation, and the guards that reject it live in the handlers (see
      // stagePointer's `id` and timelinePointer) rather than here.
      if (this.stagePointer) return false;
      //same reason as the stage's, for the timeline's own drag
      const motion = this.motion;
      if (motion.kind === 'dragging' && motion.surface === 'timeline') return true;
      if (x < 0 || x > this.stripWidth() || y < 0 || y > this.timelineHeight) return false;
      return true;
    },
  };

  /**
   * The window-level release: a pointerup anywhere, a pointercancel, and a blur - the last two
   * produce no pixi event at all, and the cancel is the one that would otherwise strand the canvas
   * in `dragging` for good (see init for what pixi does and does not listen to).
   *
   * IDEMPOTENT against the pixi handlers, which is what makes it safe to have both. pixi registers
   * its own pointerup on `globalThis` in the CAPTURE phase and this listener is on `window` in the
   * bubble phase, so handleStageUp/handleTimelineUp run first and have already left `dragging` by
   * the time this does anything; settleStageDrag and the timeline's own settle both return when the
   * motion is not theirs.
   */
  private resetPointerDown = (e: Event) => {
    // A SECOND POINTER'S RELEASE IS NOT THIS GESTURE ENDING - the same rule the pixi handlers now
    // apply, restated here because this listener is on `window` and therefore hears every pointer on
    // the page. Without it the id guards above buy nothing: the second finger's pointerup reaches
    // this instead and settles the drag the first finger is still holding.
    //
    // Only events that NAME a pointer are filtered. `blur` names none and must cancel whatever is
    // running, and a `pointerup`/`pointercancel` naming a pointer this class never recorded (a press
    // that started outside the canvas) is let through unchanged - there is nothing of ours for it to
    // settle, and the branches below already return when the motion is not a drag.
    const id = 'pointerId' in e ? (e as PointerEvent).pointerId : null;
    const owner = this.stagePointer?.id ?? this.timelinePointer;
    if (id !== null && owner !== null && id !== owner) return;
    this.stagePointer = null;
    this.timelinePointer = null;
    const motion = this.motion;
    if (motion.kind !== 'dragging') return;
    if (motion.surface === 'stage') this.settleStageDrag();
    else this.handleTimelineUp();
  };

  private handleThemeChange = () => {
    this.stageBackgroundColor = ThemeProvider.get('primary').rgb().rgbNumber();
    this.theme = {
      timeline: {
        hex: ThemeProvider.layer('primary', 0.1).hex(),
        hexNumber: ThemeProvider.layer('primary', 0.1).rgb().rgbNumber(),
        selected: ThemeProvider.get('composer_accent').negate().rgb().rgbNumber(),
        border: ThemeProvider.get('composer_accent').rgb().rgbNumber(),
      },
      sideButtons: {
        hex: ThemeProvider.get('primary').darken(0.08).hex(),
        rgb: colorToRGB(ThemeProvider.get('primary').darken(0.08)).join(','),
      },
      main: {
        background: ThemeProvider.get('primary').rgb().rgbNumber(),
        backgroundHex: ThemeProvider.get('primary').hexa(),
        backgroundOpacity: Math.max(ThemeProvider.get('primary').alpha(), 0.8),
      },
      tailAccent: ThemeProvider.get('accent').rgbNumber(),
      playhead: ThemeProvider.get('accent').rgbNumber(),
    };
    this.recalculateCacheAndSizes();
    if (this.notesApp) this.notesApp.renderer.background.color = this.theme.main.background;
    this.applyNotesCanvasOpacity();
  };

  private notifyGeometry() {
    this.callbacks.onGeometryChange({
      width: this.width,
      height: this.height,
      timelinePadding: TIMELINE_BAND_PADDING,
      timelineHeight: this.timelineHeight,
      hasCache: this.cache !== null,
    });
  }

  // The entry point ComposerCanvas.svelte's $effect calls on every reactive-state change - the
  // props channel; theme reaches this class separately, through subscribeTheme.
  // Does not re-read columnsPerCanvas: a changed value arrives via a fresh ComposerRenderer
  // instance instead, because the parent wraps this component in
  // {#key settings.columnsPerCanvas.value}.
  //
  // FIVE OUTCOMES, cheapest last, and listed in the order the code tests them:
  //  - full repaint, when needsUnconditionalRepaint reports a change - or when there is no
  //    trustworthy baseline to compare against at all (see paintedState);
  //  - the column GRAPH moved and nothing else did: the same full-repaint path, narrowed to the
  //    columns whose own `version` counter differs from what their view last painted (phase 4).
  //    Both scenes are still walked - the timeline content is rebuilt whole, and every drawn
  //    column is still visited - so what this saves is the paint of the columns an edit did not
  //    reach, which for a one-note edit is the whole window but one;
  //  - the SCROLL POSITION moved - not `selected`, and the inline comment at that branch says why
  //    the two are different questions: applyScrollPosition, which shifts the scene already on
  //    screen. That is the playback tick with smooth scrolling off, and it is the reason this diff
  //    exists - during playback the structure does not change, so the diff has nothing to report
  //    and the tick costs O(window) rather than O(song). It is ALSO the jump that re-anchors a
  //    running glide, which is why it is tested before the motion branch rather than after: that
  //    update moves the position WHILE a motion runs, and making it wait for the next frame is a
  //    jump the user sees a capped frame late;
  //  - a MOTION is running and this update did not move the position: the frame owns the offset,
  //    the window and the overlay from here, and this records the baseline and returns. That is
  //    the steady playback tick with smooth scrolling on, and every update that lands mid-gesture
  //    whose overlay did not move either;
  //  - neither: return without rendering. A state differing from the last painted one only in
  //    fields needsUnconditionalRepaint does not compare lands here; that method's closing
  //    paragraph says what each of those is doing on the state object.
  update(state: ComposerRendererState): void {
    const previous = this.paintedState;
    // FIRST, unconditionally, and before any early return: the pointer/wheel/hitarea handlers all
    // read this.state, and they must never see the state of a previous update.
    this.state = state;
    // BEFORE any repaint decision: every path below reads `scrollPosition` for the container offset
    // and `overlayColumn` for the overlay, and these are what move them. R1's two mode-gated values
    // are written unconditionally rather than behind a change test, for the reason ColumnView.paint
    // writes properties the object already holds.
    this.overlayColumn = state.smoothScroll ? NO_OVERLAY_COLUMN : state.selected;
    this.playheadGraphics.visible = this.playheadIsVisible(state);
    const previousScrollPosition = this.scrollPosition;
    //the LAST UPDATE, not the last paint - see the field for why the schedule needs the other one
    const previousUpdate = this.previousState;
    this.previousState = state;
    this.syncScrollSchedule(previousUpdate, state);
    if (previous === null) return this.draw();
    const cacheData = this.cache?.cache;
    if (!cacheData) return this.draw();
    if (this.needsUnconditionalRepaint(previous, state)) return this.draw();
    if (previous.structureVersion !== state.structureVersion) {
      // The overlay may have moved in the same batch - note entry is not gated on isPlaying - and a
      // skipped column that gained or lost it would keep the wrong sprite state, so the narrowed
      // repaint ends in the same fix-up applyScrollPosition uses.
      return this.draw(true);
    }
    // DID THIS UPDATE MOVE THE POSITION ITSELF? That is the question, and not whether a motion is
    // running - the two are independent, and syncScrollSchedule's discontinuity branch is where
    // they come apart: it re-anchors a glide on a new column AND leaves the frames running, and a
    // jump that waited for the next frame is a jump the user sees a capped frame late.
    //
    // The SCROLL POSITION rather than `selected`, which are the same test while both are snapped and
    // different in the one case that matters: playback STOPPING mid-glide moves the position from
    // wherever the playhead had reached to `selected`, without `selected` itself moving.
    //
    // THE OVERLAY IS THE SECOND HALF of the test, and not a redundant one. Usually the two move
    // together - in snap mode `overlayColumn` IS `state.selected` and rest() has just put the
    // position there as well, and in glide mode it is NO_OVERLAY_COLUMN and never moves - but a
    // SETTLE arrives at its target BEFORE the selectColumn it asked for comes back through Svelte.
    // While snapping that settle is instantaneous, so by the time this update lands the position is
    // already right and only the highlight is stale; with nothing here to catch it, control falls
    // to the motion branch (which is resting) and returns, leaving the highlight on the column the
    // gesture started from until something else moves the canvas. This is also what keeps the
    // overlay following a SNAP-MODE DRAG, whose frames move the position only once per column
    // crossed: `overlayColumn` is written here and in the constructor, and the constructor's write
    // happens before any frame or any later update - so an update is the only thing that can make
    // it stale once the renderer is live, and this is the only place that has to notice.
    // NOT WHILE A POINTER IS DOWN. During a drag `syncScrollSchedule` returns at its first
    // statement, so `scrollPosition` here is still the column the canvas is ON, while the motion
    // already holds the one the finger has reached. Painting from this method would put the mark on
    // the new column against a canvas still showing the old one - once per column crossed, which is
    // what read as the highlight flickering behind the drag.
    //
    // Waiting for the frame drops nothing FOR A DRAG's OWN MOVES: the drag calls selectColumn only
    // when `floor(position)` changes, so the mark and the position always move together and the
    // frame's position test covers both. It is not a general claim - a selectColumn from somewhere
    // else while a pointer is down (the next_column shortcut) moves the mark with the canvas still,
    // and that repaints on the next drag move rather than at once.
    if (
      this.motion.kind !== 'dragging' &&
      (previousScrollPosition !== this.scrollPosition ||
        this.paintedOverlayColumn !== this.overlayColumn)
    ) {
      this.applyScrollPosition(this.scrollPosition);
      this.paintedState = state;
      return;
    }
    if (this.motion.kind !== 'resting') {
      // The frame is what paints from here, and the ticker is already running. Recording the
      // baseline is still this call's job: the next update diffs against the last state that
      // reached the screen, and the frame that follows this one puts this one's columns there.
      this.paintedState = state;
    }
  }

  /**
   * Everything the painted output depends on EXCEPT `selected` and the column graph - the two
   * inputs the paths below know how to apply to less than the whole window.
   *
   * The fields listed here stay on the full repaint, as a decision rather than a gap - but for two
   * different reasons, so the bullets say which applies. The first six change the pixels of a
   * column whose own `version` counter did not move, so the per-column skip cannot see them; the
   * last two are cheap gates that a narrowed path would reach a different way:
   *  - `instruments` decides note textures (computeRowLayerStatuses), the dimming of stranded rows
   *    (computeStrandedRows) and which tails draw at all, for every column;
   *  - `currentLayer` is bit 0 of every layer status plus the tail accent/dim, for every column;
   *  - `beatMarks` is the bar-group alternation, i.e. the background slot of every column;
   *  - `smoothScroll` decides whether the selected overlay exists at all and whether the playhead
   *    line is drawn (see the state field). Without it here, toggling the setting while the song is
   *    stopped on an exact column moves neither the scroll position nor any `version` counter, so
   *    update()'s tail returns and the canvas keeps showing the mode it is no longer in;
   *  - `breakpoints` and `selectedColumns` are arbitrary index SETS. Narrowing either would mean
   *    diffing two arrays into a symmetric difference to repaint one marker or one overlay sprite,
   *    which costs about what it saves;
   *  - `columns` (array identity) rules out a NoteColumn object being re-installed at an index a
   *    view already holds a paint key for - restoreColumns (undo) and deleteColumns both assign a
   *    new array, and a song swap hands over a different song's. Measured: moving this one onto the
   *    narrowed path instead leaves every test green, because the key's object half catches those
   *    cases anyway. It stays here as the cheap gate, so the argument for undo does not have to run
   *    through counters that restart at 0;
   *  - `isRecordingAudio` hides the stage, which paints nothing and records no baseline.
   *
   * Each of the first six is pinned by test/composerRenderer.test.ts: moving any one of them onto
   * the narrowed path fails between three and five of its tests (measured one at a time:
   * `instruments` 5, `selectedColumns` 4, the other four 3 each).
   *
   * The comparisons are identity comparisons on purpose, and they are only sound because each of
   * `instruments`, `breakpoints` and `selectedColumns` is REPLACED rather than edited in place by
   * whoever owns it: the first two are `$state.raw` on the song, the third is `$state.raw` in
   * Composer.svelte.
   *
   * `columns` is the one that does NOT work that way, and it is why `structureVersion` is compared
   * beside it - in update() rather than here, since a moved structure version is the one change
   * this class can narrow. Some of ComposedSong's mutators install a new array and some edit the
   * one that is there, so the identity moves on an edit sometimes and not others - a moved identity
   * forces a full repaint, which is the safe direction, but an unmoved one proves nothing. The
   * version moves on every graph edit and cannot see a song SWAP (a freshly loaded song sits at 0,
   * which the previous song may too). Neither alone is sufficient.
   *
   * Not compared, and why. `isPlaying` IS read now - syncScrollSchedule and handleWheel both take
   * it - but what it changes is the SCHEDULE rather than any column's appearance, so it stays out
   * of here; see its field. `bpm` and `lookaheadMs` are the same shape of thing. `inPreview`
   * and `columnsPerCanvas` both decide geometry, and `inPreview` decides a great deal of it (it
   * scales both canvas dimensions in computeCanvasSize, so it moves every column's x, every note's
   * y and the size of both canvases) - but neither reaches update() as a CHANGE: Composer.svelte
   * passes `inPreview` as a static prop, and a changed `columnsPerCanvas` arrives as a fresh
   * ComposerRenderer instead, because the parent wraps the canvas in
   * {#key settings.columnsPerCanvas.value}. Theme, canvas size and textures have no props channel
   * to compare at all; they reach the scene through recalculateCacheAndSizes, which drops the pool
   * and, with it, the baseline this diffs against.
   */
  private needsUnconditionalRepaint(
    previous: ComposerRendererState,
    next: ComposerRendererState
  ): boolean {
    return (
      // not `previous.isRecordingAudio !== next.isRecordingAudio`: a baseline is only recorded by a
      // run that painted, which cannot be one where this was true. Written as an absolute so that
      // stays true even if the baseline rule is ever loosened - the pool must never be advanced
      // incrementally while the container it lives in is hidden.
      next.isRecordingAudio ||
      previous.columns !== next.columns ||
      previous.instruments !== next.instruments ||
      previous.breakpoints !== next.breakpoints ||
      previous.selectedColumns !== next.selectedColumns ||
      previous.currentLayer !== next.currentLayer ||
      previous.beatMarks !== next.beatMarks ||
      previous.smoothScroll !== next.smoothScroll
    );
  }

  /** beatMarks is 3 or 4 in the shipped options; 0 would mean "off" and falls back to 12. */
  private counterLimit(): number {
    const beatMarks = this.state.beatMarks;
    return beatMarks === 0 ? 12 : 4 * beatMarks;
  }

  /**
   * The drawn window, clamped to the song. `last < first` means nothing is drawn (an empty song).
   *
   * Closed form of isColumnVisible's set, solved for `pos` from the two strict inequalities there:
   * the smallest integer strictly greater than the low bound, and the largest strictly less than
   * the high one. The two are pinned against each other in test/composerRenderer.test.ts rather
   * than assumed equal, over every shipped columnsPerCanvas option and over fractional scroll
   * positions - a column-counting form that is exact on integers is where the two stop agreeing
   * once the scroll glides.
   */
  private visibleColumnRange(): { first: number; last: number } {
    const { width, columnWidth, playheadX } = this.windowGeometry();
    const bleed = WINDOW_BLEED_COLUMNS * columnWidth;
    const position = this.scrollPosition;
    const low = position - (playheadX + bleed) / columnWidth - 1;
    const high = position + (width + bleed - playheadX) / columnWidth;
    return {
      first: Math.max(0, Math.floor(low) + 1),
      last: Math.min(this.state.columns.length - 1, Math.ceil(high) - 1),
    };
  }

  private acquireColumnView(index: number, cacheData: ComposerCacheData): ColumnView {
    const view = this.freeColumnViews.pop() ?? new ColumnView(cacheData);
    //counted, not searched: the map holds only the drawn window, so this is at most a few dozen
    //integer comparisons, and it is what keeps the container's children in ascending index order
    let position = 0;
    for (const attached of this.columnViews.keys()) if (attached < index) position++;
    this.notesColumnsContainer.addChildAt(view.container, position);
    this.columnViews.set(index, view);
    return view;
  }

  private releaseColumnView(index: number, view: ColumnView): void {
    this.notesColumnsContainer.removeChild(view.container);
    this.columnViews.delete(index);
    // The view keeps its pixels - that is the pool - but it stops claiming to be showing a column,
    // because nothing repaints it while it waits outside the scene graph. Redundant against the
    // acquire/paint pairing today, and kept for the reason written at ColumnView.paintKey.
    view.paintKey = null;
    this.freeColumnViews.push(view);
  }

  /** Release every view outside [first, last]; the survivors keep whatever they last painted. */
  private releaseColumnViewsOutside(first: number, last: number): void {
    for (const [index, view] of this.columnViews) {
      if (index < first || index > last) this.releaseColumnView(index, view);
    }
  }

  /** The on-screen half of the pool, back into the free list. Deleting from a Map being iterated is
   *  defined behaviour - an already-visited entry stays visited, an unvisited one is skipped. */
  private releaseAllColumnViews(): void {
    for (const [index, view] of this.columnViews) this.releaseColumnView(index, view);
  }

  /** Destroy the pool outright - both halves. Used when the textures the views hold stop existing. */
  private dropColumnPool(): void {
    this.releaseAllColumnViews();
    for (const view of this.freeColumnViews) view.destroy();
    this.freeColumnViews.length = 0;
    // The pool and the paint baseline describe the same thing - "this window has been painted for
    // this state" - so they are invalidated together and cannot drift apart. Its callers today
    // either redraw immediately afterwards (recalculateCacheAndSizes) or are on their way out
    // (destroy); what runs in between on the first of those calls back into Svelte
    // (notifyGeometry) while the pool is empty and the baseline null.
    this.paintedState = null;
    //...and so does the overlay's painted counterpart, for the same reason: the pool it described
    //has stopped existing
    this.paintedOverlayColumn = null;
  }

  private paintColumn(
    index: number,
    cacheData: ComposerCacheData,
    sizes: { width: number; height: number },
    counterLimit: number
  ): void {
    const state = this.state;
    const column = state.columns[index];
    const tempoChangersCache = (index + 1) % 4 === 0 ? cacheData.columnsLarger : cacheData.columns;
    const standardCache = (index + 1) % 4 === 0 ? cacheData.standardLarger : cacheData.standard;
    const background =
      column.tempoChanger === 0
        ? standardCache[Number(index % (counterLimit * 2) >= counterLimit)]
        : tempoChangersCache[column.tempoChanger];
    const view = this.columnViews.get(index) ?? this.acquireColumnView(index, cacheData);
    view.paint({
      index,
      notes: column.notes,
      currentLayer: state.currentLayer,
      instruments: state.instruments,
      sizes,
      cache: cacheData,
      background,
      isToolsSelected: state.selectedColumns.includes(index),
      //false everywhere while smooth scrolling is on - see the overlayColumn field
      isSelected: index === this.overlayColumn,
      isBreakpoint: state.breakpoints.includes(index),
    });
    this.paintTails(view.tailGraphics, index, sizes);
    // Recorded with the pixels, in one place, rather than by whoever asked for the paint.
    view.paintKey = { column, version: column.version };
  }

  /**
   * Whether the view at `index` is already showing this column, for the narrowed repaint - see
   * ColumnPaintKey for what the pair means and why it is a pair.
   *
   * WHAT MAKES THIS SOUND is that everything else a column's pixels depend on is held still by the
   * branch that reaches it. paintColumn + ColumnView.paint + paintTails read exactly: the column's
   * own notes and tempoChanger (this counter); the tails of every span STARTING up to maxSpan
   * columns to the left (also this counter - ComposedSong.#touchColumns bumps the whole range a
   * span covers, the union of old and new on a shrink, so a note that draws on column i always
   * bumps column i); the index (see ColumnView.paintKey); `overlayColumn` (the overlay
   * drawNotesStage moves through syncOverlayColumn after the loop); `currentLayer`, `instruments`,
   * `selectedColumns`, `breakpoints`, `beatMarks` and `smoothScroll` (all of them forced onto the
   * unconditional path - see needsUnconditionalRepaint); and the textures, the column geometry and
   * paintTailAccent, which
   * only recalculateCacheAndSizes moves - and it drops the pool AND nulls the baseline in the same
   * function, so a narrowed run cannot straddle a change to any of them.
   *
   * maxSpan() is the one input not in that list: it only bounds how far back a column that IS being
   * painted scans, so it cannot make a SKIPPED column wrong.
   */
  private columnIsAlreadyPainted(index: number, column: NoteColumn): boolean {
    const key = this.columnViews.get(index)?.paintKey;
    if (!key) return false;
    // `!==`, never `>`: see ColumnPaintKey, and NoteColumn.version's CONSUMER CONTRACT.
    return key.column === column && key.version === column.version;
  }

  /**
   * Span tails render UNDER the note icons: a connector bar through covered columns (right-half
   * stub in the start column), accent for the current layer, dim otherwise.
   *
   * Backward scan, bounded by the song's longest span, and EXACT rather than approximate. A note
   * starting at `start` covers `index` iff `start <= index < start + span`; the pre-pool version
   * derived the same set by scanning columns 0..visibleEnd and clipping each span to the window,
   * which produced identical segments for a visible column (the clip collapses once
   * visibleStart <= index < visibleEnd) at a cost that GREW as playback advanced - at column 700 of
   * an 800-column song it read 720 columns and every note in them, to draw 39 columns.
   *
   * A column's tails therefore do not depend on the window position at all: shifting the window
   * changes nothing inside a column that stays visible, which is what lets the fast path repaint
   * only the column that entered.
   */
  private paintTails(
    graphics: Graphics,
    index: number,
    sizes: { width: number; height: number }
  ): void {
    graphics.clear();
    const { columns, instruments, currentLayer } = this.state;
    const rowHeight = sizes.height / NOTES_PER_COLUMN;
    const tailHeight = Math.max(2, rowHeight * 0.22);
    const accentColor = this.paintTailAccent;
    const first = Math.max(0, index - this.maxSpan() + 1);
    for (let start = first; start <= index; start++) {
      const notes = columns[start].notes;
      for (const note of notes) {
        if (note.span <= 1) continue;
        if (start + note.span <= index) continue;
        const instrument = instruments[note.trackIndex];
        const isCurrentLayer = note.trackIndex === currentLayer;
        if (!isCurrentLayer && !instrument?.visible) continue;
        const button = displayButtonForId(instrument?.name ?? '', note.id);
        if (button === -1) continue;
        const y = COMPOSER_NOTE_POSITIONS[button] * rowHeight + (rowHeight - tailHeight) / 2;
        const x = index === start ? sizes.width * 0.55 : 0;
        graphics.rect(x, y, sizes.width - x, tailHeight).fill({
          color: isCurrentLayer ? accentColor : 0x888888,
          alpha: isCurrentLayer ? 0.75 : 0.35,
        });
      }
    }
  }

  /**
   * The longest span in the song. Recomputed when the graph moved (or when the song was swapped),
   * never during playback - see the maxSpanCache declaration for why the key is that pair.
   *
   * ComposedSong has no maintained maximum: `maxSpanAt` is a different quantity (the longest span a
   * note MAY take at a position), and normalizeSpans only clamps against the next same-(track, id)
   * note, so one note may legally span the whole song. That degenerate case costs one full-song
   * scan per structural edit here, not one per tick.
   */
  private maxSpan(): number {
    const { columns, structureVersion } = this.state;
    const cached = this.maxSpanCache;
    if (cached && cached.columns === columns && cached.structureVersion === structureVersion) {
      return cached.span;
    }
    let span = 1;
    for (const column of columns) {
      for (const note of column.notes) if (note.span > span) span = note.span;
    }
    this.maxSpanCache = { columns, structureVersion, span };
    return span;
  }

  /**
   * The full repaint: both scenes, from scratch. Reached on the first update, on every edit, and
   * from recalculateCacheAndSizes (which is a second entry point into drawing, bypassing update()
   * entirely - theme and resize have no state channel).
   *
   * `narrowed` is the phase-4 opt-in: when it is set, a drawn column whose view is already showing
   * it is skipped (columnIsAlreadyPainted), and the columns whose selection flag can have changed
   * get their overlay repainted afterwards. It DEFAULTS TO OFF so that recalculateCacheAndSizes'
   * call cannot enable it - that path has just dropped the pool, and every key with it, but the
   * default is what makes "only update() narrows" a property of the signature rather than of its
   * call sites. Everything else here runs identically either way: the container offset, the
   * release/acquire pass, the whole timeline rebuild, the render and the baseline record.
   *
   * The render here is unconditional, and drawTimelineStage has just written the outline's EXACT x -
   * syncTimelineViewport's per-frame gate does not apply, because this rebuilt the timeline's whole
   * content container.
   */
  private draw(narrowed: boolean = false): void {
    if (!this.notesApp) return;
    const cacheData = this.cache?.cache;
    const sizes = this.columnSize;
    const state = this.state;
    const relativeColumnWidth = this.timelineColumnWidth();
    const viewport = this.timelineViewport();

    const painted = this.drawNotesStage(cacheData, sizes, this.containerX(), narrowed);
    this.drawTimelineStage(cacheData, relativeColumnWidth, viewport.width, viewport.x);
    this.notesApp.render();
    //the gate's baseline moves with the exact x drawTimelineStage just wrote, or the next frame
    //would compare against a position two repaints old and skip a write the outline needs
    this.writtenViewportX = Math.round(viewport.x);
    // The baseline is only the state of a run that ACTUALLY PAINTED the notes stage. Recording it
    // after a run that painted nothing (no cache yet, recording audio) would let the next update
    // diff against a moment that never reached the screen, and the pool would come back showing a
    // window it had never been asked to repaint.
    this.paintedState = painted ? state : null;
  }

  /** @returns whether the notes stage actually painted (see draw() for what that decides). */
  private drawNotesStage(
    cacheData: ComposerCacheData | undefined,
    sizes: { width: number; height: number },
    xPosition: number,
    narrowed: boolean
  ): boolean {
    this.notesColumnsContainer.x = xPosition;
    const visible = Boolean(cacheData) && !this.state.isRecordingAudio;
    this.notesColumnsContainer.visible = visible;
    if (!visible || !cacheData) {
      // The pool is left exactly as it is - hidden, not released and not destroyed, so the stage
      // costs nothing to bring back. What keeps that from showing a stale window is draw()'s rule
      // that a run reaching here records NO baseline: the next paintable update has nothing to diff
      // against and repaints every column of the window, whatever the views happen to be holding.
      return false;
    }
    const counterLimit = this.counterLimit();
    const { first, last } = this.visibleColumnRange();
    this.releaseColumnViewsOutside(first, last);
    // Iterates the WINDOW, not the whole song. The pre-pool version walked every column of the
    // song and filtered with isColumnVisible inside the callback - a second O(song) pass per draw,
    // on top of the tail scan.
    for (let index = first; index <= last; index++) {
      // The skip is HERE, before paintColumn, and never inside ColumnView.paint: paint() writing
      // every property it owns unconditionally is what makes a reused view safe (see that class),
      // and a "set it only if it changed" paint would invert exactly that.
      if (narrowed && this.columnIsAlreadyPainted(index, this.state.columns[index])) continue;
      this.paintColumn(index, cacheData, sizes, counterLimit);
    }
    // The columns whose selection flag can have moved, in the same call applyScrollPosition uses -
    // needed only on the narrowed path, where a skipped column keeps the flag it last painted, and
    // harmless on the full one, where the loop has just painted every drawn column from the same
    // field and the comparison inside it holds.
    this.syncOverlayColumn(cacheData);
    return true;
  }

  private paintSelectionOverlay(index: number, cacheData: ComposerCacheData): void {
    const view = this.columnViews.get(index);
    if (!view) return;
    view.paintSelection(
      cacheData,
      //matching paintColumn, which the narrowed repaint reaches other columns through
      index === this.overlayColumn,
      this.state.selectedColumns.includes(index)
    );
  }

  /**
   * The mini-timeline's content, in the strip's own coordinates - `0..this.stripWidth()` by
   * `0..this.timelineHeight`, with the strip's offset onto the canvas carried by timelineStrip in
   * both axes (see positionTimelineStrip).
   *
   * INSET FROM BOTH ENDS OF THE CANVAS, by the footprint of the three DOM buttons that float over
   * it: TIMELINE_INSET_LEFT (80px) for the two breakpoint-step buttons at the left,
   * TIMELINE_INSET_RIGHT (41.6px) for the add/remove-breakpoint button at the right. The CANVAS
   * still spans the whole card; only what is drawn on the strip is held clear of them. Those insets
   * are fixed px whatever the viewport is, because the buttons are fixed rem - so the narrower the
   * canvas the larger a fraction of it they take: 7.7% of a 1588px canvas at a 1920px viewport,
   * 41% of a 296px one at 400px.
   *
   * AN OFFSET AND NOT A SCALE. Every "across the whole song" divisor below and in timelineViewport()
   * is stripWidth(), so there is no canvas-space-to-strip-space factor anywhere and the pointer
   * handlers invert the offset with a single subtraction (stripX). The pre-merge timeline canvas
   * did scale - its element was inset by a flex shrink and the browser stretched a full-width bitmap
   * into it - and reproducing that here would have meant reproducing a flex shrink in arithmetic.
   *
   * WHAT THE INSET BUYS: the buttons stand over dead canvas rather than over the strip, so the bar,
   * the selection band and every breakpoint marker between the song's ends are drawn clear of them,
   * and the strip's whole span is pressable, first and last column included (testTimelineHitarea
   * rejects exactly the two inset bands, so a press on a button or on a seam between two of them
   * reaches no handler). What it costs: the whole song is compressed into 121.6px less width.
   *
   * WHAT STILL REACHES INTO THOSE BANDS, because nothing masks this container: the FIRST and LAST
   * breakpoint markers, which are anchored at 0.5 on strip x 0 and stripWidth, so half of a 10px
   * sprite falls outside - about 3.2px of it in the seam between two buttons and the rest behind
   * one. See TIMELINE_STRIP_RADIUS for why that is left and why the viewport outline, which
   * overflows by up to a whole canvas width, is masked instead.
   */
  private drawTimelineStage(
    cacheData: ComposerCacheData | undefined,
    relativeColumnWidth: number,
    timelineWidth: number,
    timelinePosition: number
  ) {
    for (const child of this.timelineContentContainer.removeChildren())
      child.destroy({ children: true });
    //the outline's clip is the strip's own shape, so it is re-cut wherever that shape is re-drawn
    this.syncViewportClip();
    // THE BAR ITSELF, drawn whether or not a cache exists yet - unlike everything below it.
    // `.timeline-scroll` carried `background-color` in the template, so the coloured bar was on
    // screen from the component's first paint, independent of pixi; this is all that is left to
    // paint it. Gated on cacheData the way the content is, it was missing for the whole of
    // recalculateCacheAndSizes' 50ms debounce after every mount - draw() runs before then, from the
    // first update() - and the band showed the Application's clear colour instead.
    //ROUNDED, because `.timeline-scroll`'s `border-radius: 0.3rem` used to round the strip's own
    //element and there is no element under it any more - see TIMELINE_STRIP_RADIUS
    const background = new Graphics();
    background.roundRect(0, 0, this.stripWidth(), this.timelineHeight, TIMELINE_STRIP_RADIUS);
    background.fill({ color: this.theme.timeline.hexNumber });
    this.timelineContentContainer.addChild(background);

    // viewportGraphics below is drawn regardless of cacheData too - only the selection band and the
    // breakpoint markers here are gated on it. The markers are cache TEXTURES; the band is gated
    // beside them because the old timeline canvas drew neither before its first cache.
    if (cacheData) {
      if (this.state.selectedColumns.length) {
        const first = this.state.selectedColumns[0] || 0;
        const last = this.state.selectedColumns[this.state.selectedColumns.length - 1];
        const x = first * relativeColumnWidth;
        const xEnd = last * relativeColumnWidth;
        const selectedRange = new Graphics();
        selectedRange.rect(x, 0, xEnd - x, this.timelineHeight);
        selectedRange.fill({ color: this.theme.timeline.selected, alpha: 0.6 });
        this.timelineContentContainer.addChild(selectedRange);
      }

      const breakpointsTexture = cacheData.breakpoints[0];
      this.state.breakpoints.forEach((breakpoint) => {
        const sprite = new Sprite(breakpointsTexture);
        sprite.eventMode = 'passive';
        sprite.anchor.set(0.5, 0);
        // QUIRK: `columns.length - 1` here while every other timeline value divides by
        // `columns.length` (see timelineColumnWidth()). Preserved verbatim - it is a pixel-level
        // difference that predates the pool, and it is why a one-column song puts a breakpoint at
        // NaN. Only the DIVIDEND moved to the strip's width with the inset.
        sprite.x = (this.stripWidth() / (this.state.columns.length - 1)) * breakpoint;
        this.timelineContentContainer.addChild(sprite);
      });
    }

    this.viewportGraphics.clear();
    this.viewportGraphics.roundRect(0, 0, timelineWidth, this.timelineHeight - 3, 6);
    this.viewportGraphics.stroke({ width: 3, color: this.theme.timeline.border, alpha: 0.8 });
    this.viewportGraphics.x = timelinePosition;
    this.viewportGraphics.y = 1.5;
  }

  // The Application must be explicitly destroyed to avoid a WebGL/canvas leak on remount
  // (this component remounts via {#key settings.columnsPerCanvas.value}).
  destroy(): void {
    // Before the Application goes: Application.destroy runs TickerPlugin.destroy, which destroys the
    // ticker, and Ticker.destroy begins by stopping it - so this is not what keeps a frame from
    // firing into a torn-down renderer. It is here so that the listener this class added is the
    // listener this class removes, rather than something a plugin teardown happens to also cover.
    this.stopMotionFrames();
    //...and the union goes with it, so "the Ticker runs iff this is not resting" holds through
    //teardown as well rather than only while the renderer is alive
    this.motion = { kind: 'resting' };
    this.notesApp?.ticker.remove(this.onMotionFrame, this);
    window.removeEventListener('resize', this.recalculateCacheAndSizes);
    window.removeEventListener('pointerup', this.resetPointerDown);
    window.removeEventListener('pointercancel', this.resetPointerDown);
    window.removeEventListener('blur', this.resetPointerDown);
    if (this.cacheRecalculateDebounce) clearTimeout(this.cacheRecalculateDebounce);
    this.wheelCanvas?.removeEventListener('wheel', this.handleWheel);
    this.themeDispose?.();
    // Before the Application goes: app.destroy({children: true}) only reaches what hangs off the
    // STAGE, and a released view is parked outside the scene graph entirely.
    this.dropColumnPool();
    this.cache?.destroy();
    this.notesApp?.destroy(true, { children: true });
    this.notesApp = null;
    this.wheelCanvas = null;
  }
}
