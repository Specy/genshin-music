// WHAT A POINTER GESTURE ON THE COMPOSER MEANS, as pure decisions — no pixi, no DOM, no song.
//
// The Compressed View's canvas has one pointer meaning (pick a column) and the Pro View's has four
// (pan, edit a cell, open a duration popover, and — since 2026-08-22 — zoom the rows with a pinch or
// a ctrl+wheel), decided from the same press with the same thresholds
// (CONTEXT.md: Pro View, Compressed View, View Lock; spec §7). Those decisions live HERE rather than
// inside ComposerRenderer for the reason proViewGeometry's own arithmetic does: the renderer is
// behind a dynamic pixi import, so its branches are only reachable from a test that mounts a whole
// fake pixi, while the rules themselves are ordinary functions of a handful of facts.
//
// WHAT IS NOT HERE, deliberately: the SONG. `proCellAction` is told whether the current layer has a
// note at the cell and which Button (if any) voices it, and answers what the tap does — it never
// looks a note up, so it cannot disagree with the caller about which layer or which Basepoint the
// question was asked at. Composer.svelte owns those lookups and the mutation that follows.
//
// THE THRESHOLDS ARE THE ONES THAT ALREADY EXISTED (spec §12): the click-vs-drag slop is
// ComposerRenderer's DRAG_SLOP_PX, applied here through the `moved` flag its own handlers set, and
// the long press is the composer keyboard's own COMPOSER_LONG_PRESS_MS below. Nothing in the Pro
// View invents a timing or a distance of its own.

/**
 * HOW LONG A PRESS BECOMES A LONG PRESS, in ms — the composer keyboard's threshold, and now the
 * canvas' too.
 *
 * It lived in ComposerNote.svelte, which is where it is still applied to a key; the Pro View's
 * canvas has to open the SAME popover from the SAME hold, and a second number would mean a key and a
 * cell feeling like different surfaces. Stated in a module both can import (ComposerRenderer must
 * not import a .svelte component, and ComposerNote must not import the renderer) rather than
 * exported from either of them.
 */
export const COMPOSER_LONG_PRESS_MS = 400;

/** A rectangle in SCREEN (viewport) coordinates — what the duration popover anchors itself to. */
export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * WHAT THE DURATION POPOVER IS POSITIONED AGAINST: a real element for a keyboard key, a bare
 * rectangle for a Pro View cell.
 *
 * The element form is a LIVE reference on purpose (the popover re-measures it on resize, so it
 * follows a keyboard that reflows). The rect form cannot be live — the cell it stands for is painted
 * pixels, not a node — which is exactly why the two are different shapes rather than one nullable
 * element: a caller handing a rect is saying "this is where it was", and the popover's resize
 * re-measure is a no-op for it.
 */
export type ComposerPopoverAnchor = { element: HTMLElement } | { rect: ScreenRect };

