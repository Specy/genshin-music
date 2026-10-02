// WHAT THE PRO VIEW DRAWS OVER ITS AXIS, as pure functions of a song's notes and the roster —
// proViewGeometry's song-facing sibling (that module is numbers and pixels only, and says so).
//
// THE COMPRESSED VIEW'S COUNTERPARTS ARE noteIds' *Grid* helpers, and the difference is one line
// each: computeGridRowLayerStatuses folds a note onto the Song-Grid row its own track's instrument
// puts it on, while here a Note Number IS its row (CONTEXT.md: Note Number; ADR-0007 for the axis).
// Nothing else moves — the layer-status bits, the "a healthy contributor un-dims the row" rule and
// the dimmed-strand look are the Compressed View's, so the two views disagree about placement and
// about nothing else.
//
// SAME IMPORT DISCIPLINE as proViewGeometry beside it: no pixi (ComposerRenderer is behind a dynamic
// import), no DOM, and the game data comes through noteIds/legacyConfig rather than `$game`, so the
// whole module loads in plain vitest.
import type { Pitch } from '$core/legacyConfig';
import type { ColumnNote, InstrumentData, NoteColumn } from '$core/Songs/SongClasses';
import type { LayerStatus } from '$core/Songs/Layer';
import {
  effectiveTrackPitch,
  isAccidentalMidi,
  noteNameForMidi,
  numberToButton,
} from '$core/Songs/noteIds';
import { spanOfNumbers, type NumberSpan } from './proViewGeometry';

// The validated cast noteIds' own status builders use, restated rather than exported from there:
// every status this file produces is a 4-bit combination by construction, and the table is what
// turns "a number" into the union without an `as` that would also accept 17.
const LAYER_STATUSES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] as const;

/**
 * THE SONG'S OWN SPAN of Note Numbers, or null for a song holding none — what widens the axis when a
 * file carries a number no instrument can reach (proViewGeometry.proViewAxis).
 *
 * Walks the columns rather than taking a prepared list: the renderer recomputes this only when the
 * column graph moved (it caches against the same (columns, structureVersion) pair maxSpan does), so
 * the O(notes) scan is per structural edit and never per frame.
 */
export function songNumberSpan(columns: readonly NoteColumn[]): NumberSpan | null {
  return spanOfNumbers(numbersOf(columns));
}

function* numbersOf(columns: readonly NoteColumn[]): Iterable<number> {
  for (const column of columns) for (const note of column.notes) yield note.id;
}

/**
 * The Pro View's counterpart of noteIds.computeGridRowLayerStatuses: identical texture/status bits —
 * bit 0 = the current layer has a note at this Note Number, bits 1-3 = the icon classes of the other
 * VISIBLE tracks that do — keyed by the NUMBER itself.
 *
 * NOTHING IS DROPPED, which is the whole point of the view: the grid version skips a number with no
 * canonical row and folds an off-scale one onto its nearest, while every number here has a row of its
 * own — including one no instrument in the game can voice at any Basepoint, which is exactly the note
 * this canvas exists to make visible.
 */
export function computeNumberLayerStatuses(
  notes: readonly ColumnNote[],
  currentLayer: number,
  instruments: InstrumentData[]
): Map<number, LayerStatus> {
  const numbers = new Map<number, LayerStatus>();
  for (const note of notes) {
    let status: number = numbers.get(note.id) ?? 0;
    if (note.trackIndex === currentLayer) {
      status |= 1;
    } else if (instruments[note.trackIndex]?.visible) {
      status |= 1 << instruments[note.trackIndex].toNoteIcon();
    }
    numbers.set(note.id, LAYER_STATUSES[status] ?? 0);
  }
  return numbers;
}

