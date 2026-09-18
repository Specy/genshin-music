/**
 * WHAT THE PRO VIEW DRAWS OVER ITS AXIS (spec §6 / §10, phase C): the per-Note-Number layer
 * statuses, the stranded marks that dim and label a note, the axis-widening span of a song, and the
 * row-label strip's wording. proViewGeometry owns the rows and the camera; this is everything the
 * SONG and the roster decide on them.
 *
 * GAME-AGNOSTIC BY CONSTRUCTION, like test/proViewGeometry.test.ts beside it: the instruments and
 * the numbers come from CONFIG CAPABILITY (what does the default instrument voice? what lies outside
 * every instrument's reach? which pitch class has no row on this game's grid?), never from APP_NAME,
 * so both PUBLIC_GAMEs run the same rows.
 *
 * THE CONTRAST THAT MATTERS is with the Compressed View's noteIds helpers, which these deliberately
 * do NOT reuse: those fold a number onto a Song-Grid row and can drop it, while here every number is
 * its own row and nothing is dropped. Several rows below state exactly that difference.
 */
import { describe, expect, it } from 'vitest';
import { INSTRUMENTS, INSTRUMENTS_DATA, InstrumentData, NoteColumn } from './imports';
import type { ColumnNote } from './imports';
import {
  computeNumberLayerStatuses,
  computeNumberStrandedMarks,
  proRowLabel,
  songNumberSpan,
} from '$cmp/pages/Composer/proViewNotes';
import {
  addressableSpan,
  basepointOffset,
  getSoundingTable,
  isAccidentalMidi,
  noteNameForMidi,
  numberToButton,
} from '$core/Songs/noteIds';
import type { Pitch } from '$core/legacyConfig';

const DEFAULT_INSTRUMENT = INSTRUMENTS[0];
/** A second instrument to put another track on; the roster is guaranteed to hold at least two. */
const OTHER_INSTRUMENT = INSTRUMENTS[1] ?? INSTRUMENTS[0];
const SONG_PITCH: Pitch = 'C';

/** A Note Number the default instrument really voices at the song's Basepoint. */
const VOICED = getSoundingTable(DEFAULT_INSTRUMENT)[0] + basepointOffset(SONG_PITCH);
/** ...and one no instrument reaches at any Basepoint, which is what makes it a Stranded Note. */
const BELOW_EVERYTHING = addressableSpan().min - 5;

const track = (data: Partial<InstrumentData>) => new InstrumentData(data);
const note = (trackIndex: number, id: number): ColumnNote => ({ trackIndex, id, span: 1 });

function columnOf(notes: ColumnNote[]): NoteColumn {
  const column = new NoteColumn();
  for (const one of notes) column.addNote(one);
  return column;
}

describe('the axis-widening span of a song', () => {
  it('is null for a song holding no note at all', () => {
    expect(songNumberSpan([])).toBeNull();
    expect(songNumberSpan([new NoteColumn(), new NoteColumn()])).toBeNull();
  });

  it('is the min and max over every column and every track', () => {
    const columns = [
      columnOf([note(0, VOICED), note(1, VOICED + 7)]),
      new NoteColumn(),
      columnOf([note(1, BELOW_EVERYTHING), note(0, VOICED + 2)]),
    ];
    expect(songNumberSpan(columns)).toEqual({ min: BELOW_EVERYTHING, max: VOICED + 7 });
  });
});

describe('the per-number layer statuses', () => {
  const instruments = [
    track({ name: DEFAULT_INSTRUMENT }),
    track({ name: OTHER_INSTRUMENT, icon: 'line' }),
    track({ name: OTHER_INSTRUMENT, icon: 'border', visible: false }),
  ];

  it('sets bit 0 for the current layer and the icon bit for another VISIBLE track', () => {
    const statuses = computeNumberLayerStatuses(
      [note(0, VOICED), note(1, VOICED + 3)],
      0,
      instruments
    );
    expect(statuses.get(VOICED)).toBe(1);
    expect(statuses.get(VOICED + 3)).toBe(1 << instruments[1].toNoteIcon());
  });

  it('combines the two when both tracks hold the same number', () => {
    const statuses = computeNumberLayerStatuses([note(0, VOICED), note(1, VOICED)], 0, instruments);
    expect(statuses.get(VOICED)).toBe(1 | (1 << instruments[1].toNoteIcon()));
  });

  it('leaves a hidden track contributing nothing, so its number draws no sprite', () => {
    //status 0 is what ColumnView.paintProNotes skips on - a hidden layer's note is not drawn, and
    //its number must not be lit by the mere presence of the entry
    const statuses = computeNumberLayerStatuses([note(2, VOICED)], 0, instruments);
    expect(statuses.get(VOICED)).toBe(0);
  });

  it('keeps a number no instrument in the game can voice, which the Song-Grid view could not', () => {
    //THE POINT OF THE VIEW: a strand a semitone below every instrument's reach still has a row, so
    //it is visible (and, from phase D, deletable) instead of being folded onto a neighbour
    const statuses = computeNumberLayerStatuses([note(0, BELOW_EVERYTHING)], 0, instruments);
    expect(statuses.get(BELOW_EVERYTHING)).toBe(1);
  });
});

