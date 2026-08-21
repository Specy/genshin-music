/**
 * THE PRO VIEW'S DOMAIN LAYER (spec §4 / §10, phase A): the axis, its rows, the camera, the
 * Editable Zone and the tap resolution, none of it wired to anything yet. `proView` is a settings
 * checkbox nothing reads, so this file is the only thing standing between a wrong row and phase C's
 * renderer.
 *
 * GAME-AGNOSTIC BY CONSTRUCTION, like test/noteNumbers.test.ts: every case derives its instruments
 * from CONFIG CAPABILITY (which instrument has the widest reach? which ships an Assigned Button? a
 * tuned one?) and never from APP_NAME, so both PUBLIC_GAMEs run the same rows and a game that later
 * gains such an instrument gets the case for free. The two named-instrument rows (Vintage-Lyre,
 * Ukulele) are guarded by roster PRESENCE — they pin the exact numbers the ADR-0007 audit produced,
 * on the build that actually ships them.
 *
 * ONE PIXEL CONVENTION runs through the camera rows: the notes region is ALWAYS exactly
 * `perColumn + 2` rows tall (that IS proRowHeight's divisor at zoom 1), so every height here is
 * stated as a whole number of rows and ROW is chosen to divide exactly in both games. A test that
 * picked a round pixel height instead would be asserting float noise. The USER'S own zoom - a
 * multiplier on that fit since 2026-08-22 - has its own describe block at the end of the row
 * section, and every other row here is at zoom 1 by omission.
 */
import { describe, expect, it } from 'vitest';
import { INSTRUMENTS, INSTRUMENTS_DATA, InstrumentData, NOTES_PER_COLUMN, PITCHES } from './imports';
import {
  AXIS_PADDING_ROWS,
  PRO_MIN_ROW_HEIGHT_PX,
  PRO_ZOOM_MAX,
  PRO_ZOOM_MIN,
  ROW_HEIGHT_FRAMING_ROWS,
  addressableSpan,
  clampCameraY,
  clampProZoom,
  editableZone,
  isAddable,
  lockedCameraY,
  maxCameraY,
  numberAtY,
  numberForRow,
  proRowHeight,
  proViewAxis,
  rowForNumber,
  spanOfNumbers,
  visibleRowRange,
  yForNumber,
  zoneRowCount,
  zoomedCameraY,
  type ProViewAxis,
} from '$cmp/pages/Composer/proViewGeometry';
import {
  basepointOffset,
  effectiveTrackPitch,
  getNoteIdTable,
  getSoundingTable,
  isAccidentalMidi,
  noteNameForMidi,
  numberToButton,
} from '$core/Songs/noteIds';
import type { Pitch } from '$core/legacyConfig';

/** Every instrument FOLDER, Unlisted Instruments included — what a song can actually load. */
const ALL_INSTRUMENTS = Object.keys(INSTRUMENTS_DATA);
const ALL_PITCHES = PITCHES as readonly Pitch[];
const notesOf = (name: string) => INSTRUMENTS_DATA[name as keyof typeof INSTRUMENTS_DATA].notes;

/** How many rows of the axis the notes region shows — fixed, because the row height is derived from it. */
const REGION_ROWS = NOTES_PER_COLUMN + ROW_HEIGHT_FRAMING_ROWS;
/** One row, in px. Any value works; a whole one keeps every expectation below exact. */
const ROW = 20;
const REGION = REGION_ROWS * ROW;

const AXIS = proViewAxis();
const bandOf = (name: string) => {
  const zone = editableZone(name, 'C');
  return zone.max - zone.min;
};
/** The instrument that reaches furthest — the "full range" case for the locked camera. */
const WIDEST = ALL_INSTRUMENTS.reduce((a, b) => (bandOf(b) > bandOf(a) ? b : a));
/** ...and the narrowest, which is a drums/SFX kit in both shipped games (8 or fewer buttons). */
const NARROWEST = ALL_INSTRUMENTS.reduce((a, b) => (bandOf(b) < bandOf(a) ? b : a));
/** Instruments with at least one Assigned Button (percussion, SFX, chord strums). */
const ASSIGNED = ALL_INSTRUMENTS.filter((name) => notesOf(name).some((note) => !note.pitched));
/** Instruments with at least one Pitched Button tuned away from its Nominal Id (genshin: Vintage-Lyre). */
const TUNED = ALL_INSTRUMENTS.filter((name) =>
  notesOf(name).some((note) => note.pitched && note.sounding !== note.midi)
);

