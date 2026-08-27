// THE COLUMN RULER'S LABEL LADDER, in one pixi-free, DOM-free, SONG-free module.
//
// The Column Ruler (CONTEXT.md: Column Ruler, Ruler Scrub) is the ~20px band across the top of the
// Pro View canvas, between the mini-timeline and the notes region: one pressable position per
// column, marked at intervals with the timestamp its column begins at. composerCanvasGeometry owns
// the BAND (COLUMN_RULER_HEIGHT and where it sits); this file owns everything printed ON it - which
// columns get a reading, and what each one reads.
//
// SAME DISCIPLINE AS proViewGeometry.ts beside it - no pixi (ComposerRenderer is behind a dynamic
// import, so anything it shares with a plain test must load without it), no `document`
// (ComposerCanvas.svelte is prerendered), no DOM measurement (the caller measures and passes px in).
//
// ...AND ONE MORE THAT MODULE STATES AS "WHAT IS NOT HERE: anything about a song": the timestamps
// arrive through a `columnStartMs` ACCESSOR rather than through a song object. Two things buy that:
// the module stays exercisable from plain vitest with a three-line function, and the ms grid stays
// nameable at the call site - where the rule below can actually be read by whoever writes it.
//
// THE RULE, and it is the only correctness statement in this file that is not arithmetic:
// `columnStartMs` MUST be ComposedSong.columnsDurationMs(0, index) - the ADR-0008
// boundary-differenced grid at offset 0, which is the exact ms the transport commits column `index`
// at (ComposerRenderer's own columnMsPrefix accumulates the same additions in the same order and is
// bit-identical to it by construction, so the renderer may difference its own prefix instead of
// holding the song). NEVER Utilities.calculateSongLength: that is a second implementation which
// accumulates unrounded, so a ruler marked from it would drift against the playhead standing on the
// column it labels. The `song-info` readout at the window's bottom prints the same grid for the
// selected column, which makes this a correctness check a user can see rather than one only a test
// can.
import { formatMs } from '$core/utils/Utilities';

/**
 * THE LADDER'S BOTTOM RUNG: a label every 4th column.
 *
 * Four because that is the finer of the two groupings the canvas ALREADY draws under the band -
 * ComposerRenderer.paintColumn's "larger" background variant, at `(index + 1) % 4 === 0` - rather
 * than the 12/16 bar-group striping, which at desktop widths would mark the ruler about three times
 * per screen. The ruler is a scale; a scale that a user has to count along is not one.
 *
 * KNOWN COSMETIC MISMATCH, accepted at design time (spec §4): labels anchor at
 * `index % labelStep === 0`, i.e. columns 0, 4, 8 - the FIRST column of each beat, which is what
 * makes column 0 read `0:00` - while that background accent is on columns 3, 7, 11, the LAST column
 * of each beat. So every label sits one column left of the accent below it. They are different
 * markings at different heights and neither moves; the alternative was a ruler whose first label is
 * at column 3 and reads a beat's worth of ms rather than zero.
 */
export const COLUMN_RULER_BASE_LABEL_STEP = 4;

/**
 * THE LABEL'S TYPE SIZE, in px - here rather than in the renderer because MIN_LABEL_SPACING_PX
 * below is derived from it, and a constant whose derivation lives in another file is a constant
 * nobody re-derives when it moves.
 *
 * Eleven is what COLUMN_RULER_HEIGHT's 20px band affords: a label centred in it needs its own line
 * box plus the minor/major tick rows it shares the band with, and Arial's cap height at 11px is 8px,
 * which is the smallest a digit stays crisply readable at on a 1x display without hinting tricks.
 * The Pro View's row-label strip caps its own labels at 15px (PRO_LABEL_FONT_MAX) because those are
 * read while the eye is on the notes beside them; these are read deliberately, when the question is
 * "where am I in the song", so they may be smaller than that ceiling.
 */
export const COLUMN_RULER_LABEL_FONT_PX = 11;