/**
 * WHAT A RELEASE ON THE NOTES STAGE MEANS. One function for both views, because the difference
 * between them is a single branch and writing it twice is how they drift.
 *
 *  - `settle-drag`: the press became a drag (or WAS one from the first instant — the Catch), so the
 *    release settles the scroll. A Catch never edits and never clicks: that rule is this branch, and
 *    it holds in the Pro View for the same reason it holds in the Compressed one (CONTEXT.md: Catch).
 *  - `select-column`: the Compressed View's settled tap, unchanged — including the case where no
 *    press was ever recorded on the stage (pixi hit-tests a page-wide pointerup against the canvas,
 *    so a release over the canvas that STARTED on a DOM element above it lands here; that has always
 *    picked a column and still does).
 *  - `dismiss-sheet`: the Pro View's settled tap WHILE THE KEYBOARD SHEET IS UP — it puts the sheet
 *    down and edits nothing (spec §2's "the first tap on the canvas dismisses it and is SWALLOWED").
 *    The swallow used to be structural: the sheet's backdrop covered the whole canvas, so the press
 *    never reached pixi at all. That backdrop is now a scrim over the KEYBOARD'S OWN BAND (App.css),
 *    which is what lets the canvas above it go on scrolling under the hand while the sheet is up —
 *    so the swallow has to be a rule, and it is this one. It sits AFTER `settle-drag`, which is the
 *    whole point: a drag while the sheet is up scrolls exactly as it does while the sheet is down
 *    and leaves it standing.
 *  - `cell-tap`: the Pro View's settled tap, which is an EDIT (spec §2 "tap = edit only").
 *  - `nothing`: a Pro View press that is neither. Two ways in, and both matter:
 *    `longPressConsumed` — the hold already opened the duration popover, so the release must not also
 *    toggle the note (the keyboard's own `longPressFired` rule, restated for the canvas); and
 *    `moved` — the pointer travelled past the drag slop in EITHER axis. In the Compressed View that
 *    second case cannot arise, and it is not consulted there: a stray vertical wander still clicks,
 *    exactly as it always has. In the Pro View a click ADDS A NOTE, so a press that visibly moved is
 *    a gesture that missed rather than a tap.
 *
 * `pressed` is what makes the Pro View's edit require a press this canvas actually recorded. The
 * Compressed View asks nothing of it, so the page-wide-release case above keeps its old meaning
 * while an edit — or a dismissal — can only ever come from a press that began on the notes stage.
 */
export function stageReleaseIntent(input: {
  proView: boolean;
  /** the press is (or became) a stage drag — including a Catch, whose press entered the drag itself */
  becameDrag: boolean;
  /** this release ends a press this renderer recorded on the notes stage */
  pressed: boolean;
  /** the pointer travelled past the drag slop in either axis (Pro View only — see the block) */
  moved: boolean;
  /** a long press fired on this press and something took it */
  longPressConsumed: boolean;
  /** the Pro View's keyboard sheet is up (raised, or held up by a recording) */
  sheetRaised: boolean;
}): 'settle-drag' | 'select-column' | 'cell-tap' | 'dismiss-sheet' | 'nothing' {
  if (input.becameDrag) return 'settle-drag';
  if (!input.proView) return 'select-column';
  if (input.longPressConsumed || input.moved || !input.pressed) return 'nothing';
  return input.sheetRaised ? 'dismiss-sheet' : 'cell-tap';
}

/**
 * WHETHER A PRESS ON THE NOTES STAGE STARTS THE LONG-PRESS CLOCK — the press-time half of the rules
 * above, and the same three facts asked at the other end of the gesture.
 *
 * The Compressed View has no long press on the canvas at all. A CATCH arms nothing: that press is
 * the grab of a moving canvas, so it neither edits nor opens anything (CONTEXT.md: Catch). And with
 * the SHEET UP the canvas has exactly two meanings — scroll it, or put the sheet away — so a hold
 * must not open a duration popover over a keyboard the user is still looking at; the release
 * dismisses instead (`dismiss-sheet` above), which a consumed long press would have suppressed.
 */
export function stagePressArmsLongPress(input: {
  proView: boolean;
  /** this press entered a drag at once, stopping a Coast (CONTEXT.md: Catch) */
  catching: boolean;
  /** the Pro View's keyboard sheet is up */
  sheetRaised: boolean;
}): boolean {
  return input.proView && !input.catching && !input.sheetRaised;
}

/**
 * WHETHER A WHEEL EVENT IS A ZOOM RATHER THAN A SCROLL (spec §7, user revision 2026-08-22).
 *
 * `ctrlKey` is not a modifier the user pressed here: a trackpad PINCH is delivered to a page as a
 * wheel event with `ctrlKey` set, on every browser that supports one, and that synthetic flag is the
 * only signal a page gets that the gesture was a pinch. `metaKey` beside it is the mac convention
 * for the same intent from a mouse wheel. A plain wheel keeps the horizontal meaning it has always
 * had, in both views.
 *
 * THE PRO VIEW ONLY. The Compressed View has no vertical axis to zoom — every row of a column is on
 * screen at once — so a ctrl+wheel there stays what it has always been, and this returns false
 * before anything else is asked.
 */
