// THE PRO VIEW'S AXIS, ITS ROWS AND ITS CAMERA, in one pixi-free, DOM-free module.
//
// The Compressed View folds a note onto its Song-Grid row (noteIds.gridRowForNumber); the PRO VIEW
// draws the absolute Note Number axis itself — one row per semitone over the whole span the game
// can address, every track's notes at their true numbers (CONTEXT.md: Pro View, Editable Zone,
// View Lock; ADR-0007 for the axis those numbers live on). This file is that second view function
// and nothing else: numbers and pixels in, numbers and pixels out.
//
// SAME DISCIPLINE AS composerCanvasGeometry.ts beside it — no pixi (ComposerRenderer is behind a
// dynamic import, so anything it shares with the Svelte component must load without it), no
// `document` (ComposerCanvas.svelte is prerendered), no DOM measurement (the caller measures and
// passes px in).
//
// ONE DELIBERATE DIFFERENCE: this pure arithmetic module reads NOTES_PER_COLUMN through the
// core-tier legacy adapter rather than `$game`, keeping it importable from plain vitest. Instrument
// table arithmetic and the all-instrument Addressable Span now live beside those tables in noteIds;
// this module imports only their answers.
//
// WHAT IS NOT HERE: anything about a song. The axis widens for a loaded song's outlier numbers, but
// the caller hands those in as a plain {min, max} (see spanOfNumbers) — no song class is imported,
// so the module stays a pure function of the game's config plus the caller's pixels.
import { NOTES_PER_COLUMN, type Pitch } from '$core/legacyConfig';
import {
  addressableSpan,
  basepointOffset,
  getSoundingTable,
  widestInstrumentSpan,
  type RuntimeInstrumentName,
} from '$core/Songs/noteIds';

/**
 * THE VISUAL PADDING AT BOTH ENDS OF THE AXIS, in rows (spec §4).
 *
 * Three semitones of empty axis above the highest addressable number and below the lowest, so the
 * outermost real rows are never flush against the viewport's edge and an instrument whose Editable
 * Zone reaches an end of the span still gets its zone line drawn with context outside it. Purely
 * cosmetic: nothing is ever placed there, and no note can land there (a padded row is outside every
 * instrument's reach at every Basepoint by construction).
 */
export const AXIS_PADDING_ROWS = 3;

/**
 * THE FRAMING ROWS THE NOTES REGION IS TALLER THAN WHAT IT IS FRAMING, in rows (spec §4, as revised
 * 2026-08-21): one empty row above and one below, so nothing the region frames is ever drawn flush
 * against its edge.
 *
 * It is the `+ 2` of BOTH terms of proRowHeight below — the canonical frame's fit and the cap the
 * game's base layout puts on it — because it means the same thing in each: the frame is the band
 * plus a row of air at each end.
 */
export const ROW_HEIGHT_FRAMING_ROWS = 2;

/**
 * THE VERTICAL ZOOM'S RANGE (spec §7, user revision 2026-08-22): what a pinch or a ctrl+wheel may
 * multiply the FITTED row height by, at its two ends.
 *
 * The zoom is a multiplier on the fit rather than a row height of its own, so the game's canonical
 * frame stays the anchor at 1x and a zoom means the same thing on every layer (see proRowHeight).
 * The bounds are chosen against what the fit already is on both shipped games:
 *  - 0.5x, the floor, is "twice as much axis as the canonical frame" — on genshin (a 36-row frame
 *    over a ~900px region, ~24px a row) that is a 12px row, still a legible note, and more rows
 *    than the game's whole axis holds; sky's axis — C1 to past C7 since the octave registers — is
 *    longer than even that, and simply keeps travel to pan through.
 *  - 3x is where a row is about a keyboard key's own height (~70px) and one octave fills the
 *    window — past that the view stops being a score and becomes a magnifier, and the horizontal
 *    axis (which does not zoom) is unchanged under it.
 * Neither end is a hard limit of anything: they are the range in which this still reads as the
 * same view, and they are stated as one PAIR so the two are chosen together.
 */
