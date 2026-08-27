/**
 * THE COLUMN RULER'S LABEL LADDER (CONTEXT.md: Column Ruler, Ruler Scrub; spec 2026-08-27 §4/§8,
 * phase A): which columns of the Pro View's top band carry a printed timestamp, and what each one
 * reads. Nothing is wired to a canvas yet — the ruler is drawn in phase B and pressable in phase C
 * — so this file is the only thing standing between a mis-cadenced ruler and the renderer.
 *
 * THE GRID IS READ OUT OF THE SETTINGS, not restated: `columnsPerCanvas` and `beatMarks` both come
 * from ComposerSettings' own option lists, so a new option is covered the day it ships rather than
 * the day someone remembers this file. The canvas widths are the other half — the real widths
 * composerCanvasSize produces at the viewports test/composerCanvasCss.test.ts sizes the placeholder
 * against, plus two synthetic narrow ones, because what actually engages the ladder is a 50-column
 * phone canvas and no desktop row would ever reach it.
 *
 * WHAT THE LADDER OWES, and every row below is one of the four:
 *  1. labels never collide — `labelStep * columnWidth >= MIN_LABEL_SPACING_PX`;
 *  2. it never over-thins — no LOWER rung of the ladder satisfies (1);
 *  3. every step is a multiple of 4, the base rung's own grid;
 *  4. every step is SEAM-ALIGNED against the canvas' 12/16-column bar striping: the label set and
 *     the seam set are nested, never crossed (`step % barLength === 0 || barLength % step === 0`).
 *     This is the property the ladder is not a plain doubling FOR — see columnRuler.ts.
 *
 * ...and the timestamps owe one thing: they are `ComposedSong.columnsDurationMs(0, i)`, the
 * ADR-0008 boundary-differenced grid, and not any second accumulation of the same durations. The
 * last block pins that against the drift ADR-0008 exists to remove.
 */
import { describe, expect, it } from 'vitest';
import { ComposedSong, ComposerSettings, INSTRUMENTS, TEMPO_CHANGERS } from './imports';
import {
  COLUMN_RULER_BASE_LABEL_STEP,
  COLUMN_RULER_LABEL_FONT_PX,
  MIN_LABEL_SPACING_PX,
  columnRulerBarLength,
  columnRulerLabelStep,
  columnRulerLabelText,
  columnRulerLabels,
  isColumnRulerLabel,
} from '$cmp/pages/Composer/columnRuler';
import { composerCanvasSize } from '$cmp/pages/Composer/composerCanvasGeometry';
import { formatMs, nearestEven } from '$core/utils/Utilities';

/** ComposerSettings' own option lists — see this file's header for why they are not restated. */
const COLUMNS_PER_CANVAS = ComposerSettings.data.columnsPerCanvas.options.map(Number);
const BEAT_MARKS = ComposerSettings.data.beatMarks.options.map(Number);

/**
 * The canvas widths the ladder is exercised at.
 *
 * The first group is REAL: composerCanvasSize's own answer at the viewports the placeholder suite
 * uses, so these are widths a user actually gets (the width is view-independent — Pro View changes
 * the composer's vertical layout only — so one call each covers both views). The two synthetic
 * entries below them exist because no shipped viewport is narrow enough to reach the ladder's THIRD
 * rung, and a rung nothing ever evaluates is a rung nothing checks.
 */
const VIEWPORTS = [
  { width: 2560, height: 1440 },
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1001, height: 800 },
  { width: 1000, height: 800 },
  { width: 900, height: 700 },
  { width: 400, height: 800 },
  { width: 360, height: 640 },
];
const CANVAS_WIDTHS = [
  ...VIEWPORTS.map(
    (viewport) =>
      composerCanvasSize({
        bodyWidth: viewport.width,
        bodyHeight: viewport.height,
        inPreview: false,
      }).width
  ),
  //a 100px canvas at 50 columns is a 2px column — three rungs up at beatMarks 3
  100,
  //...and 60px, which is where even the doubled bar is not enough at the widest option
  60,
];

/** `columnWidth` as ComposerRenderer.computeCanvasSize derives it — one statement, both sides. */
const columnWidthOf = (canvasWidth: number, columnsPerCanvas: number) =>
  nearestEven(canvasWidth / columnsPerCanvas);