describe('the stranded marks', () => {
  const instruments = [track({ name: DEFAULT_INSTRUMENT }), track({ name: DEFAULT_INSTRUMENT })];

  it('marks nothing when the note s own track voices it', () => {
    expect(computeNumberStrandedMarks([note(0, VOICED)], instruments, SONG_PITCH).size).toBe(0);
  });

  it('marks a number the track cannot voice, and the glyph says why', () => {
    const marks = computeNumberStrandedMarks([note(0, BELOW_EVERYTHING)], instruments, SONG_PITCH);
    //the pair carries the REASON here rather than an off-by-a-semitone direction (the Compressed
    //View's meaning): sharp for a pitch class the game's grid has no row for, flat for an on-scale
    //number this instrument merely does not have
    expect(marks.get(BELOW_EVERYTHING)).toBe(isAccidentalMidi(BELOW_EVERYTHING) ? 1 : -1);
  });

  it('spells an off-scale strand sharp and an on-scale one flat', () => {
    //one number of each kind, found by pitch class rather than assumed - a game whose grid is not
    //the white keys gets the same two cases
    const offScale = [0, 1, 2].map((i) => BELOW_EVERYTHING - i).find((n) => isAccidentalMidi(n));
    const onScale = [0, 1, 2].map((i) => BELOW_EVERYTHING - i).find((n) => !isAccidentalMidi(n));
    expect(offScale).toBeDefined();
    expect(onScale).toBeDefined();
    const marks = computeNumberStrandedMarks(
      [note(0, offScale!), note(0, onScale!)],
      instruments,
      SONG_PITCH
    );
    expect(marks.get(offScale!)).toBe(1);
    expect(marks.get(onScale!)).toBe(-1);
  });

  it('asks the note s OWN track, so a per-track Basepoint override moves the answer', () => {
    //the same number, two tracks, one of which is transposed - whichever of the two can voice it
    //decides for ITS note and not for the other's
    const shifted: Pitch = 'D';
    const roster = [
      track({ name: DEFAULT_INSTRUMENT }),
      track({ name: DEFAULT_INSTRUMENT, pitch: shifted }),
    ];
    const onlyShifted = getSoundingTable(DEFAULT_INSTRUMENT)[0] + basepointOffset(shifted);
    //a precondition, so the row fails loudly rather than passing vacuously if the two Basepoints
    //ever stop differing
    expect(numberToButton(DEFAULT_INSTRUMENT, SONG_PITCH, onlyShifted)).toBe(
      getSoundingTable(DEFAULT_INSTRUMENT).indexOf(onlyShifted - basepointOffset(SONG_PITCH))
    );
    expect(computeNumberStrandedMarks([note(1, onlyShifted)], roster, SONG_PITCH).size).toBe(0);
  });

  it('lets a healthy contributor clear the mark the sprite they share would otherwise carry', () => {
    const roster = [
      //track 0 is transposed away from the number; track 1 voices it at the song's Basepoint
      track({ name: DEFAULT_INSTRUMENT, pitch: 'B' }),
      track({ name: DEFAULT_INSTRUMENT }),
    ];
    const strandedAlone = computeNumberStrandedMarks([note(0, VOICED)], roster, SONG_PITCH);
    //precondition: the transposed track really cannot voice it, or the row proves nothing
    expect(strandedAlone.has(VOICED)).toBe(true);
    const shared = computeNumberStrandedMarks(
      [note(0, VOICED), note(1, VOICED)],
      roster,
      SONG_PITCH
    );
    expect(shared.has(VOICED)).toBe(false);
  });
});

describe('the row-label strip s wording', () => {
  //the keyboard's own getNoteText, faked: what matters is that the strip PRINTS what it is handed
  //rather than deriving a second spelling of its own
  const keyboard = (button: number) => `key${button}`;

  it('prints the button s label, exactly as handed over, for a row that is a key', () => {
    expect(proRowLabel(VOICED, 4, keyboard)).toEqual({ number: VOICED, text: 'key4', faint: false });
  });

  it('prints a faint absolute pitch name for a row that is no key', () => {
    expect(proRowLabel(BELOW_EVERYTHING, -1, keyboard)).toEqual({
      number: BELOW_EVERYTHING,
      text: noteNameForMidi(BELOW_EVERYTHING),
      faint: true,
    });
  });

  it('falls back to that name when the wording is empty, so No Text leaves a readable axis', () => {
    expect(proRowLabel(VOICED, 0, () => '')).toEqual({
      number: VOICED,
      text: noteNameForMidi(VOICED),
      faint: true,
    });
  });

  it('names a real button of a real instrument the way that instrument s table does', () => {
    //not a claim about wording (that is the keyboard's), but about the BUTTON reaching the label
    //function at all: the strip resolves the row through numberToButton first
    const button = numberToButton(DEFAULT_INSTRUMENT, SONG_PITCH, VOICED);
    expect(button).toBeGreaterThanOrEqual(0);
    expect(INSTRUMENTS_DATA[DEFAULT_INSTRUMENT].notes[button]).toBeDefined();
    expect(proRowLabel(VOICED, button, keyboard).text).toBe(`key${button}`);
  });
});