/**
 * THE CLOSEST TWO LABELS MAY BE PRINTED, centre to centre, in px - the one number the ladder below
 * steps up against.
 *
 * DERIVED, not chosen: the widest reading a real song reaches is `10:00` (five glyphs - past ten
 * minutes the composer's own column cap has long since been hit), and at COLUMN_RULER_LABEL_FONT_PX
 * in Arial that is 4 x 0.556em + 1 x 0.278em = 2.502em ~= 27.5px, called 28. The remaining 18px is
 * the GUTTER: a label needs enough clear air beside it that the eye reads two of them as two
 * readings rather than as one run of digits, and roughly two thirds of a label's own width is where
 * that stops being ambiguous at this type size. 28 + 18 = 46.
 *
 * IT IS A FLOOR ON THE LADDER AND NOT A MEASUREMENT of any particular string: measuring each label
 * would need a rasteriser (pixi's `Text.width`), which would put this module behind the dynamic
 * import and make the label set depend on which strings happen to be on screen - so the cadence
 * would change as the canvas scrolled past the 10-minute mark. One conservative width for the
 * widest case, decided once per (columnWidth, barLength), is what keeps the ladder stable.
 *
 * IN PRACTICE IT ALMOST NEVER ENGAGES (spec §4): at desktop widths a 4-column tick is 140-350px.
 * What actually thins a ruler is tempo, and after the "repeats accepted" decision below, nothing
 * does.
 */
export const MIN_LABEL_SPACING_PX = 46;

/**
 * THE BAR-GROUP WIDTH IN COLUMNS, from the `beatMarks` setting - 12 or 16 in the shipped options
 * (3 and 4), and the width of one stripe of the canvas' own background alternation.
 *
 * A MIRROR OF ComposerRenderer.counterLimit(), fallback included, and deliberately a copy rather
 * than an import: that class is behind a dynamic pixi import, so a pure module reaching into it
 * would drag pixi into every test that touches the ladder. The two must agree - the ladder's whole
 * seam-alignment property is stated against the stripes that function draws - so
 * test/columnRuler.test.ts pins both shipped options against the arithmetic here.
 *
 * `0` means "beat marks off" in that setting's vocabulary and falls back to 12, exactly as the
 * striping does, so the ladder never divides by a zero-wide bar.
 */
export function columnRulerBarLength(beatMarks: number): number {
  return beatMarks === 0 ? 12 : 4 * beatMarks;
}

/**
 * HOW MANY COLUMNS APART THE LABELS ARE at a given column width: the first rung of the ladder
 *
 *     4 -> barLength -> 2 x barLength -> 4 x barLength -> ...
 *
 * whose spacing reaches MIN_LABEL_SPACING_PX.
 *
 * IT IS DELIBERATELY NOT A PLAIN DOUBLING (spec §4). At `beatMarks: 3` the stripes are 12 columns
 * wide, so a 4 -> 8 step would put labels at 0, 8, 16, 24... against seams at 0, 12, 24, 36... -
 * every other label landing mid-stripe, and the two markings crossing each other down the band
 * rather than agreeing. Jumping from the base rung straight to `barLength` and doubling FROM THERE
 * keeps a property that holds at every rung: the label set and the seam set are NESTED, never
 * crossed. Either every seam is a labelled column (the base rung, since `barLength` is itself a
 * multiple of 4) or every label is a seam (every rung above it, each a multiple of `barLength`).
 * Written as one predicate, which is what test/columnRuler.test.ts asserts over the whole option
 * grid: `step % barLength === 0 || barLength % step === 0`, and `step % 4 === 0` throughout.
 *
 * THE SECOND RUNG IS `max(barLength, 8)` and not `barLength` outright, which matters only for a
 * `beatMarks` outside the shipped options: a bar of 4 columns would make the second rung equal the
 * first and the loop below would never advance. It is rounded to a whole number of beats for the
 * same reason - a hand-edited 14 would otherwise put every rung off the 4-column grid the base rung
 * establishes - and a non-finite one falls back to 8, the plain doubling.
 *
 * A NON-POSITIVE OR NON-FINITE `columnWidth` answers the base rung rather than looping: a canvas
 * measured before layout has no spacing to satisfy, and nothing is drawn on it either way.
 */
export function columnRulerLabelStep(input: { columnWidth: number; barLength: number }): number {
  const base = COLUMN_RULER_BASE_LABEL_STEP;
  if (!(input.columnWidth > 0) || !Number.isFinite(input.columnWidth)) return base;
  const bars = Math.round(input.barLength / base) * base;
  const second = Number.isFinite(bars) ? Math.max(bars, base * 2) : base * 2;
  let step = base;
  while (step * input.columnWidth < MIN_LABEL_SPACING_PX) {
    step = step === base ? second : step * 2;
  }
  return step;
}

