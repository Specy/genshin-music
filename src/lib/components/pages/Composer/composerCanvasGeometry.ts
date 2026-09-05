// THE COMPOSER CANVAS' SIZES AND THE STRIP'S INSETS, in one pixi-free module.
//
// Two consumers, and the split between them is the whole point of the file existing:
//  - ComposerRenderer, which draws with these numbers (and is behind a dynamic import, so nothing
//    here may reach for pixi or the file stops being loadable from the Svelte component);
//  - ComposerCanvas.svelte, which needs the canvas' size as a CSS EXPRESSION before the renderer
//    exists at all - see composerCanvasCssSize for what that is for.
//
// NOTHING HERE TOUCHES `document` AT IMPORT TIME. ComposerCanvas.svelte imports it statically and
// that component is prerendered (adapter-static), so a module-level DOM read would break the build.
// The DOM measurement stays at the call site: composerCanvasSize takes the body's rect as numbers.
import { game } from '$game';
import { isMobile } from 'is-mobile';
import { nearestEven } from '$core/utils/Utilities';

/**
 * THE ROOT FONT SIZE EVERY px CONSTANT IN THIS FILE IS DERIVED AT.
 *
 * Verified: nothing in src/lib/css/*.css sets `font-size` on `html` or `:root`, and src/app.html
 * adds none - so 16px holds unless the USER changes their browser's default font size, in which
 * case the buttons (sized in rem by App.css) and the strip (sized in px by the constants below)
 * move apart by the ratio between the two. Accepted rather than fixed: the alternative is reading
 * the computed root font size at runtime, and jsdom returns the keyword "medium" for it, so
 * `parseFloat` is NaN and every test would exercise a fallback branch instead of the real one.
 *
 * test/composerCanvasCss.test.ts asserts App.css still declares the two rem values these are
 * derived from, which is the only thing standing between that stylesheet and this file.
 */
const ROOT_FONT_SIZE = 16;

/** `.timeline-button`'s `width: 2.2rem` in src/lib/css/App.css. */
export const TIMELINE_BUTTON_SIZE = 2.2 * ROOT_FONT_SIZE;
/** `.timeline-controls`'s `padding` and `gap`, both `0.2rem` in src/lib/css/App.css. */
export const TIMELINE_BUTTON_MARGIN = 0.2 * ROOT_FONT_SIZE;

/**
 * WHERE THE MINI-TIMELINE STRIP STARTS on the canvas, in px.
 *
 * The canvas spans the whole card, but the two previous/next-breakpoint buttons float over its left
 * end, so the strip is drawn clear of them instead of underneath them. This is the controls'
 * leading padding + button + gap + button + trailing padding.
 */
export const TIMELINE_INSET_LEFT = TIMELINE_BUTTON_MARGIN * 3 + TIMELINE_BUTTON_SIZE * 2;
/**
 * WHERE THE STRIP ENDS: the band the add/remove-breakpoint button stands on, which is the controls'
 * 0.2rem gap before it, the 2.2rem button, and 0.2rem trailing padding.
 *
 * The button carries `margin-left: auto` inline (ComposerCanvas.svelte), which consumes the free
 * space and leaves this fixed-size trailing band.
 */
export const TIMELINE_INSET_RIGHT = TIMELINE_BUTTON_MARGIN * 2 + TIMELINE_BUTTON_SIZE;

/**
 * There is no dead band around the mini-timeline any more. The former two 0.2rem padding rows are
 * folded into composerTimelineHeight instead, so the minimap gains useful pitch resolution without
 * making the composer taller. Kept as an exported geometry value because ComposerRenderer reports
 * the split to ComposerCanvas.svelte and both sides must continue to use one formula.
 */
export const TIMELINE_BAND_PADDING = 0;

/** The two former 0.2rem padding rows, now part of the timeline's drawable height. */
const RECLAIMED_TIMELINE_PADDING = TIMELINE_BUTTON_MARGIN * 2;