/**
 * THE STRANDED NUMBERS of one column — the ones drawn dimmed and marked (CONTEXT.md: Stranded Note),
 * each mapped to the accidental variant of the note icon that marks it.
 *
 * STRANDED IS ASKED OF THE NOTE'S OWN TRACK, at that track's own effective Basepoint: a number is
 * stranded when `numberToButton` finds no button for it there, which is the same question the engine
 * answers when it declines to sound the note. Other tracks are irrelevant — a note perfectly voiced
 * on track 2 is not made healthy by track 1 being able to play it too.
 *
 * A HEALTHY CONTRIBUTOR CLEARS THE MARK, exactly as computeGridStrandedMarks' rule does and for the
 * same reason: two tracks can hold the same number, one voicing it and one not, and the row is drawn
 * as ONE sprite — a sprite that reads as voiced must not also claim to be unplayable.
 *
 * WHICH GLYPH, and it is a different question here than in the Compressed View. There the ♯/♭ pair
 * says which way an OFF-SCALE number sits off the row it had to be folded onto; in the Pro View a
 * number IS its row, so nothing is folded and the pair is free to carry the only fact left worth
 * marking — WHY the note cannot sound:
 *   - ♯ (+1): the number's pitch class has no row on the game's grid at all (`isAccidentalMidi`), so
 *     no instrument reaches it at any Basepoint. Reads as "this is between the game's notes".
 *   - ♭ (-1): an on-scale pitch this instrument merely does not have — out of its range, or a gap in
 *     its table — which a Basepoint change or an instrument swap can bring back into reach.
 * Both are dimmed identically; the glyph is the reason, not the severity.
 */
export function computeNumberStrandedMarks(
  notes: readonly ColumnNote[],
  instruments: InstrumentData[],
  songPitch: Pitch
): Map<number, -1 | 1> {
  const stranded = new Map<number, -1 | 1>();
  const healthy = new Set<number>();
  for (const note of notes) {
    const instrument = instruments[note.trackIndex];
    const button = numberToButton(
      instrument?.name ?? '',
      effectiveTrackPitch(instrument, songPitch),
      note.id
    );
    if (button !== -1) {
      healthy.add(note.id);
      continue;
    }
    stranded.set(note.id, isAccidentalMidi(note.id) ? 1 : -1);
  }
  for (const number of healthy) stranded.delete(number);
  return stranded;
}

/** One row of the Pro View's row-label strip: what to print there, and whether it prints faintly. */
export interface ProRowLabel {
  number: number;
  text: string;
  /**
   * The row maps to no Button of the current layer's instrument, so what is printed is the absolute
   * pitch name rather than a key the user can press — drawn smaller and dimmer for that reason.
   */
  faint: boolean;
}

/**
 * WHAT ONE ROW OF THE STRIP PRINTS (spec §2): the current keyboard's own label where this Note
 * Number is a Button, and a faint absolute pitch name where it is not.
 *
 * `noteText` IS THE KEYBOARD'S OWN FUNCTION — `Instrument.getNoteText(button, noteNameType, pitch)`,
 * the very call ComposerKeyboard makes for the key it draws — passed in rather than reproduced, so
 * the strip cannot spell a keybind, a Do-Re-Mi syllable or a note name differently from the key the
 * user is about to press. Taking it as a parameter is also what keeps this module free of the audio
 * tier (Instrument.svelte.ts pulls the keybind store) and testable with a fake.
 *
 * AN EMPTY LABEL FALLS BACK TO THE FAINT NAME, which is a decision and not a guard: the "No Text"
 * naming mode prints nothing on the keyboard, and it prints nothing on a key the user can SEE — the
 * strip is the Pro View's only pitch reference, and 26 blank rows would make the axis unreadable
 * rather than uncluttered. The same fallback covers a Shape slot with no label in the chosen set.
 */
export function proRowLabel(
  number: number,
  button: number,
  noteText: (button: number) => string
): ProRowLabel {
  if (button >= 0) {
    const text = noteText(button);
    if (text !== '') return { number, text, faint: false };
  }
  return { number, text: noteNameForMidi(number), faint: true };
}