export const PRO_ZOOM_MIN = 0.5;
/** ...and the ceiling — see PRO_ZOOM_MIN, which is chosen with it. */
export const PRO_ZOOM_MAX = 3;

/**
 * THE FLOOR UNDER A ZOOMED ROW, in px: a row a zoom-out may not take below.
 *
 * PRO_ZOOM_MIN alone bounds the multiplier and not the result, and the result is what has to stay
 * drawable: on a short window (a 420px landscape phone framing a 36-row instrument, ~11px a row)
 * half of the fit is a 5px row, and on the degenerate region composerCanvasGeometry floors at 2px it
 * would be a fraction of a pixel — a row nothing can be seen in, hit-tested at, or labelled on. Two
 * pixels is the same floor that module puts under the whole region, for the same reason.
 *
 * It never INFLATES a row: where the fit itself is already below this (a region measured before
 * layout), zooming out simply stops moving instead of making rows taller than the fit — see
 * proRowHeight.
 */
export const PRO_MIN_ROW_HEIGHT_PX = 2;

/**
 * A zoom multiplier held inside the range above — the one place the two ends are applied, so
 * "clamped" means the same thing to the wheel, to the pinch and to the renderer's own state.
 *
 * A non-finite input answers 1 (no zoom) rather than propagating NaN into every row on the axis:
 * the callers are a wheel delta and a ratio of two touch distances, and both can be handed a zero
 * or a NaN by hardware.
 */
export function clampProZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(PRO_ZOOM_MAX, Math.max(PRO_ZOOM_MIN, zoom));
}

/**
 * HOW MUCH OF THE PRO VIEW'S NOTES REGION THE ROW-LABEL STRIP TAKES, as a fraction of one row's
 * height, and the px bounds it is held between.
 *
 * Stated against the ROW rather than as a flat px width because the row height is what the canvas'
 * own height decides (proRowHeight): a strip sized for a 44px row on a 1080p window would swallow a
 * quarter of a short one. The bounds are what keeps "C♯4" legible at the bottom end and the strip
 * from eating the first column at the top.
 */
const PRO_STRIP_WIDTH_ROWS = 0.95;
const PRO_STRIP_MIN_WIDTH = 22;
const PRO_STRIP_MAX_WIDTH = 46;

/**
 * THE ROW-LABEL STRIP'S WIDTH IN PX — one statement, read by three surfaces that must agree about it:
 * the renderer that DRAWS the strip, the tap dispatch that treats a press on it as inert (spec §7),
 * and ComposerCanvas.svelte, which insets the left side chevron so the button does not stand on top
 * of the labels (the chevron is a DOM element over the canvas, so nothing else would hold the two
 * apart).
 */
export function proStripWidth(rowHeight: number): number {
  return Math.min(
    PRO_STRIP_MAX_WIDTH,
    Math.max(PRO_STRIP_MIN_WIDTH, rowHeight * PRO_STRIP_WIDTH_ROWS)
  );
}

/** A closed range of Note Numbers, ends included. Used for the addressable span, a song's outliers and an Editable Zone alike. */
export type NumberSpan = { min: number; max: number };

/**
 * The Pro View's row axis: every Note Number from `min` to `max` has exactly one row, `max` on top
 * (row 0) and pitch rising upward. `rowCount` is carried rather than recomputed at each call site
 * because the camera clamp needs it on every frame.
 */
export type ProViewAxis = NumberSpan & { rowCount: number };

/**
 * The band of Note Numbers one track can voice at its effective Basepoint (CONTEXT.md: Editable
 * Zone), a property of (instrument, Basepoint) and never of the song's content.
 *
 * `min`/`max` are the two zone lines. `numbers` is the ADDABLE subset between them, which is not
 * the whole band: an instrument that skips a semitone has rows inside its own zone that map to no
 * button, and those rows belong to the zone (dimmed with it, framed with it) while accepting no
 * notes — ask `isAddable`, never `min <= n && n <= max`.
 */