/**
 * `.canvas-buttons`'s `min-width: 2.8rem` in src/lib/css/App.css - the footprint of the two
 * previous/next-column chevrons that float over the canvas' left and right edges, and THE WIDTH OF
 * THE TWO BANDS A RULER SCRUB CREEPS IN (CONTEXT.md: Ruler Scrub).
 *
 * ONE STATEMENT OF THE COUPLING, in the same shape TIMELINE_BUTTON_SIZE states the mini-timeline's:
 * the stylesheet places the DOM buttons and this file hands the same px to the pixi side, so the
 * band a finger auto-scrolls in and the button it is pushing against are one rectangle rather than
 * two that happen to agree. test/composerCanvasCss.test.ts keeps the two sides together.
 *
 * THE BAND IS THE BUTTON'S GEOMETRY AND NOT ITS EXISTENCE. Those chevrons are `display: none` on
 * desktop pointers at wide widths, and the `useKeyboardSideButtons` setting replaces them with keys
 * outright - the creep bands are live in all three cases, because what they are is "the edge of the
 * canvas, as wide as this app has always called an edge", and a gesture that changed shape with a
 * media query would be a gesture nobody could learn. See ComposerRenderer.advanceRulerCreep.
 *
 * The LEFT band starts at the row-label strip's inner edge rather than at x 0, which is where
 * ComposerCanvas.svelte puts the left chevron (`left: {stripInset}px`, from proStripWidth) so it
 * does not stand on the pitch labels; the RIGHT one ends at the canvas' own edge (`right: 0`).
 */
export const CANVAS_SIDE_BUTTON_WIDTH = 2.8 * ROOT_FONT_SIZE;

/**
 * THE COLUMN RULER'S HEIGHT, in px - THE SAME NUMBER ON DESKTOP AND ON PHONES (CONTEXT.md: Column
 * Ruler, Ruler Scrub; spec 2026-08-27 §2).
 *
 * The band exists because the Pro View has no click-to-select-column at all: composerInput's
 * `stageReleaseIntent` resolves a settled tap on the notes stage to `cell-tap` there and to
 * `select-column` only in the Compressed View, so without the ruler the only ways to change column
 * in this view are a stage drag, a mini-timeline scrub, or the keyboard. It is the surface, and the
 * timestamps printed on it are what it is marked with.
 *
 * TWENTY PIXELS IS KNOWINGLY UNDER THE ~44px TOUCH GUIDELINE, accepted rather than overlooked. What
 * carries it: the band is the WHOLE canvas wide, so the target is enormous in the one axis the
 * gesture travels along, and the mini-timeline directly above it stays the coarse whole-song
 * alternative for a thumb that lands high.
 *
 * AND THERE IS NO MOBILE BRANCH, unlike composerTimelineHeight() a few lines below - the asymmetry
 * is the decision, not an omission. Rejected: ~30px on mobile to match that function, which would
 * make the ruler a second UA-dependent term in a sum the PRERENDERED placeholder has to reproduce
 * (composerCanvasCssSize), for a band whose whole content is a row of small timestamps that reads no
 * better at 30px. Also rejected: a thin DRAWN band with a hit area reaching down into the notes
 * region, which would steal every press aimed at a note whenever the camera is unlocked - i.e. it
 * would break cell editing to make the ruler easier to hit.
 *
 * THE BILL, in the units a user sees it in (spec §4): genshin's canonical frame is ~36 rows over a
 * ~900px region, so a desktop row goes 24 -> 23.4px (-2.4%); a 420px landscape phone goes 11 ->
 * 10.5px (-5%). If 20px proves bad in use, the escape is the mobile height branch above, NOT the
 * hidden hit area.
 */
export const COLUMN_RULER_HEIGHT = 20;

/**
 * The canvas' size as a fraction of the body's, stated in the CSS units the placeholder is written
 * in - `85vw`, `45vh` - so that composerCanvasSize and composerCanvasCssSize below are two
 * renderings of ONE formula rather than two formulas that happen to agree today.
 *
 * `vw`/`vh` are converted as `body * (n / 100)` and NOT as `(n * body) / 100`: the two associate
 * differently in the last bit for about 40% of fractional body widths, and the result goes through
 * nearestEven, which turns a 1-ulp difference at an odd-integer input into a 2px difference.
 * test/composerCanvasCss.test.ts's evaluator reproduces this association deliberately.
 */
const CANVAS_WIDTH_VW = 85;
/** ...less a fixed gutter, which is where the composer's side button columns go. */
const CANVAS_WIDTH_INSET_PX = 45;
const CANVAS_HEIGHT_VH = 45;

/**
 * THE COMPOSER'S DESKTOP/MOBILE BOUNDARY, and it is `.composer-grid`'s own pre-existing one: every
 * composer rule in src/lib/css/App.css that reshapes the page for phones already lives in that
 * file's `@media only screen and (max-width: 1000px)` block (`.composer-grid { width: 100% }`,
 * `.composer-left-control { width: 5.4rem }`, `.tool { flex: 1; width: 100% }`, the
 * `.canvas-buttons` the desktop layout never shows).
 *
 * DESKTOP IS THE EXACT COMPLEMENT of that block - `not all and (max-width: 1000px)`, i.e. strictly
 * WIDER than 1000px - rather than `(min-width: 1001px)`: the two forms agree on every integer
 * viewport, but a fractional one (browser zoom, fractional device pixel ratios) falls in the gap
 * between `<= 1000` and `>= 1001` and would match NEITHER block, leaving the composer with the
 * desktop base rules and none of the desktop overrides.
 */