describe('the addressable span', () => {
  it('is the sounding tables own bounds, the top one lifted by the highest Basepoint', () => {
    const soundings = ALL_INSTRUMENTS.flatMap((name) => notesOf(name).map((note) => note.sounding));
    expect(addressableSpan()).toEqual({
      min: Math.min(...soundings),
      //Basepoints only ever shift UPWARD, so the bottom needs no headroom and the top needs the
      //whole PITCHES list
      max: Math.max(...soundings) + (PITCHES.length - 1),
    });
  });

  it('holds every button of every instrument at every Basepoint, and is tight at both ends', () => {
    const span = addressableSpan();
    let touchesBottom = false;
    let touchesTop = false;
    for (const name of ALL_INSTRUMENTS) {
      for (const pitch of ALL_PITCHES) {
        for (const sounding of getSoundingTable(name)) {
          const number = sounding + basepointOffset(pitch);
          expect(number).toBeGreaterThanOrEqual(span.min);
          expect(number).toBeLessThanOrEqual(span.max);
          if (number === span.min) touchesBottom = true;
          if (number === span.max) touchesTop = true;
        }
      }
    }
    //not one row wider than it has to be: both ends are a real button at a real Basepoint
    expect(touchesBottom).toBe(true);
    expect(touchesTop).toBe(true);
  });

  it('is taken over every instrument FOLDER, not just the menu roster', () => {
    //an Unlisted Instrument is loadable by a song even though no menu offers it, so its notes must
    //have rows. The two lists are identical in both shipped games today - this row is what fails
    //when one of them gains an unlisted folder and the span stops covering it
    for (const listed of INSTRUMENTS) expect(ALL_INSTRUMENTS).toContain(listed);
    expect(ALL_INSTRUMENTS.length).toBeGreaterThanOrEqual(INSTRUMENTS.length);
  });
});

describe('the axis', () => {
  it('pads the addressable span by AXIS_PADDING_ROWS at both ends', () => {
    const span = addressableSpan();
    expect(proViewAxis()).toEqual({
      min: span.min - AXIS_PADDING_ROWS,
      max: span.max + AXIS_PADDING_ROWS,
      rowCount: span.max - span.min + 1 + AXIS_PADDING_ROWS * 2,
    });
  });

  it('widens for a song outlier, keeping the padding OUTSIDE it', () => {
    const span = addressableSpan();
    const axis = proViewAxis({ min: span.min - 14, max: span.max + 9 });
    expect(axis.min).toBe(span.min - 14 - AXIS_PADDING_ROWS);
    expect(axis.max).toBe(span.max + 9 + AXIS_PADDING_ROWS);
    //nothing is ever off-axis: the outlier itself has a row, with context above/below it
    expect(rowForNumber(axis, span.max + 9)).toBe(AXIS_PADDING_ROWS);
    expect(rowForNumber(axis, span.min - 14)).toBe(axis.rowCount - 1 - AXIS_PADDING_ROWS);
  });

  it('never NARROWS for a song that stays inside the span', () => {
    const span = addressableSpan();
    expect(proViewAxis({ min: span.min + 5, max: span.max - 5 })).toEqual(proViewAxis());
  });

  it('shrinks back when the outliers are gone — it remembers nothing', () => {
    const span = addressableSpan();
    const widened = proViewAxis({ min: span.min - 30, max: span.max + 30 });
    expect(widened.rowCount).toBeGreaterThan(proViewAxis().rowCount);
    //the axis is a pure function of (config, this song's numbers): deleting the outlier and
    //recomputing gives the unwidened axis back, which is the accepted "only weird files see it move"
    expect(proViewAxis()).toEqual(proViewAxis(null));
    expect(proViewAxis(null).rowCount).toBe(span.max - span.min + 1 + AXIS_PADDING_ROWS * 2);
  });

  it('stays whole-semitone aligned even for a fractional stored number', () => {
    const span = addressableSpan();
    const axis = proViewAxis({ min: span.min - 2.5, max: span.max + 2.5 });
    expect(Number.isInteger(axis.min)).toBe(true);
    expect(Number.isInteger(axis.max)).toBe(true);
    //floored/ceiled OUTWARD, so the odd note still has a row it fits inside
    expect(axis.min).toBe(span.min - 3 - AXIS_PADDING_ROWS);
    expect(axis.max).toBe(span.max + 3 + AXIS_PADDING_ROWS);
  });

  describe('spanOfNumbers', () => {
    it('reduces the caller iterable to the pair the axis widens by', () => {
      expect(spanOfNumbers([64, 60, 72, 67])).toEqual({ min: 60, max: 72 });
      expect(spanOfNumbers(new Set([80]))).toEqual({ min: 80, max: 80 });
    });
    it('answers null for a song with no notes, so the axis stays the config one', () => {
      expect(spanOfNumbers([])).toBe(null);
      expect(proViewAxis(spanOfNumbers([]))).toEqual(proViewAxis());
    });
    it('skips a corrupt entry instead of poisoning every row with NaN', () => {
      expect(spanOfNumbers([60, NaN, Infinity, 72])).toEqual({ min: 60, max: 72 });
      expect(spanOfNumbers([NaN])).toBe(null);
    });
  });
});