export type EditableZone = NumberSpan & { numbers: ReadonlySet<number> };

/**
 * The min/max of the Note Numbers a caller walked out of the loaded song, or null when it holds
 * none — the shape `proViewAxis` widens itself by.
 *
 * Here so that the walk has one spelling, and takes an ITERABLE so the caller can stream a song's
 * columns through it without building an array. Non-finite entries are skipped rather than
 * poisoning the axis: a corrupt file must not be able to turn every row into NaN.
 */
export function spanOfNumbers(numbers: Iterable<number>): NumberSpan | null {
  let min = Infinity;
  let max = -Infinity;
  for (const number of numbers) {
    if (!Number.isFinite(number)) continue;
    if (number < min) min = number;
    if (number > max) max = number;
  }
  return Number.isFinite(min) ? { min, max } : null;
}

/**
 * THE AXIS THE PRO VIEW DRAWS: the addressable span, widened by any outlier the loaded song holds,
 * then padded at both ends (spec §4).
 *
 * Nothing is ever off-axis, clamped or hidden — a stranded note a semitone below every instrument's
 * reach still gets a row, which is what makes the canvas the place such a note can be seen and
 * deleted. The song half is a parameter and not a lookup, so the axis is recomputed exactly when
 * the caller says the song's numbers changed (load, and structure edits); an axis that SHRINKS back
 * when the last outlier is deleted is accepted, since it can only ever move for a file that was
 * already weird.
 *
 * Ends are floored/ceiled so the axis is whole-semitone aligned even if a file carries a fractional
 * number: every row index below is `max − n`, and a fractional `max` would put every row — not just
 * the odd note's — off its pixel.
 */
export function proViewAxis(songSpan?: NumberSpan | null): ProViewAxis {
  const span = addressableSpan();
  const min = Math.floor(Math.min(span.min, songSpan?.min ?? Infinity)) - AXIS_PADDING_ROWS;
  const max = Math.ceil(Math.max(span.max, songSpan?.max ?? -Infinity)) + AXIS_PADDING_ROWS;
  return { min, max, rowCount: max - min + 1 };
}

/** The row a Note Number draws on: row 0 is the axis' TOP (its highest number) and pitch rises upward. */
export function rowForNumber(axis: ProViewAxis, number: number): number {
  return axis.max - number;
}

/** `rowForNumber`'s inverse — the Note Number a row stands for. The two are the same reflection, so either way round is exact. */
export function numberForRow(axis: ProViewAxis, row: number): number {
  return axis.max - row;
}

