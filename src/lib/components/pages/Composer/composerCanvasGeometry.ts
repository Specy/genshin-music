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
/** `.timeline-button`'s `margin: 0.2rem` in src/lib/css/App.css. */
export const TIMELINE_BUTTON_MARGIN = 0.2 * ROOT_FONT_SIZE;

/**
 * WHERE THE MINI-TIMELINE STRIP STARTS on the canvas, in px.
 *
 * The canvas spans the whole card, but the two previous/next-breakpoint buttons float over its left
 * end, so the strip is drawn clear of them instead of underneath them. This is their two margin
 * boxes end to end: margin + button + margin + button + margin. There is ONE 0.2rem between the two
 * buttons and not two because the second carries `margin-left: 0` inline (ComposerCanvas.svelte).
 */
export const TIMELINE_INSET_LEFT = TIMELINE_BUTTON_MARGIN * 3 + TIMELINE_BUTTON_SIZE * 2;
/**
 * WHERE THE STRIP ENDS: the band the add/remove-breakpoint button stands on, which is 0.2rem of
 * clearance before it, the 2.2rem button, and its own trailing 0.2rem margin.
 *
 * NOT that button's margin box, though it is the same width. It carries `margin-left: auto` inline
 * (ComposerCanvas.svelte), and an auto margin absorbs the flex row's whole free space - so its
 * margin box actually runs from TIMELINE_INSET_LEFT to the row's right edge and its BORDER box is
 * `[W - 38.4, W - 3.2]`. The leading 0.2rem here is the gap that leaves between the strip's right
 * end and the button, which is the same clearance the two left buttons get from their own margins.
 */
export const TIMELINE_INSET_RIGHT = TIMELINE_BUTTON_MARGIN * 2 + TIMELINE_BUTTON_SIZE;

/**
 * The band of the app's own background colour above and below the mini-timeline strip, in px.
 *
 * It is `.timeline-wrapper-bg`'s `padding: 0.2rem 0` (src/lib/css/App.css before the timeline moved
 * into the notes canvas), which is why it is the same 0.2rem TIMELINE_BUTTON_MARGIN is: the buttons
 * are `height: 100%` of a row as tall as the strip with a 0.2rem margin, so their margin boxes
 * exactly fill this band top and bottom. NOTHING DRAWS IT: the Application clears to ThemeProvider's
 * `primary`, so the two rows come free from the clear. That is the same COLOUR `var(--primary)` gave
 * that div and not the same PIXELS - ThemeVars.svelte emits `--primary` with its alpha, while the
 * clear colour is `.rgb().rgbNumber()` with the alpha stripped and the whole canvas is then
 * composited at `max(primary.alpha, 0.8)` (ComposerRenderer.applyNotesCanvasOpacity). On the shipped
 * opaque themes the two are identical; on a translucent one - "Sky Music" at rgba(23,23,23,0.72) -
 * these rows come out at the canvas' 0.8 rather than at the theme's 0.72. ComposerCanvas.svelte puts
 * the `.timeline-controls` overlay at `top: height + timelinePadding` from the value this is
 * REPORTED as through onGeometryChange - an inline style on that div, not a declaration in App.css,
 * which carries only the overlay's flex layout - so the buttons and this constant cannot drift
 * apart.
 *
 * A pointer landing in either row reaches nothing: the strip's hitarea rejects it (local y outside
 * 0..timelineHeight) and the notes stage's rejects it (y > this.height). That is what pressing that
 * div's padding did before, and test/composerRenderer.test.ts has a row for it.
 */
export const TIMELINE_BAND_PADDING = 0.2 * ROOT_FONT_SIZE;

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
 * HTML carries the 30 and the first hydrated render carries the real value.
 */
export function composerTimelineHeight(): number {
  return isMobile() ? 25 : 30;
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
  let width = nearestEven(input.bodyWidth * (CANVAS_WIDTH_VW / 100) - CANVAS_WIDTH_INSET_PX);
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
}): { width: string; height: string } | null {
  if (input.inPreview) return null;
  const scale = input.rowHeightScale ?? game.notes.composerRowHeightScale;
  const timelineHeight = input.timelineHeight ?? composerTimelineHeight();
  //the band, as one literal - composerCanvasElementHeight's `notesHeight` is the `45vh * scale` term
  const band = composerCanvasElementHeight(0, timelineHeight);
  return {
    width: `calc(${CANVAS_WIDTH_VW}vw - ${CANVAS_WIDTH_INSET_PX}px)`,
    height: `calc(${CANVAS_HEIGHT_VH}vh * ${scale} + ${band}px)`,
  };
}