/**
 * WHETHER A COLUMN CARRIES A LABEL - and therefore a major tick, since the ruler's ticks are minor
 * every `COLUMN_RULER_BASE_LABEL_STEP` columns and major exactly where a reading is printed.
 *
 * `index % labelStep === 0` AND NOT `(index + 1) % labelStep === 0`: anchoring on the first column
 * of the group is what makes column 0 read `0:00`, which is the one label whose value a user can
 * check against nothing at all. See COLUMN_RULER_BASE_LABEL_STEP for the accent it consequently
 * sits one column to the left of.
 *
 * A zero or negative step would make every column (or none) a label, so it answers false rather
 * than dividing by zero - the caller's ladder cannot produce one, and a caller that hand-rolls a
 * step should not be able to paint a label on every column of a 50-column canvas.
 */
export function isColumnRulerLabel(index: number, labelStep: number): boolean {
  if (!(labelStep > 0) || !Number.isFinite(labelStep)) return false;
  return index % labelStep === 0;
}

/**
 * ONE LABEL'S TEXT: the timestamp the column begins at, `m:ss`.
 *
 * `formatMs` and nothing else, so the ruler prints the string the rest of the app already prints for
 * the same instant (the `song-info` readout, the player's own times).
 *
 * DUPLICATE ADJACENT LABELS ARE ACCEPTED, and this is the decision that keeps this function one
 * line (spec §2, locked during the 2026-08-27 grilling). At the default bpm 220 a column is 272.7ms
 * and a 4-column tick is 1.09s, so labels are just distinct; past roughly bpm 300 two neighbours
 * print the same string. That is allowed. REJECTED, and not to be reintroduced as a "fix": thinning
 * the ladder until adjacent labels differ (which makes the cadence depend on the tempo AND on where
 * in the song you are, since a tempo changer can make one pair repeat and the next not), and
 * switching to a sub-second format like `0:06.5` when spacing is tight (a second format to read, on
 * the one surface whose job is to be glanceable). A repeat is a true reading of a fast song.
 *
 * NEGATIVE MS ARE CLAMPED rather than formatted: `formatMs` floors the minutes and rounds the
 * seconds independently, so a negative input prints nonsense like `-1:-1`. The grid never produces
 * one - `columnsDurationMs(0, i)` is a difference from offset 0 over non-negative columns - and the
 * band draws nothing left of column 0 anyway, so this states that rather than handling it.
 */
export function columnRulerLabelText(columnStartMs: number): string {
  return formatMs(Math.max(0, columnStartMs));
}

/** One printed reading: the column it is anchored to, and the string it shows. */
export interface ColumnRulerLabel {
  index: number;
  text: string;
}

/**
 * THE LABELS A DRAWN WINDOW CARRIES, in ascending column order - what the renderer's pooled `Text`
 * objects are filled from, and the thing whose CHANGE is the only trigger for refilling them (spec
 * §5: pixi rasterises on every `text` write, so a band that moves with every scroll frame must not
 * touch its labels per frame).
 *
 * `first`/`last` are the ruler's own visible column range, INCLUSIVE, and are the notes region's -
 * the band scrolls with the same `notesColumnsContainer.x` offset, so a tick and its column are
 * always at one x. The first anchor at or after `first` is `ceil(first / labelStep) * labelStep`,
 * which is exact for the integers involved.
 *
 * IT CALLS `columnStartMs` ONCE PER LABEL and never per column: the accessor is a lookup into a
 * cached prefix on both sides of the module header's rule, but the ruler is redrawn on every
 * scroll and "cheap" is not "free". Degenerate inputs (an empty window, `last < first`, a
 * non-positive step) answer the empty array, which paints an unmarked band rather than throwing on
 * a canvas that is mid-resize.
 */
export function columnRulerLabels(input: {
  first: number;
  last: number;
  labelStep: number;
  columnStartMs: (index: number) => number;
}): ColumnRulerLabel[] {
  const { first, last, labelStep } = input;
  const labels: ColumnRulerLabel[] = [];
  if (!(labelStep > 0) || !Number.isFinite(labelStep)) return labels;
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return labels;
  const start = Math.ceil(Math.max(0, first) / labelStep) * labelStep;
  for (let index = start; index <= last; index += labelStep) {
    labels.push({ index, text: columnRulerLabelText(input.columnStartMs(index)) });
  }
  return labels;
}
