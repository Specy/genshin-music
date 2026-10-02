import { describe, expect, it } from 'vitest';
import {
  ComposerTimelineMinimapBuilder,
  COMPOSER_TIMELINE_MINIMAP_CONFIG,
  type ComposerTimelineMinimapSink,
} from '$cmp/pages/Composer/composerTimelineMinimap';
import {
  CANONICAL_NOTE_IDS,
  COMPOSER_NOTE_POSITIONS,
  INSTRUMENTS,
  INSTRUMENTS_DATA,
  InstrumentData,
  NOTES_PER_COLUMN,
  NoteColumn,
  TEMPO_CHANGERS,
} from './imports';

interface RectOp {
  x: number;
  y: number;
  width: number;
  height: number;
  style: { color: number; alpha: number };
}

function recordingSink(): { sink: ComposerTimelineMinimapSink; ops: RectOp[] } {
  const ops: RectOp[] = [];
  return {
    ops,
    sink: {
      rect(x, y, width, height, style) {
        ops.push({ x, y, width, height, style });
      },
    },
  };
}

/**
 * The Note Number a button enters at Basepoint C — what a song stores since ADR-0007, and
 * deliberately NOT `note.nominal`: on a tuned instrument the nominal is a number no button
 * sounds, so a song built from nominals would draw every note dimmed as a Stranded Note.
 */
function noteNumber(instrument: (typeof INSTRUMENTS)[number], button: number): number {
  return INSTRUMENTS_DATA[instrument].notes[button].sounding;
}