/**
 * ONE ROW'S HEIGHT IN PX: THE GAME'S CANONICAL FRAME FITS, CAPPED AT THE GAME'S OWN NOTE SIZE
 * (spec §4, user revision 2026-08-27).
 *
 *     rowHeight = min(H / (canonicalRows + 2), H / (perColumn + 2))
 *
 * `canonicalRows` is the WIDEST Editable Zone any instrument in the game has —
 * noteIds.widestInstrumentSpan(), a build-time game constant — so the row height is a property of
 * the GAME and the region, never of the current layer.
 *
 * TWO REVISIONS STAND BEHIND THE FIRST TERM, and this one keeps what both were for:
 *  - 2026-08-21 replaced "the cap alone" because the Pro View draws a row per SEMITONE while
 *    `perColumn` counts BUTTONS: genshin's Lyre spans 36 semitones with its 21 buttons, so a region
 *    sized for 21 + 2 rows showed two thirds of it and the locked frame — whose whole promise is
 *    "this is what this layer can play" — cut the instrument in half. That revision fitted the
 *    CURRENT layer's zone.
 *  - 2026-08-27 replaced the per-layer fit with the canonical one, because a fit that moved with
 *    the layer re-scaled the whole canvas on an instrument swap — sky's 25-row harp to its 13-row
 *    drum stretched every row 1.6x, a layout shift that read as the song jumping. Fitting the
 *    widest zone ONCE keeps the 2026-08-21 promise for free (no zone is wider than the widest, so
 *    every instrument still fits its locked frame whole) while a swap moves only the CAMERA: a
 *    narrow instrument stands in more air at the same scale instead of ballooning to a different
 *    one.
 *
 * The second term is a CAP and not an alternative, and it is nearly always dormant now: a game's
 * widest zone spans at least its buttons, so the fit term wins wherever a real registry is behind
 * it. It still guards the degenerate inputs (a corrupt registry's fallback span, a test's tiny
 * canonical count) with the same meaning it always had — a row is never bigger than the note size
 * the game's base layout gives it.
 *
 * ...AND THE USER'S OWN ZOOM MULTIPLIES ALL OF THAT (spec §7, user revision 2026-08-22):
 *
 *     effectiveRowHeight = fittedRowHeight × zoom
 *
 * One multiplication and no second formula, which is the whole point of stating it here: the fit
 * above is the anchor every layer shares (a layer switch moves NOTHING under the multiplier now),
 * the lock is still the state that owns the frame (re-locking resets the multiplier to 1 and this
 * returns the fit exactly), and every surface sized by a row — the textures, the strip's width and
 * labels, the tap resolution, the camera's own clamps — follows by asking this one function.
 * `zoom` is ephemeral renderer state, never a setting and never in a song.
 *
 * THE RESULT IS FLOORED and the multiplier is clamped, and they are two different guards: clamping
 * keeps the gesture inside the range the view still reads in (clampProZoom), while the floor keeps a
 * row DRAWABLE on a window where even the fit is thin (PRO_MIN_ROW_HEIGHT_PX). The floor is stated
 * against the fit — `min(fitted, PRO_MIN_ROW_HEIGHT_PX)` — so it can only ever stop a zoom-out and
 * never inflate a row above what the region fits.
 *
 * `canonicalRowCount` defaults to the game's own constant and is a parameter only so a test can
 * check the arithmetic against both shipped layouts from one build — the same reason `perColumn` is
 * one, and composerCanvasSize takes `rowHeightScale`. A non-positive value answers the cap alone.
 */
export function proRowHeight(input: {
  notesRegionHeight: number;
  /** Test override of the game's canonical frame — noteIds.widestInstrumentSpan() by default. */
  canonicalRowCount?: number;
  perColumn?: number;
  /** The user's ephemeral vertical zoom, 1 (the fit) unless a pinch or a ctrl+wheel moved it. */
  zoom?: number;
}): number {
  const perColumn = input.perColumn ?? NOTES_PER_COLUMN;
  const capped = input.notesRegionHeight / (perColumn + ROW_HEIGHT_FRAMING_ROWS);
  const rows = input.canonicalRowCount ?? widestInstrumentSpan();
  const fitted =
    rows > 0
      ? Math.min(input.notesRegionHeight / (rows + ROW_HEIGHT_FRAMING_ROWS), capped)
      : capped;
  const zoom = clampProZoom(input.zoom ?? 1);
  if (zoom === 1) return fitted;
  return Math.max(Math.min(fitted, PRO_MIN_ROW_HEIGHT_PX), fitted * zoom);
}

/**
 * HOW MANY ROWS A SPAN OCCUPIES, ends included — the one place the off-by-one lives (the same
 * arithmetic noteIds.widestInstrumentSpan reduces the registry with for proRowHeight's frame).
 *
 * A zone from 48 to 83 is 36 rows and not 35: `min` and `max` are both real rows with a note on
 * them, and a frame a row short would cut the top of the instrument off.
 */
export function zoneRowCount(span: NumberSpan): number {
  return span.max - span.min + 1;
}

/** Where a Note Number's row sits on screen: its row's top edge, in the notes region's own coordinates. */
export function yForNumber(input: {
  axis: ProViewAxis;
  number: number;
  rowHeight: number;
  cameraY: number;
}): number {
  return rowForNumber(input.axis, input.number) * input.rowHeight - input.cameraY;
}

