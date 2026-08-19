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
 * ...and the ONE non-fixed thing, `.tool`'s `width: 4vw`, is the vw term: the canvas gets what is
 * left of the viewport, `100vw - 4vw`.
 *
 * test/composerCanvasCss.test.ts reads all six declarations out of the stylesheet, so this list
 * cannot drift away from what the browser actually lays out.
 */
const DESKTOP_TOOL_COLUMN_VW = 4;
const DESKTOP_CANVAS_WIDTH_VW = 100 - DESKTOP_TOOL_COLUMN_VW;
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
 * THE CANVAS ELEMENT'S HEIGHT: the notes region, then the band the mini-timeline sits in. The one
 * statement of that sum - ComposerRenderer.canvasHeight() and composerCanvasCssSize below are both
 * this, so the placeholder and the canvas cannot disagree about the band.
 */
export function composerCanvasElementHeight(notesHeight: number, timelineHeight: number): number {
  return notesHeight + TIMELINE_BAND_PADDING * 2 + timelineHeight;
}

/**
 * The NOTES REGION's size, from the body's measured rect. Pure: the caller does the DOM read, which
 * is what keeps this module importable from a prerendered component.
 *
 * `rowHeightScale` defaults to this build's game constant (1 for genshin, 0.95 for sky) and is a
 * parameter only so that test/composerCanvasCss.test.ts can cross-check the CSS form against BOTH
 * shipped values from a single build.
 */
export function composerCanvasSize(input: {
  bodyWidth: number;
  bodyHeight: number;
  inPreview: boolean;
  rowHeightScale?: number;
}): { width: number; height: number } {
  const scale = input.rowHeightScale ?? game.notes.composerRowHeightScale;
  //the desktop layout is the composer page's, not the theme preview's - see composerCanvasCssSize
  const fillsWindow = !input.inPreview && isComposerDesktopWidth(input.bodyWidth);
  let width = nearestEven(
    fillsWindow
      ? input.bodyWidth * (DESKTOP_CANVAS_WIDTH_VW / 100) - DESKTOP_CANVAS_INSET_PX
      : input.bodyWidth * (CANVAS_WIDTH_VW / 100) - CANVAS_WIDTH_INSET_PX
  );
  let height = nearestEven(input.bodyHeight * (CANVAS_HEIGHT_VH / 100));
  height = nearestEven(height * scale);
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
  rowHeightScale?: number;
  timelineHeight?: number;
}): { mobileWidth: string; desktopWidth: string; height: string } | null {
  if (input.inPreview) return null;
  const scale = input.rowHeightScale ?? game.notes.composerRowHeightScale;
  const timelineHeight = input.timelineHeight ?? composerTimelineHeight();
  //the band, as one literal - composerCanvasElementHeight's `notesHeight` is the `45vh * scale` term
  const band = composerCanvasElementHeight(0, timelineHeight);
  return {
    mobileWidth: `calc(${CANVAS_WIDTH_VW}vw - ${CANVAS_WIDTH_INSET_PX}px)`,
    desktopWidth: `calc(${DESKTOP_CANVAS_WIDTH_VW}vw - ${DESKTOP_CANVAS_INSET_PX}px)`,
    height: `calc(${CANVAS_HEIGHT_VH}vh * ${scale} + ${band}px)`,
  };
}