export const COMPOSER_MOBILE_MAX_WIDTH = 1000;
/** The media query for the desktop layout - see COMPOSER_MOBILE_MAX_WIDTH. Mirrors App.css. */
export const COMPOSER_DESKTOP_MEDIA_QUERY = `not all and (max-width: ${COMPOSER_MOBILE_MAX_WIDTH}px)`;

/**
 * The JS side of COMPOSER_DESKTOP_MEDIA_QUERY, for the one path that has a width rather than a
 * `matchMedia` handle: composerCanvasSize below, which ComposerRenderer calls with the BODY's
 * measured rect. On the composer route that rect is the viewport exactly (no root scrollbar - see
 * composerCanvasCssSize for why), so the two forms of the boundary cannot disagree there.
 */
export function isComposerDesktopWidth(bodyWidth: number): boolean {
  return bodyWidth > COMPOSER_MOBILE_MAX_WIDTH;
}

/**
 * THE DESKTOP CANVAS FILLS THE WINDOW. The sidebar is permanently open above
 * COMPOSER_MOBILE_MAX_WIDTH (ComposerMenu.svelte), so nothing overlays the page any more and the
 * canvas takes every pixel the sidebar and the composer's own two button columns leave, instead of
 * the `85vw - 45px` card that used to be centred in the window with the sidebar hidden off-screen.
 *
 * The inset is EVERY FIXED-WIDTH THING ON THAT ROW, in src/lib/css/App.css:
 *   `--menu-size` 4rem            the permanent sidebar `.composer-grid` is pushed clear of
 *   DESKTOP_SIDEBAR_GAP_REM       the breathing room between the two, below
 *   `.composer-grid` padding      0.2rem on each side
 *   `.composer-left-control`      6.2rem
 *   `.composer-grid` gap          0.2rem, between the left control and the canvas
 *   `.buttons-composer-wrapper-right` margin-left 0.2rem
 * ...and the ONE non-fixed thing, `.tool`'s `width: max(4vw, 3.5rem)`: the canvas gets what is left
 * of the viewport, `100vw - max(4vw, 3.5rem)`.
 *
 * IT IS A max() AND NOT A PLAIN `96vw` (user addition 2026-08-22) because 4vw falls under 3.5rem on
 * every viewport narrower than 1400px - which is most laptops - and the tool column has to stay
 * wide enough for its icons. The canvas is the column's complement, so the floor belongs to both
 * sides or the canvas slides under the column exactly where it engages.
 *
 * test/composerCanvasCss.test.ts reads all six declarations out of the stylesheet, so this list
 * cannot drift away from what the browser actually lays out.
 */
const DESKTOP_TOOL_COLUMN_VW = 4;
/** ...and the floor under it, `.tool`'s own `3.5rem` in src/lib/css/App.css. */
const DESKTOP_TOOL_COLUMN_MIN_REM = 3.5;

/**
 * The tool column's width at a given viewport width, which is the term the canvas is the window
 * less. `max()`, unlike nearestEven, IS reproducible in CSS - so the string form below states the
 * same choice rather than approximating it, and the two agree on both sides of the 1400px viewport
 * where the floor takes over.
 */
function desktopToolColumnWidth(bodyWidth: number): number {
  return Math.max(
    bodyWidth * (DESKTOP_TOOL_COLUMN_VW / 100),
    DESKTOP_TOOL_COLUMN_MIN_REM * ROOT_FONT_SIZE
  );
}

/**
 * THE GAP BETWEEN THE PINNED SIDEBAR AND THE COMPOSER, on top of `--menu-size`: `.composer-grid`'s
 * desktop `margin-left` is `calc(var(--menu-size) + 0.1rem)` and this is that `0.1rem`. It comes
 * out of the canvas' width like every other term here, so widening it moves the canvas' left edge
 * right rather than pushing its right edge off the window.
 */
const DESKTOP_SIDEBAR_GAP_REM = 0.1;
/**
 * ROUNDED, because this number is also printed into a CSS string: the sum of these six rem values
 * lands on 177.60000000000002 in binary floating point, and `calc(96vw - 177.60000000000002px)` is
 * what would end up in the DOM. Three decimals is far below the sub-pixel the browser rounds to.
 */