describe('ComposerTimelineMinimapBuilder', () => {
  it('draws tempo backgrounds, tails, and heads in complete passes one column per call', () => {
    const columns = [new NoteColumn(), new NoteColumn(), new NoteColumn()];
    columns[0].addNote(0, noteNumber(INSTRUMENTS[0], 0), 3);
    columns[1].addNote(1, noteNumber(INSTRUMENTS[1], 1));
    columns[1].tempoChanger = 1;
    const instruments = [
      new InstrumentData({ name: INSTRUMENTS[0], icon: 'circle' }),
      new InstrumentData({ name: INSTRUMENTS[1], icon: 'border', visible: true }),
    ];
    const { sink, ops } = recordingSink();
    const builder = new ComposerTimelineMinimapBuilder(
      {
        columns,
        instruments,
        songPitch: 'C',
        currentLayer: 0,
        width: 300,
        height: 36.4,
        palette: { current: 0xff0000, visible: 0x00ff00 },
        showSustainTails: true,
      },
      sink
    );

    expect(builder.drawNextColumn()).toBe(false);
    expect(ops).toHaveLength(0);
    expect(builder.drawNextColumn()).toBe(false);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({
      x: 100,
      y: 0,
      width: 100,
      height: 36.4,
      style: { color: TEMPO_CHANGERS[1].color, alpha: 1 },
    });
    expect(builder.drawNextColumn()).toBe(false);
    //The fourth call is the first tail column: every background completed before this mark.
    expect(builder.drawNextColumn()).toBe(false);
    expect(ops).toHaveLength(2);
    expect(ops[1].style).toEqual({ color: 0xff0000, alpha: 0.5 });
    expect(builder.drawNextColumn()).toBe(false);
    expect(builder.drawNextColumn()).toBe(false);
    //The seventh call is the first head column: the entire tail pass completed before this mark.
    expect(builder.drawNextColumn()).toBe(false);
    expect(ops[2].style).toEqual({ color: 0xff0000, alpha: 0.95 });
    expect(builder.drawNextColumn()).toBe(false);
    expect(builder.drawNextColumn()).toBe(true);
    expect(ops.at(-1)?.style).toEqual({ color: 0x00ff00, alpha: 0.68 });
  });

  it('omits hidden secondary tracks and can compile out sustain tails through source config', () => {
    expect(COMPOSER_TIMELINE_MINIMAP_CONFIG.showSustainTails).toBe(true);
    const column = new NoteColumn();
    column.addNote(1, noteNumber(INSTRUMENTS[1], 0), 4);
    const hiddenInstruments = [
      new InstrumentData({ name: INSTRUMENTS[0] }),
      new InstrumentData({ name: INSTRUMENTS[1], icon: 'border', visible: false }),
    ];
    const hidden = recordingSink();
    const hiddenBuilder = new ComposerTimelineMinimapBuilder(
      {
        columns: [column],
        instruments: hiddenInstruments,
        songPitch: 'C',
        currentLayer: 0,
        width: 100,
        height: 36.4,
        palette: { current: 1, visible: 2 },
        showSustainTails: true,
      },
      hidden.sink
    );
    expect(hiddenBuilder.drawNextColumn()).toBe(false);
    expect(hiddenBuilder.drawNextColumn()).toBe(false);
    expect(hiddenBuilder.drawNextColumn()).toBe(true);
    expect(hidden.ops).toEqual([]);

    column.notes[0].trackIndex = 0;
    const headsOnly = recordingSink();
    const headsOnlyBuilder = new ComposerTimelineMinimapBuilder(
      {
        columns: [column],
        instruments: hiddenInstruments,
        songPitch: 'C',
        currentLayer: 0,
        width: 100,
        height: 36.4,
        palette: { current: 1, visible: 2 },
        showSustainTails: false,
      },
      headsOnly.sink
    );
    expect(headsOnlyBuilder.drawNextColumn()).toBe(false);
    expect(headsOnlyBuilder.drawNextColumn()).toBe(true);
    expect(headsOnly.ops).toHaveLength(1);
    expect(headsOnly.ops[0].style).toEqual({ color: 1, alpha: 0.95 });
  });

  /**
   * ADR-0007 phase D, the minimap's whole share of it: an OFF-SCALE note - one whose Note Number
   * falls between two Song-Grid rows - takes part in exactly what a Stranded Note already takes
   * part in here, and gains NO LANE OF ITS OWN. A head is ~2px tall in this strip, so there is no
   * glyph to read at that size; the ♯/♭ belongs on the canvas, where the note is an icon.
   *
   * What the row asserts is the "no new lane" half, and it is the half a wrong fix would break:
   * one rect, at the y of the NEAREST row (the same row the canvas draws it on), dimmed by the
   * stranded factor.
   */
  it('dims an off-scale note on its nearest row, in the lane a Stranded Note already uses', () => {
    //a semitone past the top of the grid: every instrument leaves it off-scale, whatever ladder
    //the game's grid is (the canvas oracle derives its cases the same way)
    const offScale = Math.max(...CANONICAL_NOTE_IDS) + 1;
    const nearestRow = CANONICAL_NOTE_IDS.indexOf(Math.max(...CANONICAL_NOTE_IDS));
    const instruments = [new InstrumentData({ name: INSTRUMENTS[0] })];

    const onScale = new NoteColumn();
    onScale.addNote(0, noteNumber(INSTRUMENTS[0], 0));
    const off = new NoteColumn();
    off.addNote(0, offScale);
    const voiced = recordingSink();
    const strand = recordingSink();
    const build = (columns: NoteColumn[], sink: ComposerTimelineMinimapSink) => {
      const builder = new ComposerTimelineMinimapBuilder(
        {
          columns,
          instruments,
          songPitch: 'C',
          currentLayer: 0,
          width: 100,
          height: 36.4,
          palette: { current: 1, visible: 2 },
          showSustainTails: false,
        },
        sink
      );
      while (!builder.drawNextColumn());
    };
    build([onScale], voiced.sink);
    build([off], strand.sink);

    expect(voiced.ops).toHaveLength(1);
    //ONE rect for the off-scale note too: same geometry rules, same lane, no second mark
    expect(strand.ops).toHaveLength(1);
    expect(strand.ops[0].width).toBe(voiced.ops[0].width);
    expect(strand.ops[0].height).toBe(voiced.ops[0].height);
    //the NEAREST row, which is where the canvas draws it as well
    expect(strand.ops[0].y).toBe(
      2 + COMPOSER_NOTE_POSITIONS[nearestRow] * (Math.max(0, 36.4 - 4) / NOTES_PER_COLUMN)
        + (Math.max(0, 36.4 - 4) / NOTES_PER_COLUMN - strand.ops[0].height) / 2
    );
    //...dimmed by the stranded factor, exactly as an un-voiced on-scale note is
    expect(strand.ops[0].style).toEqual({ color: 1, alpha: 0.95 * 0.45 });
  });
});