describe('rows', () => {
  it('put row 0 on top and rise upward, round-tripping every number on the axis', () => {
    expect(rowForNumber(AXIS, AXIS.max)).toBe(0);
    expect(rowForNumber(AXIS, AXIS.min)).toBe(AXIS.rowCount - 1);
    for (let number = AXIS.min; number <= AXIS.max; number++) {
      const row = rowForNumber(AXIS, number);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(AXIS.rowCount);
      expect(numberForRow(AXIS, row)).toBe(number);
    }
    //a semitone up is one row up the screen
    expect(rowForNumber(AXIS, 60) - rowForNumber(AXIS, 61)).toBe(1);
  });

  it('caps a row at the game\'s own note size: perColumn + 2 rows fill the region', () => {
    expect(proRowHeight({ notesRegionHeight: REGION })).toBe(ROW);
    expect(proRowHeight({ notesRegionHeight: REGION }) * REGION_ROWS).toBe(REGION);
    //the two shipped `perColumn` values, from one build - same trick as composerCanvasSize's
    //`rowHeightScale` parameter
    expect(proRowHeight({ notesRegionHeight: 230, perColumn: 21 })).toBe(10);
    expect(proRowHeight({ notesRegionHeight: 170, perColumn: 15 })).toBe(10);
    //the cap scales with the region and with nothing else
    expect(proRowHeight({ notesRegionHeight: REGION * 2 })).toBe(ROW * 2);
  });

  /**
   * THE FRAMING FITS THE WHOLE INSTRUMENT (spec §4, user revision 2026-08-21).
   *
   * `perColumn` counts BUTTONS and the Pro View draws a row per SEMITONE, so the two part company
   * for every instrument with a gap in it: the widest one in either shipped game spans far more
   * semitones than the game's layout has buttons, and a region sized for `perColumn + 2` showed
   * two thirds of its Editable Zone with the locked frame cutting the rest off.
   *
   * Stated over the ROSTER rather than over named instruments, like everything else in this file:
   * whichever instrument reaches furthest in this build is the one that has to fit.
   */
  it('shrinks a row until the whole Editable Zone plus its framing fits the region', () => {
    const zone = editableZone(WIDEST, 'C');
    const rows = zoneRowCount(zone);
    const rowHeight = proRowHeight({ notesRegionHeight: REGION, zoneRowCount: rows });
    //the zone and its two framing rows tile the region exactly
    expect(rowHeight * (rows + ROW_HEIGHT_FRAMING_ROWS)).toBeCloseTo(REGION, 9);
    //...which is what makes the whole band visible: the zone itself is shorter than the region
    expect(rowHeight * rows).toBeLessThan(REGION);
    //genshin's widest instrument spans more semitones than the game has buttons per column, so
    //this is a REAL shrink there; on a game where it does not, the cap below is what answers
    if (rows > NOTES_PER_COLUMN) {
      expect(rowHeight).toBeLessThan(proRowHeight({ notesRegionHeight: REGION }));
    }
  });

  it('...but never grows one: a narrow instrument keeps the game\'s note size', () => {
    const rows = zoneRowCount(editableZone(NARROWEST, 'C'));
    expect(rows).toBeLessThan(REGION_ROWS);
    //the cap, exactly - the drum kit's 8 buttons over a dozen semitones would otherwise draw
    //notes twice the size of every other instrument's, which is a different view and not a frame
    expect(proRowHeight({ notesRegionHeight: REGION, zoneRowCount: rows })).toBe(ROW);
  });

  it('is the smaller of the two terms, whichever that is, in both shipped layouts', () => {
    //BOTH GAMES FROM ONE BUILD, the way the cap row above checks both `perColumn` values: 21/15
    //buttons, against a zone wider than the layout and a zone narrower than it.
    for (const perColumn of [21, 15]) {
      const cap = proRowHeight({ notesRegionHeight: 460, perColumn });
      //a 36-row zone (genshin's Lyre) fits at 460 / 38, well under either cap
      expect(proRowHeight({ notesRegionHeight: 460, perColumn, zoneRowCount: 36 })).toBe(460 / 38);
      //a 6-row one would want 460 / 8 and gets the cap instead
      expect(proRowHeight({ notesRegionHeight: 460, perColumn, zoneRowCount: 6 })).toBe(cap);
      //...and exactly `perColumn` rows of zone is the crossover: the two terms are the same number
      expect(proRowHeight({ notesRegionHeight: 460, perColumn, zoneRowCount: perColumn })).toBe(cap);
    }
  });

  it('is the cap alone when no zone is given - the state before the first framing', () => {
    expect(proRowHeight({ notesRegionHeight: REGION, zoneRowCount: undefined })).toBe(ROW);
    //a degenerate count cannot poison the row height either
    expect(proRowHeight({ notesRegionHeight: REGION, zoneRowCount: 0 })).toBe(ROW);
    expect(proRowHeight({ notesRegionHeight: REGION, zoneRowCount: -4 })).toBe(ROW);
  });

  it('counts a zone\'s rows with both ends included', () => {
    expect(zoneRowCount({ min: 48, max: 83 })).toBe(36);
    //one number is one row, not none
    expect(zoneRowCount({ min: 60, max: 60 })).toBe(1);
    const zone = editableZone(WIDEST, 'C');
    expect(zoneRowCount(zone)).toBe(zone.max - zone.min + 1);
  });
});

/**
 * THE USER'S VERTICAL ZOOM (spec §4/§7, user revision 2026-08-22): one multiplier on the fitted row
 * height, clamped to a range, floored at a drawable px, and never anything else.
 *
 * The point of every row here is that the FIT is still what it was: the same two terms, the same
 * layer-follows-instrument behaviour, with a factor applied on the way out — so a zoomed view keeps
 * its magnification through a layer switch, and re-locking (which the renderer implements by putting
 * the multiplier back to 1) gives back exactly the framing the lock has always given.
 */