export function wheelIsProZoom(input: {
  proView: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  return input.proView && (input.ctrlKey || input.metaKey);
}

/**
 * HOW FAST A WHEEL ZOOMS, per pixel of delta: the exponent in the multiplier below.
 *
 * EXPONENTIAL and not linear, because zoom is a ratio: one notch has to feel the same at 0.5x as at
 * 3x, and adding a constant would make the first half of the range crawl and the second half jump.
 * The rate is set from the two hardware cadences this has to serve at once — a mouse notch is
 * ~100px of delta and asks for ~1.28x (about seven notches from one end of the range to the other),
 * while a trackpad pinch arrives as a stream of 1-10px deltas and moves ~1.003-1.03x each, which is
 * what makes it feel continuous.
 */
export const PRO_ZOOM_WHEEL_RATE = 0.0025;

/**
 * THE MULTIPLIER ONE WHEEL EVENT ASKS FOR — `exp(−delta × rate)`, so up (a negative delta, the
 * "zoom in" direction on every platform) magnifies and down shrinks.
 *
 * It is a multiplier and not a zoom, deliberately: this function knows nothing about where the zoom
 * IS, so the caller multiplies its own current zoom by it and clamps the product
 * (proViewGeometry.clampProZoom owns the range). A non-finite delta answers 1 rather than poisoning
 * that product.
 */
export function wheelZoomFactor(deltaPx: number): number {
  if (!Number.isFinite(deltaPx)) return 1;
  return Math.exp(-deltaPx * PRO_ZOOM_WHEEL_RATE);
}

/**
 * WHETHER A WHEEL EVENT IS THE PRO VIEW'S VERTICAL SCROLL (user, 2026-08-22): shift held, and not
 * a zoom — ctrl/meta outrank shift, so a ctrl+shift+wheel still zooms and this never claims it.
 *
 * SHIFT is the browser's own "scroll the other axis" modifier, and that is exactly the meaning
 * borrowed here: the canvas' plain wheel already owns the horizontal axis, so the shifted one
 * scrolls the axis it does not. Browsers commit to that convention hard enough that most deliver a
 * shifted wheel's travel on `deltaX` with `deltaY` ZERO — the caller must read whichever axis
 * carries it (ComposerRenderer.shiftedWheelDeltaPx) rather than assuming `deltaY`.
 *
 * THE PRO VIEW ONLY, for the zoom's own reason: the Compressed View has no vertical axis, and a
 * shifted wheel there keeps doing what it always did (nothing — the swapped delta lands on the
 * deltaY===0 return).
 */
export function wheelIsProVerticalScroll(input: {
  proView: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  return input.proView && input.shiftKey && !input.ctrlKey && !input.metaKey;
}

/** Two pointers' positions, as the pinch below measures them — canvas coordinates, like every other pointer here. */
export interface PinchPoint {
  x: number;
  y: number;
}

/**
 * A TWO-FINGER PINCH, MEASURED: how far apart the fingers are and where the gesture is centred.
 *
 * `distance` is the full 2D distance and not the vertical component alone, which is what makes a
 * pinch held at any angle work; `centerY` is the focal point the zoom is anchored at (the row under
 * the middle of the two fingers keeps its screen y — proViewGeometry.zoomedCameraY), and `centerX`
 * is carried beside it because a focal point is a point, and a caller that ever pans horizontally
 * with the pinch would need it rather than a second function.
 */
export function pinchSpan(
  a: PinchPoint,
  b: PinchPoint
): { distance: number; centerX: number; centerY: number } {
  return {
    distance: Math.hypot(b.x - a.x, b.y - a.y),
    centerX: (a.x + b.x) / 2,
    centerY: (a.y + b.y) / 2,
  };
}

/**
 * THE MULTIPLIER A PINCH ASKS FOR: how much the fingers' separation has grown since it was last
 * measured. Fingers twice as far apart mean rows twice as tall.
 *
 * Read against the PREVIOUS measurement rather than the gesture's start, so the caller applies it
 * incrementally: the zoom that comes back is already clamped by the range, and an incremental
 * measure means reversing a pinch that hit an end starts moving again at once instead of having to
 * undo the excess it never applied.
 *
 * A degenerate span — two fingers landing on the same point, or a zero previous distance — answers
 * 1: there is no ratio between nothing and something.
 */
export function pinchZoomFactor(previousDistance: number, distance: number): number {
  if (!(previousDistance > 0) || !(distance > 0)) return 1;
  return distance / previousDistance;
}

/** The cell a Pro View pointer is over: a song column and a Note Number, both already resolved. */
export interface ProCellTarget {
  column: number;
  number: number;
}

/**
 * WHICH CELL A POINTER IS ON, or null for "no cell at all" — the mechanical half of the Pro View's
 * hit test, with the two vertical resolutions (`numberAtY`, the horizontal column math) done by the
 * caller and handed in.
 *
 * THREE WAYS TO MISS, and each is a rule rather than a guard:
 *  - THE ROW-LABEL STRIP's band. It is drawn over the leftmost column, sticky and screen-fixed, so a
 *    tap that lands on it is aimed at a label and not at the note under it (spec §7: inert). Stated
 *    as a bare x-vs-width test because that is exactly what the strip occupies.
 *  - OFF THE AXIS: `number` is null when the y is above the axis' top row or below its bottom one.
 *  - OFF THE SONG: the canvas is wider than the song at every scroll position (the columns are
 *    surrounded by empty canvas), and a column index outside it addresses nothing. NOT clamped, the
 *    way the Compressed View's click is: clamping a miss to the nearest end column is harmless when
 *    the outcome is a selection and is a note written into a column the user never pointed at when
 *    the outcome is an edit.
 */
export function proTapTarget(input: {
  /** the pointer's x in CANVAS coordinates */
  x: number;
  /** the row-label strip's own width, in px */
  stripWidth: number;
  /** the (already floored) column under the pointer */
  column: number;
  /** the Note Number under the pointer, or null when the y is off the axis */
  number: number | null;
  columnCount: number;
}): ProCellTarget | null {
  if (input.x < input.stripWidth) return null;
  if (input.number === null) return null;
  if (input.column < 0 || input.column >= input.columnCount) return null;
  return { column: input.column, number: input.number };
}

/**
 * WHAT A TAP ON A PRO VIEW CELL DOES (spec §7's dispatch, and the whole of it).
 *
 * The order is the decision. `covered` first, because the occupancy rule outranks everything: a cell
 * inside another note's span on this track is not free to hold a note of its own, which is exactly
 * what the composer keyboard already does with a covered button (ComposerKeyboard/handleClick's
 * `getSpanCovering` branch) — the tail is edited through its own long press, never through a tap on
 * the middle of it.
 *
 * Then REMOVE BEFORE ADD, and by NUMBER rather than by button, which is what makes this canvas the
 * place a Stranded Note can be deleted (CONTEXT.md: Stranded Note; spec §2): a number no button of
 * the current instrument voices still answers `remove` when the layer has a note there, and answers
 * `inert` when it does not. `button` is `numberToButton`'s own -1 sentinel, so a row inside the
 * Editable Zone that maps to no button (the striped rows) is inert, and so is every row outside it.
 *
 * OTHER LAYERS ARE NOT AN INPUT AT ALL. Their notes are drawn on the same row and neither block an
 * add nor offer themselves for deletion — a tap edits YOUR layer or nothing.
 */
export function proCellAction(input: {
  /** the CURRENT layer has a note at this (column, number) */
  hasOwnNote: boolean;
  /** an earlier note of the current layer spans across this cell */
  covered: boolean;
  /** `numberToButton(current instrument, effective Basepoint, number)`, i.e. -1 for none */
  button: number;
}): 'add' | 'remove' | 'inert' {
  if (input.covered) return 'inert';
  if (input.hasOwnNote) return 'remove';
  return input.button >= 0 ? 'add' : 'inert';
}
