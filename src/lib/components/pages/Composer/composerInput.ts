// WHAT A POINTER GESTURE ON THE COMPOSER MEANS, as pure decisions — no pixi, no DOM, no song.
//
// The Compressed View's canvas has one pointer meaning (pick a column) and the Pro View's has three
// (pan, edit a cell, open a duration popover), decided from the same press with the same thresholds
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
export const COMPOSER_LONG_PRESS_MS = 450;

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
 * Compressed View asks nothing of it, so the sheet/backdrop case above keeps its old meaning while
 * an edit can only ever come from a press that began on the notes stage.
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
}): 'settle-drag' | 'select-column' | 'cell-tap' | 'nothing' {
  if (input.becameDrag) return 'settle-drag';
  if (!input.proView) return 'select-column';
  if (input.longPressConsumed || input.moved || !input.pressed) return 'nothing';
  return 'cell-tap';
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