/**
 * THE ROWS THE CAMERA WINDOW SHOWS, first and last INCLUSIVE — the Pro View's vertical counterpart
 * of ComposerRenderer.visibleColumnRange, and stated the same way: the closed form of the overlap
 * test "row r occupies `[r*rowHeight, (r+1)*rowHeight)` and the window occupies
 * `[cameraY - topBleed, cameraY + notesRegionHeight)`". `topBleed` defaults to zero; the renderer
 * gives it the translucent Column Ruler's height so row-level content is not culled while it is
 * still visible behind that band.
 *
 * STRICT ON BOTH SIDES, so a row touching an edge exactly is outside — the same measure-zero choice
 * visibleColumnRange makes, and made the same way so the two read alike. Clamped to the axis, so a
 * camera at either end reports only rows that exist; `last < first` means the window shows no row at
 * all, which a zero/negative row height (a region measured before layout) also produces.
 *
 * WHAT READS IT: the row-label strip (one pooled Text per visible row) and the moving row bands
 * inside each painted column. Both are recomputed when the camera moves, which is why this is a
 * closed form rather than a scan over the axis' rows.
 */
export function visibleRowRange(input: {
  axis: ProViewAxis;
  rowHeight: number;
  cameraY: number;
  notesRegionHeight: number;
  topBleed?: number;
}): { first: number; last: number } {
  if (!(input.rowHeight > 0)) return { first: 0, last: -1 };
  const topBleed = Math.max(0, Number.isFinite(input.topBleed) ? (input.topBleed ?? 0) : 0);
  const first = Math.max(0, Math.floor((input.cameraY - topBleed) / input.rowHeight - 1) + 1);
  const last = Math.min(
    input.axis.rowCount - 1,
    Math.ceil((input.cameraY + input.notesRegionHeight) / input.rowHeight) - 1
  );
  return { first, last };
}

/**
 * THE CAMERA'S TRAVEL: 0 (axis top flush with the region's top) to the offset that puts the axis'
 * bottom row flush with the region's bottom.
 *
 * DEGENERATE CASE: the region shows exactly what proRowHeight sized it to — the current layer's zone
 * plus two framing rows, or `perColumn + 2` where the cap bites — while both shipped games' axes are
 * twice either of those or more, so there is normally travel to clamp. An
 * axis SHORTER than the region — a game with one narrow instrument, or any caller measuring a taller
 * region than the axis is long — would give a negative upper bound, so the travel collapses to 0 and
 * the axis is pinned to the region's top rather than allowed to drift up out of view.
 */
export function maxCameraY(input: {
  axis: ProViewAxis;
  rowHeight: number;
  notesRegionHeight: number;
}): number {
  return Math.max(0, input.axis.rowCount * input.rowHeight - input.notesRegionHeight);
}

/** A camera offset held inside `maxCameraY`'s travel — what the unlocked View Lock pans within, and the last step of every locked framing. */
export function clampCameraY(input: {
  axis: ProViewAxis;
  rowHeight: number;
  notesRegionHeight: number;
  cameraY: number;
}): number {
  return Math.min(Math.max(input.cameraY, 0), maxCameraY(input));
}

/**
 * THE CAMERA A ZOOM LEAVES BEHIND: the offset that keeps the axis position under the gesture's
 * FOCAL POINT at the same screen y while the rows change size (spec §7, user revision 2026-08-22).
 *
 * A zoom that ignored its focal point would magnify about the region's top edge, and the row the
 * user is pinching — the note they are looking at — would slide away under their own fingers. So
 * the axis distance the focal point stands at, `cameraY + focalY`, is rescaled by the row heights'
 * ratio and the focal offset taken back off:
 *
 *     cameraY' = (cameraY + focalY) × (nextRowHeight / rowHeight) − focalY
 *
 * `focalY` is in the NOTES REGION's own coordinates (0 at its top edge), the same space `numberAtY`
 * and `yForNumber` use — the caller converts a canvas or a page y into it, exactly as the tap
 * resolution does.
 *
 * CLAMPED THROUGH THE ORDINARY TRAVEL, which is what makes the degenerate cases fall out rather
 * than needing their own branch: zoomed far enough out the axis becomes SHORTER than the region,
 * `maxCameraY` collapses to 0, and the axis is pinned to the region's top instead of drifting — the
 * same answer an unlocked pan gets there. A zero/negative row height (a region measured before
 * layout) has no ratio to rescale by, so the camera is only re-clamped.
 */