describe('the vertical zoom', () => {
  it('holds a multiplier inside the documented range, at both ends', () => {
    expect(clampProZoom(1)).toBe(1);
    expect(clampProZoom(2)).toBe(2);
    expect(clampProZoom(PRO_ZOOM_MIN)).toBe(PRO_ZOOM_MIN);
    expect(clampProZoom(PRO_ZOOM_MAX)).toBe(PRO_ZOOM_MAX);
    //past either end the gesture simply stops
    expect(clampProZoom(0.001)).toBe(PRO_ZOOM_MIN);
    expect(clampProZoom(1e6)).toBe(PRO_ZOOM_MAX);
    expect(clampProZoom(-3)).toBe(PRO_ZOOM_MIN);
    //hardware can hand a wheel rate or a touch-distance ratio a zero, a NaN or an infinity; none of
    //them is a zoom, so they answer "no zoom" rather than an end of the range
    expect(clampProZoom(Number.NaN)).toBe(1);
    expect(clampProZoom(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('multiplies the fit, whichever of the two terms the fit came from', () => {
    const wide = zoneRowCount(editableZone(WIDEST, 'C'));
    const narrow = zoneRowCount(editableZone(NARROWEST, 'C'));
    for (const zoneRowCountValue of [wide, narrow, undefined]) {
      const fitted = proRowHeight({ notesRegionHeight: REGION, zoneRowCount: zoneRowCountValue });
      expect(proRowHeight({ notesRegionHeight: REGION, zoneRowCount: zoneRowCountValue, zoom: 1 }))
        .toBe(fitted);
      for (const zoom of [PRO_ZOOM_MIN, 0.75, 1.5, PRO_ZOOM_MAX]) {
        expect(
          proRowHeight({ notesRegionHeight: REGION, zoneRowCount: zoneRowCountValue, zoom })
        ).toBeCloseTo(fitted * zoom, 9);
      }
    }
  });

  it('clamps the multiplier inside the row height itself, so no caller can skip the range', () => {
    const fitted = proRowHeight({ notesRegionHeight: REGION });
    expect(proRowHeight({ notesRegionHeight: REGION, zoom: 99 })).toBeCloseTo(
      fitted * PRO_ZOOM_MAX,
      9
    );
    expect(proRowHeight({ notesRegionHeight: REGION, zoom: 0 })).toBeCloseTo(
      fitted * PRO_ZOOM_MIN,
      9
    );
  });

  it('keeps a zoomed-out row drawable, and never inflates one above the fit', () => {
    //a landscape phone framing the widest instrument: the fit is already thin, and half of it must
    //still be a row something can be drawn in
    const rows = zoneRowCount(editableZone(WIDEST, 'C'));
    const tiny = (rows + ROW_HEIGHT_FRAMING_ROWS) * 3;
    const fitted = proRowHeight({ notesRegionHeight: tiny, zoneRowCount: rows });
    expect(fitted).toBe(3);
    expect(proRowHeight({ notesRegionHeight: tiny, zoneRowCount: rows, zoom: PRO_ZOOM_MIN })).toBe(
      PRO_MIN_ROW_HEIGHT_PX
    );
    //...and where the FIT is already under the floor (a region measured before layout), zooming out
    //stops moving rather than making rows taller than the region fits
    const degenerate = { notesRegionHeight: 1, zoneRowCount: rows };
    const degenerateFit = proRowHeight(degenerate);
    expect(degenerateFit).toBeLessThan(PRO_MIN_ROW_HEIGHT_PX);
    expect(proRowHeight({ ...degenerate, zoom: PRO_ZOOM_MIN })).toBe(degenerateFit);
    //zooming IN is never floored - it only ever makes rows taller
    expect(proRowHeight({ ...degenerate, zoom: PRO_ZOOM_MAX })).toBeCloseTo(
      degenerateFit * PRO_ZOOM_MAX,
      9
    );
  });

  it('rides on the layer\'s own fit, so a switch keeps the magnification', () => {
    //the two shipped extremes of reach, at one zoom: each keeps ITS fit, times the same factor -
    //which is what makes "the fitted base changes under the multiplier" true
    const zoom = 1.75;
    for (const name of [WIDEST, NARROWEST]) {
      const rows = zoneRowCount(editableZone(name, 'C'));
      const fitted = proRowHeight({ notesRegionHeight: REGION, zoneRowCount: rows });
      expect(proRowHeight({ notesRegionHeight: REGION, zoneRowCount: rows, zoom })).toBeCloseTo(
        fitted * zoom,
        9
      );
    }
    //...and the two are still different row heights, so the switch really did re-fit under it
    const wide = proRowHeight({
      notesRegionHeight: REGION,
      zoneRowCount: zoneRowCount(editableZone(WIDEST, 'C')),
      zoom,
    });
    const narrow = proRowHeight({
      notesRegionHeight: REGION,
      zoneRowCount: zoneRowCount(editableZone(NARROWEST, 'C')),
      zoom,
    });
    expect(narrow).toBeGreaterThan(wide);
  });

  it('keeps the focal point\'s row at the same screen y', () => {
    const geometry = { axis: AXIS, notesRegionHeight: REGION };
    const cameraY = ROW * 7;
    //a row a third of the way down the region, which is where a pointer usually is
    const focalY = REGION / 3;
    const number = numberAtY({ axis: AXIS, y: focalY, cameraY, rowHeight: ROW })!;
    const before = yForNumber({ axis: AXIS, number, rowHeight: ROW, cameraY });
    for (const zoom of [1.25, 2, 0.6]) {
      const nextRowHeight = ROW * zoom;
      const next = zoomedCameraY({ ...geometry, cameraY, focalY, rowHeight: ROW, nextRowHeight });
      //the row under the finger is where it was, to the pixel the scale allows: the focal OFFSET
      //inside that row scales with the row, so the row's own top moves by at most one scaled row
      const after = yForNumber({ axis: AXIS, number, rowHeight: nextRowHeight, cameraY: next });
      expect(Math.abs(after - before)).toBeLessThanOrEqual(Math.abs(nextRowHeight - ROW) + 1e-9);
      //...and the axis POSITION under the focal point is exactly preserved, which is the formula
      expect((next + focalY) / nextRowHeight).toBeCloseTo((cameraY + focalY) / ROW, 9);
    }
  });

  it('stays inside the travel, and pins an axis shorter than the region to its top', () => {
    const geometry = { axis: AXIS, notesRegionHeight: REGION };
    //zoomed in at the very bottom of the axis: the camera cannot go past the travel's end
    const deep = zoomedCameraY({
      ...geometry,
      cameraY: maxCameraY({ axis: AXIS, rowHeight: ROW, notesRegionHeight: REGION }),
      focalY: REGION,
      rowHeight: ROW,
      nextRowHeight: ROW * PRO_ZOOM_MAX,
    });
    expect(deep).toBeLessThanOrEqual(
      maxCameraY({ axis: AXIS, rowHeight: ROW * PRO_ZOOM_MAX, notesRegionHeight: REGION })
    );
    expect(deep).toBeGreaterThanOrEqual(0);
    //...and zoomed far enough out that the whole axis is shorter than the region, the existing
    //clamp collapses the travel and the axis sits at the region's top - the degenerate case needs
    //no branch of its own
    const shortRow = REGION / (AXIS.rowCount * 2);
    expect(maxCameraY({ axis: AXIS, rowHeight: shortRow, notesRegionHeight: REGION })).toBe(0);
    expect(
      zoomedCameraY({ ...geometry, cameraY: ROW * 20, focalY: 10, rowHeight: ROW, nextRowHeight: shortRow })
    ).toBe(0);
    //a row height of 0 (a region measured before layout) has no ratio; the camera is only clamped
    expect(
      zoomedCameraY({ ...geometry, cameraY: -50, focalY: 10, rowHeight: 0, nextRowHeight: ROW })
    ).toBe(0);
  });
});

describe('the visible row window', () => {
  const geometry = { axis: AXIS, rowHeight: ROW, notesRegionHeight: REGION };

  it('is exactly the rows the region overlaps, with the camera on a row boundary', () => {
    //REGION_ROWS whole rows and not one more: the row starting exactly at the region's bottom edge
    //is outside, the same strict test isColumnVisible makes horizontally
    expect(visibleRowRange({ ...geometry, cameraY: 0 })).toEqual({
      first: 0,
      last: REGION_ROWS - 1,
    });
    expect(visibleRowRange({ ...geometry, cameraY: ROW * 5 })).toEqual({
      first: 5,
      last: 5 + REGION_ROWS - 1,
    });
  });

  it('includes both partial rows when the camera sits between two', () => {
    const { first, last } = visibleRowRange({ ...geometry, cameraY: ROW * 5 + ROW / 2 });
    expect({ first, last }).toEqual({ first: 5, last: 5 + REGION_ROWS });
    //...which is one row MORE than the region is tall, because two of them are half shown
    expect(last - first + 1).toBe(REGION_ROWS + 1);
  });

  it('is the closed form of the overlap test it states, over the whole axis', () => {
    for (const cameraY of [0, 1, ROW / 3, ROW * 7, ROW * 7.5, maxCameraY(geometry)]) {
      const { first, last } = visibleRowRange({ ...geometry, cameraY });
      for (let row = 0; row < AXIS.rowCount; row++) {
        const top = row * ROW - cameraY;
        const overlaps = top + ROW > 0 && top < REGION;
        expect(row >= first && row <= last).toBe(overlaps);
      }
    }
  });

  it('never reports a row the axis does not have', () => {
    const top = visibleRowRange({ ...geometry, cameraY: 0 });
    expect(top.first).toBe(0);
    const bottom = visibleRowRange({ ...geometry, cameraY: maxCameraY(geometry) });
    expect(bottom.last).toBe(AXIS.rowCount - 1);
  });

  it('shows no row at all when the region has not been measured yet', () => {
    //`last < first` is the empty answer, which is what a region measured before layout produces -
    //the strip pools nothing and a column culls every note rather than dividing by zero
    const { first, last } = visibleRowRange({ ...geometry, rowHeight: 0, cameraY: 0 });
    expect(last).toBeLessThan(first);
  });
});

describe('the camera', () => {
  const geometry = { axis: AXIS, rowHeight: ROW, notesRegionHeight: REGION };

  it('places a row at its own offset, minus the camera', () => {
    expect(yForNumber({ ...geometry, number: AXIS.max, cameraY: 0 })).toBe(0);
    expect(yForNumber({ ...geometry, number: AXIS.max - 1, cameraY: 0 })).toBe(ROW);
    //higher pitch = higher on screen, at any camera
    expect(yForNumber({ ...geometry, number: 61, cameraY: 137 })).toBe(
      yForNumber({ ...geometry, number: 60, cameraY: 137 }) - ROW
    );
  });

  it('travels from the axis top to the axis bottom, and no further', () => {
    expect(maxCameraY(geometry)).toBe(AXIS.rowCount * ROW - REGION);
    expect(clampCameraY({ ...geometry, cameraY: -500 })).toBe(0);
    expect(clampCameraY({ ...geometry, cameraY: 1e9 })).toBe(maxCameraY(geometry));
    expect(clampCameraY({ ...geometry, cameraY: ROW * 3 })).toBe(ROW * 3);
    //at the far end the axis' last row is flush with the region's bottom
    const bottom =
      yForNumber({ ...geometry, number: AXIS.min, cameraY: maxCameraY(geometry) }) + ROW;
    expect(bottom).toBe(REGION);
  });

  it('centres the current track Editable Zone when locked — full-range instrument', () => {
    const zone = editableZone(WIDEST, 'C');
    const cameraY = lockedCameraY({ ...geometry, zone });
    const above = yForNumber({ ...geometry, number: zone.max, cameraY });
    const below = REGION - (yForNumber({ ...geometry, number: zone.min, cameraY }) + ROW);
    expect(cameraY).toBeGreaterThan(0);
    expect(cameraY).toBeLessThan(maxCameraY(geometry));
    //equal gaps above the zone's top row and below its bottom one: that IS "centred"
    expect(above).toBeCloseTo(below, 9);
  });

  it('centres a SMALL instrument too, or pins it to the nearest axis end', () => {
    //a drums/SFX kit: its zone is far shorter than the region, so centring it can ask for a camera
    //outside the travel (sky's 6-button SFX kit does exactly that at Basepoint C)
    const zone = editableZone(NARROWEST, 'C');
    const cameraY = lockedCameraY({ ...geometry, zone });
    expect(cameraY).toBeGreaterThanOrEqual(0);
    expect(cameraY).toBeLessThanOrEqual(maxCameraY(geometry));
    //however it lands, the whole zone is on screen — a zone this short always fits
    expect(yForNumber({ ...geometry, number: zone.max, cameraY })).toBeGreaterThanOrEqual(0);
    expect(yForNumber({ ...geometry, number: zone.min, cameraY }) + ROW).toBeLessThanOrEqual(REGION);
  });

  it('holds the whole roster inside the travel, centred unless the axis end stops it', () => {
    for (const name of ALL_INSTRUMENTS) {
      for (const pitch of ALL_PITCHES) {
        const zone = editableZone(name, pitch);
        const cameraY = lockedCameraY({ ...geometry, zone });
        expect(cameraY).toBeGreaterThanOrEqual(0);
        expect(cameraY).toBeLessThanOrEqual(maxCameraY(geometry));
        const centred =
          ((rowForNumber(AXIS, zone.max) + rowForNumber(AXIS, zone.min) + 1) / 2) * ROW - REGION / 2;
        //exactly the centring, or exactly an end of the travel — never anything in between
        expect(cameraY === centred || cameraY === 0 || cameraY === maxCameraY(geometry)).toBe(true);
      }
    }
  });

  it('pins to an axis edge rather than scrolling past it', () => {
    //a one-row zone on the axis' top/bottom row: the framing a hypothetical single-button
    //instrument sitting in the padding would ask for, and the sharpest form of both clamps
    expect(lockedCameraY({ ...geometry, zone: { min: AXIS.max, max: AXIS.max } })).toBe(0);
    expect(lockedCameraY({ ...geometry, zone: { min: AXIS.min, max: AXIS.min } })).toBe(
      maxCameraY(geometry)
    );
  });

  it('collapses the travel to 0 when the axis is SHORTER than the region', () => {
    //degenerate, but reachable the moment a caller measures a region taller than the axis is long;
    //the axis is pinned to the region's top rather than allowed to drift out of view
    const shortAxis: ProViewAxis = { min: 60, max: 71, rowCount: 12 };
    const short = { axis: shortAxis, rowHeight: ROW, notesRegionHeight: REGION_ROWS * ROW * 4 };
    expect(maxCameraY(short)).toBe(0);
    expect(clampCameraY({ ...short, cameraY: 999 })).toBe(0);
    expect(lockedCameraY({ ...short, zone: { min: 60, max: 71 } })).toBe(0);
    expect(yForNumber({ ...short, number: shortAxis.max, cameraY: 0 })).toBe(0);
  });
});

describe('the Editable Zone', () => {
  it('is exactly the numbers the instrument can voice at that Basepoint', () => {
    //the zone and noteIds' button lookup are the same shift of the same table; this is what lets
    //the renderer ask a SET per frame instead of probing every visible row
    for (const name of ALL_INSTRUMENTS) {
      for (const pitch of ALL_PITCHES) {
        const zone = editableZone(name, pitch);
        for (let number = AXIS.min; number <= AXIS.max; number++) {
          expect(isAddable(zone, number)).toBe(numberToButton(name, pitch, number) !== -1);
        }
        expect(zone.min).toBe(Math.min(...zone.numbers));
        expect(zone.max).toBe(Math.max(...zone.numbers));
      }
    }
  });

  it('moves with the Basepoint, by the Basepoint own interval', () => {
    const atC = editableZone(WIDEST, 'C');
    for (const pitch of ALL_PITCHES) {
      const offset = basepointOffset(pitch);
      const zone = editableZone(WIDEST, pitch);
      expect(zone.min).toBe(atC.min + offset);
      expect(zone.max).toBe(atC.max + offset);
      expect([...zone.numbers].sort((a, b) => a - b)).toEqual(
        [...atC.numbers].sort((a, b) => a - b).map((n) => n + offset)
      );
    }
  });

  it('has rows INSIDE the band that accept no note', () => {
    //a diatonic instrument skips semitones, so "between the two lines" is not "addable" — those
    //rows are the ones the Pro View stripes and leaves inert
    const zone = editableZone(WIDEST, 'C');
    const inert: number[] = [];
    for (let number = zone.min; number <= zone.max; number++) {
      if (!isAddable(zone, number)) inert.push(number);
    }
    expect(inert.length).toBeGreaterThan(0);
    expect(zone.max - zone.min + 1).toBeGreaterThan(zone.numbers.size);
    //the two ENDS are always addable, though — they are buttons by definition
    expect(isAddable(zone, zone.min)).toBe(true);
    expect(isAddable(zone, zone.max)).toBe(true);
  });

  it('follows a per-track Basepoint override, and the song Basepoint without one', () => {
    const override = new InstrumentData({ name: WIDEST, pitch: 'D' });
    const plain = new InstrumentData({ name: WIDEST });
    const songPitch: Pitch = 'C';
    //effectiveTrackPitch is the one spelling of "which Basepoint does this track answer at"
    const overridden = editableZone(WIDEST, effectiveTrackPitch(override, songPitch));
    const followed = editableZone(WIDEST, effectiveTrackPitch(plain, songPitch));
    expect(overridden).toEqual(editableZone(WIDEST, 'D'));
    expect(followed).toEqual(editableZone(WIDEST, 'C'));
    expect(overridden.min - followed.min).toBe(basepointOffset('D'));
    //...and the song's own Basepoint no longer reaches the overridden track
    expect(editableZone(WIDEST, effectiveTrackPitch(override, 'Eb'))).toEqual(overridden);
  });

  describe('with Assigned Buttons', () => {
    it('this game ships one', () => {
      //guards the row below from going vacuous
      expect(ASSIGNED.length).toBeGreaterThan(0);
    });

    it('carries an Assigned Button by its own Nominal Id', () => {
      //percussion, SFX and chord strums have no Sounding Pitch, so what enters the zone is the
      //button's Nominal Id lifted by the Basepoint — two Assigned Buttons never collapse
      for (const name of ASSIGNED) {
        for (const pitch of ALL_PITCHES) {
          const zone = editableZone(name, pitch);
          for (const note of notesOf(name)) {
            if (note.pitched) continue;
            expect(isAddable(zone, note.midi + basepointOffset(pitch))).toBe(true);
          }
        }
      }
    });
  });

  describe('on a TUNED instrument (genshin Vintage-Lyre)', () => {
    it('addresses the pitch it SOUNDS, not the row its label prints', () => {
      for (const name of TUNED) {
        const zone = editableZone(name, 'C');
        for (const note of notesOf(name)) {
          if (!note.pitched || note.sounding === note.midi) continue;
          expect(isAddable(zone, note.sounding)).toBe(true);
          //...and the nominal it is labelled with is addable only if some OTHER button sounds it
          expect(isAddable(zone, note.midi)).toBe(
            getSoundingTable(name).includes(note.midi)
          );
        }
      }
    });

    it('pins Vintage-Lyre exact zone, on the build that ships it', () => {
      if (!ALL_INSTRUMENTS.includes('Vintage-Lyre')) return;
      const zone = editableZone('Vintage-Lyre', 'C');
      //its top button is labelled B5 (83) and sounds Bb5 (82) — the audit's own numbers
      expect(zone.max).toBe(82);
      expect(zone.min).toBe(48);
      expect(isAddable(zone, 83)).toBe(false);
      //flats the Song Grid has no row for are addable here, which is the whole reason the Pro View
      //exists: the Compressed View can only draw them nearest-row with a hint
      expect(isAddable(zone, 51)).toBe(true);
      expect(isAccidentalMidi(51)).toBe(true);
      //the nominal set and the zone are genuinely different sets on this instrument
      expect([...zone.numbers].sort((a, b) => a - b)).not.toEqual(
        [...getNoteIdTable('Vintage-Lyre')].sort((a, b) => a - b)
      );
    });
  });

  it('pins Ukulele chord row, on the build that ships it', () => {
    if (!ALL_INSTRUMENTS.includes('Ukulele')) return;
    //genshin's Ukulele top row is C..G7 chord strums (ADR-0007), Assigned Buttons every one
    const chords = notesOf('Ukulele').filter((note) => !note.pitched);
    expect(chords.length).toBe(7);
    const zone = editableZone('Ukulele', 'C');
    for (const chord of chords) expect(isAddable(zone, chord.midi)).toBe(true);
    //at another Basepoint the whole row moves with everything else
    const raised = editableZone('Ukulele', 'Db');
    for (const chord of chords) expect(isAddable(raised, chord.midi + 1)).toBe(true);
  });
});

describe('tap resolution', () => {
  const geometry = { axis: AXIS, rowHeight: ROW };

  it('is yForNumber inverse, at any camera', () => {
    for (const cameraY of [0, ROW * 7.5, maxCameraY({ ...geometry, notesRegionHeight: REGION })]) {
      for (let number = AXIS.min; number <= AXIS.max; number++) {
        const top = yForNumber({ ...geometry, number, cameraY });
        expect(numberAtY({ ...geometry, cameraY, y: top })).toBe(number);
        expect(numberAtY({ ...geometry, cameraY, y: top + ROW / 2 })).toBe(number);
        //the row's bottom edge belongs to the NEXT row down, which is a semitone lower — off the
        //bottom of the axis there is no next row, and that is the null case below
        expect(numberAtY({ ...geometry, cameraY, y: top + ROW })).toBe(
          number > AXIS.min ? number - 1 : null
        );
      }
    }
  });

  it('answers null off the axis rather than a number nothing can own', () => {
    //null and not -1: every integer is a legal Note Number here, so no number is free to be a
    //sentinel
    const cameraY = 0;
    expect(numberAtY({ ...geometry, cameraY, y: -1 })).toBe(null);
    expect(numberAtY({ ...geometry, cameraY, y: AXIS.rowCount * ROW })).toBe(null);
    expect(numberAtY({ ...geometry, cameraY, y: AXIS.rowCount * ROW - 1 })).toBe(AXIS.min);
    //a region measured before layout, and a corrupt pointer event
    expect(numberAtY({ ...geometry, rowHeight: 0, cameraY, y: 10 })).toBe(null);
    expect(numberAtY({ ...geometry, cameraY, y: NaN })).toBe(null);
    expect(numberAtY({ ...geometry, cameraY: NaN, y: 10 })).toBe(null);
  });

  it('feeds numberToButton, which is what phase D dispatches on', () => {
    const zone = editableZone(WIDEST, 'C');
    const cameraY = lockedCameraY({ ...geometry, zone, notesRegionHeight: REGION });
    const tap = (number: number) =>
      numberAtY({
        ...geometry,
        cameraY,
        y: yForNumber({ ...geometry, number, cameraY }) + ROW / 2,
      });
    //an addable row resolves to a real button of the current track's instrument
    expect(numberToButton(WIDEST, 'C', tap(zone.max)!)).toBeGreaterThanOrEqual(0);
    //a padding row is a row of the axis (it resolves), and inert (no instrument reaches it)
    const padding = AXIS.max;
    expect(tap(padding)).toBe(padding);
    expect(numberToButton(WIDEST, 'C', padding)).toBe(-1);
    for (const name of ALL_INSTRUMENTS) {
      for (const pitch of ALL_PITCHES) expect(numberToButton(name, pitch, padding)).toBe(-1);
    }
  });
});

describe('noteNameForMidi', () => {
  it('numbers octaves the way MIDI does, C4 = 60', () => {
    expect(noteNameForMidi(60)).toBe('C4');
    expect(noteNameForMidi(71)).toBe('B4');
    expect(noteNameForMidi(72)).toBe('C5');
    //the octave rolls at C, never at A
    expect(noteNameForMidi(59)).toBe('B3');
  });

  it('spells accidentals with the sharp the composer already prints', () => {
    expect(noteNameForMidi(61)).toBe('C#4');
    expect(noteNameForMidi(63)).toBe('D#4');
    expect(noteNameForMidi(66)).toBe('F#4');
    expect(noteNameForMidi(68)).toBe('G#4');
    expect(noteNameForMidi(70)).toBe('A#4');
  });

  it('holds at the ends of MIDI, and below them', () => {
    expect(noteNameForMidi(0)).toBe('C-1');
    expect(noteNameForMidi(127)).toBe('G9');
    //a Basepoint-rewritten strand in an already-weird file can go under 0, and the axis draws it
    expect(noteNameForMidi(-1)).toBe('B-2');
    expect(noteNameForMidi(-12)).toBe('C-2');
  });

  it('agrees with the Song Grid about which rows are accidental', () => {
    //true while a game's grid IS the natural pitch classes, which both shipped games' are — the
    //assertion above the loop is what makes the loop meaningful rather than circular
    const naturals = [0, 2, 4, 5, 7, 9, 11];
    const gridClasses = new Set(
      [...Array(12).keys()].filter((pitchClass) => !isAccidentalMidi(pitchClass))
    );
    expect([...gridClasses].sort((a, b) => a - b)).toEqual(naturals);
    for (let number = AXIS.min; number <= AXIS.max; number++) {
      expect(noteNameForMidi(number).includes('#')).toBe(isAccidentalMidi(number));
    }
  });

  it('names every row of the axis exactly once', () => {
    const names = new Set<string>();
    for (let number = AXIS.min; number <= AXIS.max; number++) names.add(noteNameForMidi(number));
    expect(names.size).toBe(AXIS.rowCount);
  });
});