const DESKTOP_CANVAS_INSET_PX =
  Math.round(
    (4 * ROOT_FONT_SIZE + //--menu-size
      DESKTOP_SIDEBAR_GAP_REM * ROOT_FONT_SIZE + //the gap that clears the sidebar
      0.2 * ROOT_FONT_SIZE * 2 + //.composer-grid padding, both sides
      6.2 * ROOT_FONT_SIZE + //.composer-left-control
      0.2 * ROOT_FONT_SIZE + //.composer-grid gap
      0.2 * ROOT_FONT_SIZE) * //.buttons-composer-wrapper-right margin-left
      1000
  ) / 1000;

/**
 * THE LOWERED KEYBOARD SHEET'S SLIVER, in px: `:root`'s `--pro-sliver-height: 2.5rem` in
 * src/lib/css/App.css, read back by test/composerCanvasCss.test.ts the way the timeline buttons'
 * rem values are.
 *
 * It is a CANVAS constant and not merely a keyboard one because the Pro View canvas stops ABOVE it.
 * The sheet is fixed to the viewport's bottom edge in Pro View (CONTEXT.md: Pro View), so a canvas
 * run to the window's bottom would keep its lowest rows permanently under the sliver - and those
 * rows are real, addressable Note Numbers there, not the empty tail the Compressed View's 45vh card
 * has below it.
 *
 * 2.5rem and not the 1.5rem it shipped as: a sliver is the ONLY thing saying the keyboard is still
 * there and where to tap for it, and at 24px a three-row keyboard showed a sixteenth of its top row.
 */
export const PRO_KEYBOARD_SLIVER_PX = 2.5 * ROOT_FONT_SIZE;

/**
 * WHAT THE PRO VIEW'S CANVAS ELEMENT IS THE VIEWPORT LESS, in px - the vertical counterpart of
 * DESKTOP_CANVAS_INSET_PX:
 *   `.composer-grid` padding      0.2rem at the top and 0.2rem at the bottom
 *   the sliver band               PRO_KEYBOARD_SLIVER_PX
 * ...so the canvas starts 3.2px below the window's top edge and stops 3.2px above the sliver, with
 * that trailing 3.2px being the grid's own bottom padding rather than a gap invented here, and the
 * sliver standing at the window's own bottom edge.
 *
 * THE SONG-INFO ROW IS NOT A TERM OF THIS (user revision 2026-08-22). It was for one round -
 * `--pro-song-info-height: 1.75rem` under the sliver, with the canvas stopping above both - and the
 * canvas has that 28px of axis back: `.song-info` is an OVERLAY at the window's bottom again
 * (App.css's `.song-info-pro`), floating over the lowest rows the way it floats over every other
 * page, covered by the keyboard sheet when that is up. Read-only text reserving a row of the one
 * surface this view exists to edit was the wrong trade.
 *
 * IT ASSUMES `.composer-grid` IS THE WINDOW'S HEIGHT, which it is on the composer route: `.app` is
 * an `align-items: stretch` flex row inside the full-height shell, so the grid's border box is
 * exactly `100vh` and its content box starts at that padding. `.composer-grid-pro` additionally
 * pins `grid-template-rows: 1fr auto` so the canvas' row is that whole content box rather than the
 * two auto rows the base layout splits it between - without that the canvas would be sized for a
 * row the stylesheet had made shorter. test/composerCanvasCss.test.ts reads both declarations.
 *
 * ROUNDED for the same reason DESKTOP_CANVAS_INSET_PX is: the number is printed into a CSS string.
 */
const PRO_CANVAS_INSET_PX =
  Math.round(
    (0.2 * ROOT_FONT_SIZE * 2 + //.composer-grid padding, top and bottom
      PRO_KEYBOARD_SLIVER_PX) * //the band the lowered keyboard sheet peeks into
      1000
  ) / 1000;
/**
 * The Pro View canvas' height as the CSS unit the placeholder is written in - `100vh` - so that the
 * pro branches of composerCanvasSize and composerCanvasCssSize stay two renderings of ONE formula,
 * exactly as CANVAS_HEIGHT_VH does for the Compressed View.
 *
 * `vh` AND NOT `dvh`, with the same consequence the module header states for the compressed branch
 * and one extra one that only bites here: the JS side measures `document.body`, whose height is the
 * initial containing block's and therefore the UA's LARGE viewport height, so `vh` is the only unit
 * that agrees with it. Where a mobile URL bar is showing, the visible viewport is shorter than that
 * and the canvas' last rows sit under the bar - which is what the rest of the composer already
 * does (`.composer-left-control` is `calc(100vh - 5rem)`), so the Pro View is not a new exception.
 * `dvh` would make the two forms disagree by the bar's 25-45px and reinstate the load-time jump the
 * placeholder exists to prevent.
 */
