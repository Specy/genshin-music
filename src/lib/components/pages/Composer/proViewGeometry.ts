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
// ONE DELIBERATE DIFFERENCE, and it is a stated exception rather than an oversight: legacyConfig's
// UI-TIER IMPORT RULE sends UI code to `$game` for GAME-DATA constants, and composerCanvasGeometry
// duly reads `game.notes.composerRowHeightScale` that way — this file instead reads its game data
// through the core-tier `$core/legacyConfig` adapter, exactly as $core/Songs/noteIds does. The file
// lives in the Composer folder for locality, but every line of it is arithmetic over the instrument
// tables noteIds owns (it calls straight into `getSoundingTable`/`basepointOffset`), and a second
// import path for those same tables would be a second thing to keep in step for zero behavioral
// difference — `INSTRUMENTS_DATA`/`NOTES_PER_COLUMN` ARE `game.instruments.data`/`game.notes
// .perColumn`, aliased. Same reasoning as the adapter's audio/provider-tier carve-out, and it is
// what keeps the module importable from plain vitest with no SvelteKit graph.
//
// WHAT IS NOT HERE: anything about a song. The axis widens for a loaded song's outlier numbers, but
// the caller hands those in as a plain {min, max} (see spanOfNumbers) — no song class is imported,
// so the module stays a pure function of the game's config plus the caller's pixels.
import { INSTRUMENTS_DATA, NOTES_PER_COLUMN, PITCHES, type Pitch } from '$core/legacyConfig';
import { basepointOffset, getSoundingTable, type RuntimeInstrumentName } from '$core/Songs/noteIds';

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
 * THE HIGHEST A BASEPOINT CAN LIFT A BUTTON, in semitones.
 *
 * Basepoints are the PITCHES list and `basepointOffset` is an index into it, so the shift is always
 * UPWARD and never exceeds the list's last index — 11 today, C through B. Derived from PITCHES
 * rather than written as 11 so that a game which ever authored a different Basepoint list cannot
 * silently lose the rows its top Basepoints reach.
 */
const MAX_BASEPOINT_OFFSET = PITCHES.length - 1;

/**
 * THE FRAMING ROWS THE NOTES REGION IS TALLER THAN THE GAME'S OWN LAYOUT, in rows (spec §4:
 * `rowHeight = notesRegionHeight / (perColumn + 2)`).
 *
 * The Pro View keeps the game's base note size instead of inventing one: a column's `perColumn`
 * rows (21 genshin / 15 sky) still fill the region, and the two extra rows are the framing the
 * region gains so a locked Editable Zone is never drawn edge-to-edge. Because the divisor is fixed,
 * so is the row height — there is no vertical zoom, and a note is the same size in every layer.
 */
export const ROW_HEIGHT_FRAMING_ROWS = 2;

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

// The game's addressable span, computed once: every instrument table it reads is a build-time
// constant of the selected game (noteIds caches them for the same reason), so the scan over the
// whole roster — 35 instruments on sky — happens on the first Pro View paint and never again.
let addressable: NumberSpan | null = null;

/**
 * THE SPAN THE GAME CAN ADDRESS AT ALL: `lo` = the lowest Sounding Pitch any instrument has at
 * Basepoint C, `hi` = the highest, lifted by the highest Basepoint (spec §4).
 *
 * Every note any button of any instrument can enter, at any Basepoint, lies inside it — Basepoints
 * only ever shift upward, so the bottom needs no headroom and the top needs exactly
 * MAX_BASEPOINT_OFFSET. Assigned Buttons (percussion, SFX, Ukulele's chord row) need no special
 * case: their sounding-table entry is their own Nominal Id, so they are already in the tables this
 * scans.
 *
 * Over INSTRUMENTS_DATA and not INSTRUMENTS: the data map is every instrument FOLDER, Unlisted
 * Instruments included, and an Unlisted Instrument is fully loadable by a song even though no menu
 * offers it. The two lists are identical in both shipped games today, so this is a no-op now and a
 * missing row later.
 */
export function addressableSpan(): NumberSpan {
  if (addressable) return addressable;
  let min = Infinity;
  let max = -Infinity;
  for (const name of Object.keys(INSTRUMENTS_DATA)) {
    for (const sounding of getSoundingTable(name)) {
      if (sounding < min) min = sounding;
      if (sounding > max) max = sounding;
    }
  }
  //the registry rejects a game with no instruments and an instrument with no notes, so this is
  //unreachable — but a non-finite span would poison rowCount and every clamp derived from it with
  //NaN, which fails far worse and far later than an empty axis does
  addressable = Number.isFinite(min)
    ? { min, max: max + MAX_BASEPOINT_OFFSET }
    : { min: 0, max: MAX_BASEPOINT_OFFSET };
  return addressable;
}

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
 * ONE ROW'S HEIGHT IN PX, and the Pro View has no other (spec §4: no vertical zoom).
 *
 * `perColumn` defaults to this build's game constant and is a parameter only so a test can check
 * both shipped layouts from one build — the same reason composerCanvasSize takes `rowHeightScale`.
 */
export function proRowHeight(
  notesRegionHeight: number,
  perColumn: number = NOTES_PER_COLUMN
): number {
  return notesRegionHeight / (perColumn + ROW_HEIGHT_FRAMING_ROWS);
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
 * THE CAMERA'S TRAVEL: 0 (axis top flush with the region's top) to the offset that puts the axis'
 * bottom row flush with the region's bottom.
 *
 * DEGENERATE CASE: the region shows exactly `perColumn + 2` rows (that IS the row height's divisor)
 * while both shipped games' axes are twice that or more, so there is normally travel to clamp. An
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