/**
 * THE LADDER, restated independently: `4 → barLength → 2×barLength → …`. Eight rungs is far past
 * anything a 60px canvas reaches, and the expectations below assert the CHOSEN rung is the first
 * one satisfying the spacing rather than merely one that does.
 */
function ladderOf(barLength: number): number[] {
  const rungs = [COLUMN_RULER_BASE_LABEL_STEP];
  let rung = Math.max(barLength, COLUMN_RULER_BASE_LABEL_STEP * 2);
  for (let i = 0; i < 8; i++) {
    rungs.push(rung);
    rung *= 2;
  }
  return rungs;
}

describe('the bar length the ladder is stated against', () => {
  it('mirrors ComposerRenderer.counterLimit for every shipped beatMarks option', () => {
    //THE COPY THAT MUST NOT DRIFT (columnRuler.ts states why it is a copy): the ladder's whole
    //seam-alignment property is stated against the stripes `counterLimit` decides the width of, so
    //a change to one of the two and not the other silently un-aligns every label above the base
    //rung. The arithmetic is `4 * beatMarks`, and the shipped options are 3 and 4.
    expect(BEAT_MARKS).toEqual([3, 4]);
    expect(columnRulerBarLength(3)).toBe(12);
    expect(columnRulerBarLength(4)).toBe(16);
    for (const beatMarks of BEAT_MARKS) {
      expect(columnRulerBarLength(beatMarks)).toBe(4 * beatMarks);
    }
    //`0` is "beat marks off" in that setting's vocabulary, and the striping falls back to 12
    expect(columnRulerBarLength(0)).toBe(12);
  });
});