export function zoomedCameraY(input: {
  axis: ProViewAxis;
  notesRegionHeight: number;
  cameraY: number;
  /** where the gesture is, in the notes region's own coordinates */
  focalY: number;
  /** the row height the current cameraY was measured in */
  rowHeight: number;
  /** ...and the one it is being restated in */
  nextRowHeight: number;
}): number {
  const clampInput = {
    axis: input.axis,
    rowHeight: input.nextRowHeight,
    notesRegionHeight: input.notesRegionHeight,
  };
  if (!(input.rowHeight > 0) || !Number.isFinite(input.focalY)) {
    return clampCameraY({ ...clampInput, cameraY: input.cameraY });
  }
  const ratio = input.nextRowHeight / input.rowHeight;
  return clampCameraY({
    ...clampInput,
    cameraY: (input.cameraY + input.focalY) * ratio - input.focalY,
  });
}

/**
 * THE LOCKED FRAMING (spec §4): the camera that centres the current track's Editable Zone in the
 * notes region.
 *
 * The zone occupies the rows from `row(zone.max)` (its top row) through `row(zone.min)` (its
 * bottom), so its pixel band runs from `row(zone.max) * rowHeight` to `(row(zone.min) + 1) *
 * rowHeight` — the `+ 1` is the bottom row's own height, and dropping it would frame the zone half
 * a row too high. Centring that band and clamping gives a zone near an axis end the best framing
 * the axis allows instead of scrolling past it.
 */
export function lockedCameraY(input: {
  axis: ProViewAxis;
  zone: NumberSpan;
  rowHeight: number;
  notesRegionHeight: number;
}): number {
  const center =
    ((rowForNumber(input.axis, input.zone.max) + rowForNumber(input.axis, input.zone.min) + 1) /
      2) *
    input.rowHeight;
  return clampCameraY({ ...input, cameraY: center - input.notesRegionHeight / 2 });
}

/**
 * WHICH SIDE OF THE CAMERA WINDOW THE EDITABLE ZONE IS ON when the window shows NONE of it, or null
 * while any of the band is on screen (spec §6, user addition 2026-08-27) — what the renderer's edge
 * arrow points at. The zone is one contiguous band, so at most one side is ever the answer.
 *
 * THE QUESTION IS "WHERE IS MY INSTRUMENT": an unlocked pan (or an instrument swap under one — the
 * camera holds still since the same day's revision) can leave the frame on a stretch of axis the
 * current layer cannot reach at all, and nothing else on screen says which way its zone went. Any
 * PART of the band visible answers null — a zone line on screen is its own signpost.
 *
 * The band's pixels are drawProZone's own: from the top of `zone.max`'s row to the BOTTOM edge of
 * `zone.min`'s (the `+ 1`), so the arrow and the zone's drawing cannot disagree about where the
 * band ends. Strict at both edges the way visibleColumnRange is: a band exactly flush with an edge
 * shows zero pixels and counts as offscreen. A degenerate row height or region (unmeasured layout)
 * answers null — an arrow on a region that shows nothing points at nothing.
 */
export function offscreenZoneDirection(input: {
  axis: ProViewAxis;
  zone: NumberSpan;
  rowHeight: number;
  cameraY: number;
  notesRegionHeight: number;
}): 'above' | 'below' | null {
  if (!(input.rowHeight > 0) || !(input.notesRegionHeight > 0)) return null;
  const top = rowForNumber(input.axis, input.zone.max) * input.rowHeight - input.cameraY;
  const bottom = (rowForNumber(input.axis, input.zone.min) + 1) * input.rowHeight - input.cameraY;
  if (bottom <= 0) return 'above';
  if (top >= input.notesRegionHeight) return 'below';
  return null;
}