const PRO_CANVAS_HEIGHT_VH = 100;
/**
 * The floor under the Pro View's notes region, in px. It is a DIVISOR - proViewGeometry.proRowHeight
 * divides it by the framed row count - and pixi cannot resize to a negative height at all, so a viewport
 * shorter than the chrome above resolves to a degenerate but finite region instead of poisoning
 * every row. Unlike nearestEven this IS reproduced in CSS (`max()`, unlike `round()`, is supported
 * everywhere this app runs), so the two forms agree even in that unreachable corner.
 */
const PRO_MIN_NOTES_HEIGHT_PX = 2;

/** Below this body width the theme preview shrinks the canvas less aggressively - see below. */
const PREVIEW_NARROW_BODY = 900;
const PREVIEW_WIDTH_FACTOR_NARROW = 0.8;
const PREVIEW_WIDTH_FACTOR_WIDE = 0.55;
const PREVIEW_HEIGHT_FACTOR_NARROW = 0.8;
const PREVIEW_HEIGHT_FACTOR_WIDE = 0.6;

/**
 * The mini-timeline strip's own height, in px.
 *
 * A UA check rather than a media query, and that is not reproducible in CSS: `is-mobile` matches a
 * user-agent regex, so a 1200px-wide Android tablet reports mobile and an iPad reports desktop. With
 * no `navigator` at all - which is the state a prerender runs in - it returns false, so the served
 * HTML carries the 36.4px desktop value and hydration may replace it with 31.4px on mobile.
 */
export function composerTimelineHeight(): number {
  return (isMobile() ? 25 : 30) + RECLAIMED_TIMELINE_PADDING;
}

/**
 * THE CANVAS ELEMENT'S HEIGHT: the notes region, the band the mini-timeline sits in, and - in the
 * Pro View ONLY - the Column Ruler's band between the two. The one statement of that sum;
 * ComposerRenderer.canvasHeight() and composerCanvasCssSize below are both this, so the placeholder
 * and the canvas cannot disagree about what the bands take.
 *
 * `proView` IS A PARAMETER, AND IT DEFAULTS TO THE COMPRESSED VIEW - which is this function's whole
 * history in two lines. It took no view at all for as long as the two regions merely SWAPPED PLACES
 * inside a constant sum (composerNotesRegionY still states that swap, and nothing about it has
 * changed); the ruler is the first band that exists in one view and not in the other, so the sum
 * itself parts company between them. The default reproduces the Compressed View's arithmetic
 * TERM FOR TERM, so every caller with no view to give keeps exactly the height it had - which is
 * what makes that view a byte-identical no-op here.
 *
 * IT MUST BE GIVEN THE SAME FLAG composerNotesRegionY IS. The two are one layout statement split in
 * half: the region's top carries the ruler's band and this carries it again, so a `true` here with
 * a `false` there (or the reverse) leaves the notes region overrunning the canvas by exactly
 * COLUMN_RULER_HEIGHT, and the axis' lowest rows are drawn off the bottom edge where nothing shows
 * them. test/composerCanvasCss.test.ts tiles both views to hold the three functions together.
 */
export function composerCanvasElementHeight(
  notesHeight: number,
  timelineHeight: number,
  proView = false
): number {
  return (
    notesHeight + TIMELINE_BAND_PADDING * 2 + timelineHeight + (proView ? COLUMN_RULER_HEIGHT : 0)
  );
}

/**
 * WHICH END OF THE CANVAS THE STRIP IS AT, AND WHAT STANDS BETWEEN IT AND THE NOTES: the Compressed
 * View puts the mini-timeline BELOW the notes region (spec §6), the Pro View at the TOP with the
 * Column Ruler's own band under it (CONTEXT.md: Column Ruler; ruler spec §4), so the region there
 * starts below BOTH.
 *
 * THE SWAP USED TO BE THE WHOLE OF THE DIFFERENCE, and is not any more. While the two regions only
 * exchanged ends inside a constant sum, composerCanvasElementHeight could take no view at all; the
 * ruler is the first band that exists in one view and not the other, so that function gained a
 * `proView` too and this term appears in both. GIVE THEM THE SAME FLAG - see the note there for
 * what a disagreement costs (a notes region overrunning the canvas by COLUMN_RULER_HEIGHT, with the
 * axis' lowest rows drawn off the bottom edge).
 *
 * `composerTimelineStripY` is the strip's own top edge (one TIMELINE_BAND_PADDING inside its band),
 * which is both where ComposerRenderer puts `timelineStrip` and where ComposerCanvas.svelte pins
 * the DOM row of timeline buttons - the renderer reports it so those two cannot disagree. It needs
 * no ruler term in either view: the strip is ABOVE the ruler in the Pro View and below the notes in
 * the Compressed one, so nothing the ruler takes is between it and its own edge.
 */