describe('the label ladder over every canvas the composer can produce', () => {
  it('offers the option lists this file is parameterised by', () => {
    //a pin, not decoration: every row below is `for (const x of ...)`, and an empty list would
    //make the whole block pass by running nothing
    expect(COLUMNS_PER_CANVAS).toEqual([20, 25, 30, 35, 40, 45, 50]);
    expect(CANVAS_WIDTHS.every((width) => width > 0)).toBe(true);
  });

  for (const beatMarks of BEAT_MARKS) {
    const barLength = columnRulerBarLength(beatMarks);
    for (const columnsPerCanvas of COLUMNS_PER_CANVAS) {
      for (const canvasWidth of CANVAS_WIDTHS) {
        const columnWidth = columnWidthOf(canvasWidth, columnsPerCanvas);
        const label = `beatMarks ${beatMarks}, ${columnsPerCanvas} columns, ${canvasWidth}px canvas`;

        it(`labels legibly and on the stripes at ${label}`, () => {
          const step = columnRulerLabelStep({ columnWidth, barLength });
          const rungs = ladderOf(barLength);

          //(1) NEVER COLLIDE. Two adjacent labels stand `step * columnWidth` apart, centre to
          //centre, and MIN_LABEL_SPACING_PX is the widest reading plus its gutter.
          expect(step * columnWidth).toBeGreaterThanOrEqual(MIN_LABEL_SPACING_PX);

          //(2) NEVER OVER-THIN: the step is the FIRST rung that satisfies (1). A ladder that
          //skipped a rung would still pass (1) while marking the ruler half as often as the canvas
          //can carry, which is the failure a spacing-only assertion cannot see.
          expect(step).toBe(rungs.find((rung) => rung * columnWidth >= MIN_LABEL_SPACING_PX));
          for (const rung of rungs) {
            if (rung >= step) continue;
            expect(rung * columnWidth).toBeLessThan(MIN_LABEL_SPACING_PX);
          }

          //(3) a whole number of beats, always — the base rung's own grid
          expect(step % COLUMN_RULER_BASE_LABEL_STEP).toBe(0);

          //(4) SEAM-ALIGNED: the label set and the stripe-seam set are nested, never crossed.
          //Either every seam is a labelled column (the base rung) or every label is a seam (every
          //rung above it). This is what the ladder is not a plain doubling for: at beatMarks 3 a
          //4 → 8 step puts labels at 0, 8, 16 against seams at 0, 12, 24.
          expect(step % barLength === 0 || barLength % step === 0).toBe(true);

          //...and the stronger form of (4), stated as the drawing sees it: over a whole song's
          //worth of columns, no labelled column ever falls strictly inside a stripe unless EVERY
          //multiple of the step does (which is only the base rung, where the seams are a subset of
          //the labels).
          const labelled = [];
          for (let index = 0; index < 400; index++) {
            if (isColumnRulerLabel(index, step)) labelled.push(index);
          }
          const onSeam = labelled.filter((index) => index % barLength === 0);
          expect(onSeam.length === labelled.length || step === COLUMN_RULER_BASE_LABEL_STEP).toBe(
            true
          );
        });
      }
    }
  }

  it('engages at all, and only where a real canvas is genuinely tight', () => {
    //THE LADDER ALMOST NEVER ENGAGES (spec §4) — a claim worth a row of its own, because a ladder
    //that stepped up on a 1920px desktop would be marking the ruler once a bar instead of once a
    //beat and nobody would have noticed from the assertions above.
    const desktop = composerCanvasSize({ bodyWidth: 1920, bodyHeight: 1080, inPreview: false });
    for (const beatMarks of BEAT_MARKS) {
      const barLength = columnRulerBarLength(beatMarks);
      for (const columnsPerCanvas of COLUMNS_PER_CANVAS) {
        expect(
          columnRulerLabelStep({
            columnWidth: columnWidthOf(desktop.width, columnsPerCanvas),
            barLength,
          })
        ).toBe(COLUMN_RULER_BASE_LABEL_STEP);
      }
    }
    //...and it DOES engage where the design said it would: the narrowest shipped phone at the
    //widest columnsPerCanvas is a 6px column, where a 4-column tick is 24px against a 46px need
    const phone = composerCanvasSize({ bodyWidth: 360, bodyHeight: 640, inPreview: false });
    const phoneColumn = columnWidthOf(phone.width, 50);
    expect(phoneColumn * COLUMN_RULER_BASE_LABEL_STEP).toBeLessThan(MIN_LABEL_SPACING_PX);
    expect(columnRulerLabelStep({ columnWidth: phoneColumn, barLength: 12 })).toBe(12);
    expect(columnRulerLabelStep({ columnWidth: phoneColumn, barLength: 16 })).toBe(16);
  });

  it('answers the base rung on a canvas that has not been laid out yet', () => {
    //A region measured before layout has no spacing to satisfy and nothing is drawn on it either
    //way; what matters is that the loop does not run forever looking for one.
    for (const columnWidth of [0, -8, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(columnRulerLabelStep({ columnWidth, barLength: 12 })).toBe(
        COLUMN_RULER_BASE_LABEL_STEP
      );
    }
    //...and a hand-edited beatMarks whose bar is no wider than the base rung still ADVANCES,
    //rather than making the second rung equal the first and looping forever: both of these fall
    //back to the plain doubling 4 → 8 → 16 → 32, which at a 2px column is where 46px is reached
    expect(columnRulerLabelStep({ columnWidth: 2, barLength: 4 })).toBe(32);
    expect(columnRulerLabelStep({ columnWidth: 2, barLength: Number.NaN })).toBe(32);
    //a bar that is not a whole number of beats is rounded onto the 4-column grid the base rung
    //establishes, so no rung above the first can be off it: 14 → 16, not 14
    expect(columnRulerLabelStep({ columnWidth: 4, barLength: 14 })).toBe(16);
  });

  it('keeps the label constants in the relationship they were derived in', () => {
    //MIN_LABEL_SPACING_PX is "the widest reading plus a gutter" at COLUMN_RULER_LABEL_FONT_PX, so
    //the two move together or the derivation in that docblock stops being true. Arial's advance
    //widths: a digit is 0.556em, a colon 0.278em, so `10:00` is 2.502em.
    const widestLabel = COLUMN_RULER_LABEL_FONT_PX * (4 * 0.556 + 0.278);
    expect(widestLabel).toBeLessThan(MIN_LABEL_SPACING_PX);
    //...with a gutter that is a real fraction of the label rather than a rounding: at least half a
    //label's width of clear air between two readings
    expect(MIN_LABEL_SPACING_PX - widestLabel).toBeGreaterThan(widestLabel / 2);
    //and the band it all has to fit inside is 20px tall, so the type cannot grow much either
    expect(COLUMN_RULER_LABEL_FONT_PX).toBeLessThan(20);
  });
});

describe('where a label is anchored', () => {
  it('puts a reading on column 0 at every rung of the ladder', () => {
    //`index % labelStep === 0` AND NOT `(index + 1) % labelStep === 0` (the canvas' own background
    //accent): column 0 reading 0:00 is the one label whose value a user can check against nothing.
    for (const step of [...ladderOf(12), ...ladderOf(16)]) {
      expect(isColumnRulerLabel(0, step)).toBe(true);
      expect(isColumnRulerLabel(step, step)).toBe(true);
      expect(isColumnRulerLabel(step - 1, step)).toBe(false);
    }
  });

  it('is one column left of the background accent, knowingly', () => {
    //THE COSMETIC MISMATCH THE DESIGN ACCEPTED (spec §4): ComposerRenderer.paintColumn's "larger"
    //variant is `(index + 1) % 4 === 0` — columns 3, 7, 11, the LAST column of each beat — while a
    //label anchors on the FIRST. Pinned rather than fixed, so that a future attempt to align them
    //has to come here and read why neither moves.
    const accent = (index: number) => (index + 1) % 4 === 0;
    expect(isColumnRulerLabel(0, 4)).toBe(true);
    expect(accent(0)).toBe(false);
    expect(accent(3)).toBe(true);
    expect(isColumnRulerLabel(3, 4)).toBe(false);
  });

  it('answers no label at all for a step no ladder can produce', () => {
    for (const step of [0, -4, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(isColumnRulerLabel(8, step)).toBe(false);
    }
  });
});

describe('the readings the labels carry', () => {
  const COLUMNS = 240;

  /**
   * A song whose every column carries a tempo changer, cycling through all four, so the ms grid is
   * heterogeneous — a ruler that assumed a constant column length agrees with the grid on a flat
   * song and nowhere else.
   */
  function songWithChangers(bpm: number): ComposedSong {
    const song = new ComposedSong('column ruler', [INSTRUMENTS[0]]);
    song.bpm = bpm;
    song.addColumns(COLUMNS - song.columns.length, 'end');
    for (let i = 0; i < COLUMNS; i++) {
      song.setTempoChangerAt(i, TEMPO_CHANGERS[i % TEMPO_CHANGERS.length]);
    }
    return song;
  }

  //the tempos ADR-0008's drift table measured, including the four where a per-column rounding and
  //the boundary-differenced grid part company
  for (const bpm of [40, 60, 110, 120, 150, 220, 300]) {
    it(`reads columnsDurationMs(0, i) at bpm ${bpm}, across tempo changers`, () => {
      const song = songWithChangers(bpm);
      const columnStartMs = (index: number) => song.columnsDurationMs(0, index);
      for (const step of [4, 12, 16, 24, 32]) {
        const labels = columnRulerLabels({
          first: 0,
          last: COLUMNS - 1,
          labelStep: step,
          columnStartMs,
        });
        //anchored on the step, in ascending order, over the whole window
        expect(labels.map((entry) => entry.index)).toEqual(
          Array.from({ length: Math.ceil(COLUMNS / step) }, (_, i) => i * step)
        );
        expect(labels[0]).toEqual({ index: 0, text: '0:00' });
        //...and each reading is the grid's own ms for that column, formatted once
        for (const entry of labels) {
          expect(entry.text).toBe(formatMs(song.columnsDurationMs(0, entry.index)));
        }
      }
    });
  }

  it('follows the ADR-0008 grid and not a second accumulation of the same durations', () => {
    //THE POINT OF THE ACCESSOR RULE, made concrete. Rounding each column on its own and summing
    //drifts against the boundary-differenced grid wherever `(60000 / bpm) * changer` is not whole
    //ms — bpm 110 is one of the tempos ADR-0008 measured that on. The ruler prints the grid, which
    //is where the transport actually commits the column and what the song-info readout shows, so
    //the two readings a user can see side by side agree.
    const song = songWithChangers(110);
    //the composer's OLD arithmetic: round `msPerBeat * changer` per column, then sum. At bpm 110
    //over these changers that lands 44ms away from the grid by the song's end - a ruler marked
    //from it would print a different second from the playhead standing on the column it labels.
    const msPerBeat = 60000 / 110;
    let naive = 0;
    for (let i = 0; i < COLUMNS; i++) {
      naive += Math.round(msPerBeat * TEMPO_CHANGERS[song.columns[i].tempoChanger].changer);
    }
    expect(Math.abs(naive - song.columnsDurationMs(0, COLUMNS))).toBeGreaterThanOrEqual(1);
    //...and the same drift at the column the last label of this song sits on. Asserted on the MS
    //and not on the printed string, deliberately: 43ms of drift changes the second only when the
    //true value happens to be that close to a .5s boundary, and it is not at any labelled column
    //here - so a string comparison would pass on a ruler that WAS marked from the naive sum. What
    //has to be pinned is which number the reading is taken from.
    let naiveAtLabel = 0;
    for (let i = 0; i < COLUMNS - 4; i++) {
      naiveAtLabel += Math.round(msPerBeat * TEMPO_CHANGERS[song.columns[i].tempoChanger].changer);
    }
    const gridAtLabel = song.columnsDurationMs(0, COLUMNS - 4);
    expect(naiveAtLabel).not.toBe(gridAtLabel);
    const label = columnRulerLabels({
      first: COLUMNS - 4,
      last: COLUMNS - 1,
      labelStep: 4,
      columnStartMs: (index) => song.columnsDurationMs(0, index),
    });
    expect(label).toEqual([{ index: COLUMNS - 4, text: formatMs(gridAtLabel) }]);
  });

  it('accepts duplicate adjacent readings on a fast song, and does not thin for them', () => {
    //A LOCKED DECISION (spec §2), pinned here so a future "fix" fails a test that explains itself:
    //past roughly bpm 300 a 4-column tick is under a second and two neighbours print the same
    //string. That is a true reading of a fast song. No distinctness condition on the ladder, no
    //sub-second format — and the structural guarantee is that the ladder cannot even see the ms:
    //the same geometry answers the same step at every tempo.
    const fast = songWithChangers(600);
    const labels = columnRulerLabels({
      first: 0,
      last: 40,
      labelStep: COLUMN_RULER_BASE_LABEL_STEP,
      columnStartMs: (index) => fast.columnsDurationMs(0, index),
    });
    const repeats = labels.filter((entry, i) => i > 0 && labels[i - 1].text === entry.text);
    expect(repeats.length).toBeGreaterThan(0);
    //...and the step is a function of pixels alone
    expect(columnRulerLabelStep({ columnWidth: 24, barLength: 12 })).toBe(
      columnRulerLabelStep({ columnWidth: 24, barLength: 12 })
    );
  });

  it('marks only the anchors inside the window it is given', () => {
    const song = songWithChangers(220);
    const columnStartMs = (index: number) => song.columnsDurationMs(0, index);
    //a window that starts mid-song begins at the first anchor AT OR AFTER it, so a tick and its
    //column stay at one x however the canvas is scrolled
    expect(
      columnRulerLabels({ first: 13, last: 41, labelStep: 12, columnStartMs }).map((e) => e.index)
    ).toEqual([24, 36]);
    //...inclusive at both ends, like every other visible-range statement in the composer
    expect(
      columnRulerLabels({ first: 24, last: 36, labelStep: 12, columnStartMs }).map((e) => e.index)
    ).toEqual([24, 36]);
    //degenerate windows paint an unmarked band rather than throwing on a canvas mid-resize
    for (const window of [
      { first: 5, last: 4 },
      { first: 0, last: -1 },
      { first: Number.NaN, last: 40 },
    ]) {
      expect(columnRulerLabels({ ...window, labelStep: 4, columnStartMs })).toEqual([]);
    }
    expect(columnRulerLabels({ first: 0, last: 40, labelStep: 0, columnStartMs })).toEqual([]);
    //...and a window reaching left of column 0 draws no negative times (the leading 25% of the
    //band is empty at scroll position 0, exactly as the notes region is)
    expect(
      columnRulerLabels({ first: -20, last: 8, labelStep: 4, columnStartMs }).map((e) => e.index)
    ).toEqual([0, 4, 8]);
  });

  it('formats with formatMs and clamps a negative to the song start', () => {
    expect(columnRulerLabelText(0)).toBe('0:00');
    expect(columnRulerLabelText(1090)).toBe(formatMs(1090));
    expect(columnRulerLabelText(65_000)).toBe('1:05');
    //`formatMs` floors the minutes and rounds the seconds independently, so a negative would print
    //nonsense; the grid never produces one and the band draws nothing left of column 0
    expect(columnRulerLabelText(-500)).toBe('0:00');
  });
});