// Editable Zones memoized per (instrument, Basepoint), exactly like noteIds' gridRowCache and for
// the same reason it is never invalidated: both halves of the key are IN the key, and everything
// the answer derives from below them (the instrument's sounding table) is a build-time constant of
// the selected game. Identity is stable per key too, which is what lets the renderer compare "same
// zone as last frame?" by reference instead of by contents. A plain Map and not an SvelteMap
// (noteIds' caches carry an eslint-disable for exactly this): nothing here is UI state to react to.
const zoneCache = new Map<string, EditableZone>();

/**
 * THE EDITABLE ZONE of one instrument at one Basepoint (spec §4): the instrument's sounding table
 * shifted by the Basepoint's offset.
 *
 * Callers pass the EFFECTIVE Basepoint — `effectiveTrackPitch(instrument, songPitch)` from noteIds,
 * so a per-track override moves the zone the same way the song-level one does. The numbers are the
 * exact set `numberToButton` answers a button for, since both are the same shift of the same table;
 * they are built here as a set rather than probed one at a time because the renderer asks about
 * every visible row on every camera move.
 *
 * An unknown instrument name falls back to the default instrument's table, inherited from
 * `getSoundingTable` (the legacy `new Instrument(name)` guard) rather than restated.
 */
export function editableZone(instrumentName: RuntimeInstrumentName, pitch: Pitch): EditableZone {
  const key = `${instrumentName} ${pitch}`;
  const cached = zoneCache.get(key);
  if (cached) return cached;
  const offset = basepointOffset(pitch);
  const numbers = new Set<number>();
  let min = Infinity;
  let max = -Infinity;
  for (const sounding of getSoundingTable(instrumentName)) {
    const number = sounding + offset;
    numbers.add(number);
    if (number < min) min = number;
    if (number > max) max = number;
  }
  //an instrument with no buttons is registry-impossible; an empty zone is stated as the empty
  //span rather than as ±Infinity so a caller's clamp arithmetic stays finite
  const zone: EditableZone = Number.isFinite(min)
    ? { min, max, numbers }
    : { min: offset, max: offset, numbers };
  zoneCache.set(key, zone);
  return zone;
}

/**
 * Whether a Note Number can be ADDED on this zone's track — a button voices it at that Basepoint.
 *
 * Deliberately not `zone.min <= n && n <= zone.max`: rows inside the band that map to no button
 * belong to the zone (they are framed and lit with it) but are inert, and they are exactly the rows
 * the Pro View stripes.
 */
export function isAddable(zone: EditableZone, number: number): boolean {
  return zone.numbers.has(number);
}

/**
 * TAP RESOLUTION: the Note Number under a y inside the notes region, or null when that y falls off
 * the axis entirely.
 *
 * Paired with `numberToButton` this is the whole of the Pro View's vertical hit test — the column
 * comes from the existing horizontal machinery, and the two together are what the tap dispatch
 * acts on.
 *
 * NULL RATHER THAN A NUMERIC SENTINEL, unlike the -1 that noteIds' button lookups return: every
 * integer is a legal Note Number on this axis, negative ones included (a Basepoint-rewritten strand
 * in an already-weird file), so no number is free to mean "no row". Padding rows DO resolve — they
 * are rows of the axis — and answer inert, since no instrument reaches them at any Basepoint.
 *
 * A rowHeight of 0 (a region measured before layout) resolves to null rather than dividing by zero.
 */
export function numberAtY(input: {
  axis: ProViewAxis;
  y: number;
  cameraY: number;
  rowHeight: number;
}): number | null {
  if (!(input.rowHeight > 0) || !Number.isFinite(input.y) || !Number.isFinite(input.cameraY)) {
    return null;
  }
  const row = Math.floor((input.y + input.cameraY) / input.rowHeight);
  if (row < 0 || row >= input.axis.rowCount) return null;
  return numberForRow(input.axis, row);
}