export function composerNotesRegionY(proView: boolean, timelineHeight: number): number {
  return proView ? TIMELINE_BAND_PADDING * 2 + timelineHeight + COLUMN_RULER_HEIGHT : 0;
}

/** Where the mini-timeline strip is drawn - see composerNotesRegionY. */
export function composerTimelineStripY(proView: boolean, notesHeight: number): number {
  return TIMELINE_BAND_PADDING + (proView ? 0 : notesHeight);
}

/**
 * WHERE THE COLUMN RULER'S BAND STARTS on the canvas, in px: flush under the mini-timeline's whole
 * band, which in the Pro View is at the top. Its height is COLUMN_RULER_HEIGHT and the notes region
 * begins exactly where it ends, so this, composerTimelineStripY and composerNotesRegionY tile the
 * height composerCanvasElementHeight sums with no gap and no overlap - which is the property
 * test/composerCanvasCss.test.ts checks rather than the three numbers separately.
 *
 * PRO VIEW ONLY, AND IT TAKES NO `proView` TO SAY SO. The Compressed View has no ruler at all (spec
 * §2: its mini-timeline is at the BOTTOM, so "below the timeline" does not parse there, and a stage
 * tap in that view already selects the column), so there is no y for it to answer - a `proView`
 * parameter here could only ever return a number nothing may draw at, or a null every caller has to
 * unwrap. Its one production caller is inside ComposerRenderer's own `state.proView` branch, which
 * is the single boolean the whole band stands behind.
 */
export function composerColumnRulerY(timelineHeight: number): number {
  return TIMELINE_BAND_PADDING * 2 + timelineHeight;
}

/**
 * THE PRO VIEW'S NOTES REGION: everything the window has left once the composer's own chrome, the
 * mini-timeline's band and the Column Ruler's are taken off it (spec §6; ruler spec §4).
 *
 * Stated once here because composerCanvasSize and composerCanvasCssSize below are two renderings of
 * it - the CSS one adds the bands back and emits `max(bands + floor, 100vh - inset)`, which is this
 * function with `max` and `-` in the other order.
 *
 * THE RULER COMES OUT OF THE REGION AND NOT OUT OF THE CANVAS, which is why the canvas ELEMENT is
 * exactly as tall as it was before the ruler existed: this subtracts COLUMN_RULER_HEIGHT and
 * composerCanvasElementHeight adds it straight back, so the sum is still `100vh - inset` and the
 * window is still filled to the sliver.
 *
 * What moved is the SPLIT inside it, and that is where the band is actually paid for: the region is
 * 20px shorter, proViewGeometry.proRowHeight divides it by the same canonical frame it always did,
 * and every row comes out proportionally thinner - the -2.4% desktop / -5% landscape-phone bill
 * COLUMN_RULER_HEIGHT's own docblock quotes. No caller had to be told; the row height is a function
 * of this number and follows it.
 */
function proNotesRegionHeight(bodyHeight: number, timelineHeight: number): number {
  return Math.max(
    PRO_MIN_NOTES_HEIGHT_PX,
    bodyHeight * (PRO_CANVAS_HEIGHT_VH / 100) -
      PRO_CANVAS_INSET_PX -
      //BOTH bands, as one term, so the split between the regions is stated in one place - and with
      //`proView` hard-coded true because this function is the pro branch: there is no compressed
      //caller for the flag to come from
      composerCanvasElementHeight(0, timelineHeight, true)
  );
}

/**
 * The NOTES REGION's size, from the body's measured rect. Pure: the caller does the DOM read, which
 * is what keeps this module importable from a prerendered component.
 *
 * `rowHeightScale` defaults to this build's game constant (1 for genshin, 0.95 for sky) and is a
 * parameter only so that test/composerCanvasCss.test.ts can cross-check the CSS form against BOTH
 * shipped values from a single build. `timelineHeight` defaults to composerTimelineHeight() and is
 * a parameter for the same reason - it is only read on the pro branch, where the notes region is
 * what the strip's band leaves rather than a fraction of the window.
 *
 * THE WIDTH IS THE SAME IN BOTH VIEWS. Pro View changes the composer's vertical layout only: the
 * left play/roster column and the right CanvasTool column are untouched (spec §2), so every term of
 * the width above stands.
 */
export function composerCanvasSize(input: {
  bodyWidth: number;
  bodyHeight: number;
  inPreview: boolean;
  /** CONTEXT.md: Pro View. The canvas fills the window's leftover height instead of a 45vh card. */
  proView?: boolean;
  rowHeightScale?: number;
  timelineHeight?: number;
}): { width: number; height: number } {
  const scale = input.rowHeightScale ?? game.notes.composerRowHeightScale;
  //the desktop layout is the composer page's, not the theme preview's - see composerCanvasCssSize
  const fillsWindow = !input.inPreview && isComposerDesktopWidth(input.bodyWidth);
  //...and so is the Pro View: /theme's preview is a small box inside a scrolling page, where a
  //canvas sized to the WINDOW would overrun it entirely. The two gates are separate reads of the
  //same flag rather than one, because the preview's own shrink below applies to both views.
  const proView = Boolean(input.proView) && !input.inPreview;
  let width = nearestEven(
    fillsWindow
      ? input.bodyWidth - desktopToolColumnWidth(input.bodyWidth) - DESKTOP_CANVAS_INSET_PX
      : input.bodyWidth * (CANVAS_WIDTH_VW / 100) - CANVAS_WIDTH_INSET_PX
  );
  let height: number;
  if (proView) {
    //ONE rounding and no `scale`: the region is what the window leaves, so shrinking it by the
    //game's row-height factor would only open a gap under the canvas - and the Pro View's own row
    //height (proViewGeometry.proRowHeight) divides this region by the rows it is framing rather
    //than deriving a note size from the game's Song-Grid layout at all.
    height = nearestEven(
      proNotesRegionHeight(input.bodyHeight, input.timelineHeight ?? composerTimelineHeight())
    );
  } else {
    height = nearestEven(input.bodyHeight * (CANVAS_HEIGHT_VH / 100));
    height = nearestEven(height * scale);
  }
  if (input.inPreview) {
    const narrow = input.bodyWidth < PREVIEW_NARROW_BODY;
    width = nearestEven(width * (narrow ? PREVIEW_WIDTH_FACTOR_NARROW : PREVIEW_WIDTH_FACTOR_WIDE));
    height = nearestEven(
      height * (narrow ? PREVIEW_HEIGHT_FACTOR_NARROW : PREVIEW_HEIGHT_FACTOR_WIDE)
    );
  }
  return { width, height };
}

/**
 * THE SAME FORMULA AS CSS, for the placeholder `.canvas-wrapper` shows before the canvas exists.
 *
 * WHY THIS EXISTS: ComposerCanvas.svelte reaches the renderer through `await
 * import('./ComposerRenderer')` and then `await Application.init()`, so the canvas' real size is
 * hundreds of ms and ~338KB of lazy pixi chunks away from the first paint. Until it lands the
 * wrapper sized itself from App.css's `78vw` / `calc(45vh + 14px)` floors, which are NOT what the
 * canvas turns out to be - measured at +90.4px wide and +22.4px tall at 1920x1080 on genshin - and
 * the page jumped when it loaded. These two strings go on the wrapper as custom properties and
 * App.css maxes them against those floors.
 *
 * WHAT IT RESTS ON, both verified in src/lib/css/App.css:
 *  - `body` is `position: absolute; width: 100%; height: 100%; min-height: 100vh; margin: 0` with
 *    `box-sizing: border-box`. Its containing block is the initial containing block, `vh` is defined
 *    against the ICB as if scrollbars did not exist (so the ICB is never TALLER than 100vh), and
 *    `min-height: 100vh` floors it - so `document.body.getBoundingClientRect().height` is exactly
 *    `100vh`, and an overflowing child cannot grow an absolutely positioned box with a definite
 *    height. `vh` and not `dvh`/`svh` for that reason: on mobile the JS value is the UA's `lvh`
 *    under either URL-bar convention, and `dvh` would shrink the placeholder by the bar's 25-45px.
 *  - `...getBoundingClientRect().width` is the ICB width, which is `100vw` MINUS a classic root
 *    scrollbar. The composer route has none (`.composer-grid`'s height is driven by
 *    `.composer-left-control { height: calc(100vh - 5rem) }` and every other child of `.app` is out
 *    of flow), so `calc(85vw - 45px)` is exact there. If one ever appears the placeholder is too
 *    wide by 0.85 x its width: ~4.3px in Blink (App.css sets `::-webkit-scrollbar { width: 5px }`),
 *    ~12.8px in Firefox, 0 on mobile's overlay scrollbars.
 *
 * IT RETURNS BOTH WIDTHS AND LETS CSS CHOOSE, and that shape is load-bearing. These strings go on
 * the element as INLINE custom properties, which no media query can reach, so an earlier version
 * picked the breakpoint here from a `matchMedia` result and emitted one width. That was a real
 * layout shift, measured: the server-rendered HTML necessarily carried the mobile string (there is
 * no `matchMedia` in a prerender), and nothing corrected it until hydration ran - 812ms after first
 * paint in dev - so the composer opened 79px narrow and jumped. Emitting both and letting App.css's
 * own `@media` block bind `--composer-canvas-width` to one of them puts the breakpoint back where a
 * browser can evaluate it before any JS exists.
 *
 * The BODY-width branch in composerCanvasSize is the one that stays in JS, because the renderer has
 * a measured rect rather than a media query. A viewport width and a body width part company over a
 * classic root scrollbar; the composer route has none, so on that route they agree.
 *
 * WHAT IT DOES NOT REPRODUCE: nearestEven. CSS `round(nearest, x, 2px)` needs Chrome 125+/Firefox
 * 118+/Safari 15.4+, and on an unsupporting browser the whole declaration is invalid at
 * computed-value time and `min-width` falls back to its INITIAL value - worse than the <=1px (<=2px
 * on sky, which rounds twice) this costs.
 *
 * RETURNS NULL IN PREVIEW. `/theme`'s preview canvas branches on `bodyWidth < 900` while a media
 * query would test the viewport width INCLUDING the scrollbar, and that route genuinely scrolls, so
 * the two disagree over a scrollbar-wide band of viewport widths. `.canvas-wrapper-in-preview` unsets
 * both floors anyway, so the preview keeps its 0x0 placeholder - deliberately out of scope.
 */
export function composerCanvasCssSize(input: {
  inPreview: boolean;
  /**
   * CONTEXT.md: Pro View. Chooses the height expression, and nothing else - both widths are emitted
   * either way, because which of THEM applies is still a media query's decision and not this one.
   *
   * THE ONE THING THE PRO PLACEHOLDER CANNOT DO that the compressed one does: be right before the
   * settings exist. `proView` is a persisted composer SETTING, read from storage in Composer.svelte's
   * onMount, so the prerendered HTML and the first paint necessarily carry the Compressed View's
   * height and the page reflows once - together with `.composer-grid-pro` itself and with the
   * keyboard becoming a sheet - when the stored settings land. That is one reflow at hydration for
   * a user who has the setting on, not a jump when the CANVAS lands hundreds of ms later, which is
   * what this function is for and what it still prevents in both views.
   */
  proView?: boolean;
  rowHeightScale?: number;
  timelineHeight?: number;
}): { mobileWidth: string; desktopWidth: string; height: string } | null {
  if (input.inPreview) return null;
  const scale = input.rowHeightScale ?? game.notes.composerRowHeightScale;
  const timelineHeight = input.timelineHeight ?? composerTimelineHeight();
  //THE BANDS, as one literal - composerCanvasElementHeight's `notesHeight` is the `45vh * scale`
  //term below, and the `proView` here is what puts the Column Ruler's 20px into the literal in the
  //view that has one. This is the whole of what the placeholder has to be told about the ruler: get
  //it wrong and the wrapper is 20px short of the canvas that lands in it hundreds of ms later, which
  //is exactly the load-time jump this function exists to prevent (test/composerCanvasCss.test.ts).
  const band = composerCanvasElementHeight(0, timelineHeight, input.proView);
  return {
    mobileWidth: `calc(${CANVAS_WIDTH_VW}vw - ${CANVAS_WIDTH_INSET_PX}px)`,
    //`3.5rem` and not the 56px it comes to at ROOT_FONT_SIZE: this term IS `.tool`'s own
    //declaration restated, so the placeholder follows the column a browser actually lays out. The
    //fixed inset beside it cannot do the same - it is a sum of six declarations, printed rounded -
    //which is exactly the drift ROOT_FONT_SIZE above already states and accepts.
    desktopWidth: `calc(100vw - max(${DESKTOP_TOOL_COLUMN_VW}vw, ${DESKTOP_TOOL_COLUMN_MIN_REM}rem) - ${DESKTOP_CANVAS_INSET_PX}px)`,
    //THE PRO HEIGHT IS proNotesRegionHeight + band, with `max` and `-` swapped so the whole thing
    //is one CSS expression: `max(F, 100vh - I - B) + B` is `max(F + B, 100vh - I)`. The floor is
    //reproduced here (unlike nearestEven) because `max()` is supported everywhere `calc()` is.
    height: input.proView
      ? `max(${PRO_MIN_NOTES_HEIGHT_PX + band}px, calc(${PRO_CANVAS_HEIGHT_VH}vh - ${PRO_CANVAS_INSET_PX}px))`
      : `calc(${CANVAS_HEIGHT_VH}vh * ${scale} + ${band}px)`,
  };
}
