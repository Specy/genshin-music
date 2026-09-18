import { describe, expect, it } from 'vitest';
import {
  dedupeChunkNotes,
  dedupeSimultaneousNotes,
  SIMULTANEOUS_NOTE_THRESHOLD_MS,
} from '../src/lib/core/Songs/duplicateNotes';
import { RecordedNote, RecordedSong } from './imports';

/**
 * DUPLICATE EXPOSURES (duplicateNotes.ts): a song whose tracks double the same note in one
 * instant put TWO entries on ONE key, and both interactive modes clear exactly one queued note
 * per press - so practice hung with every red key already clicked, and the approaching mode
 * scored the unreachable twin as a MISS.
 *
 * The bug is a counting one, which is why these cases count what survives rather than mount
 * anything: the invariant is "one entry per key per instant, the longest-ringing one".
 */

/** A note on `button`, keyed the way the player queues are: `keyboardButton`, not the id. */
function noteOn(button: number, time: number, duration = 0, trackIndex = 0) {
  const note = new RecordedNote(60 + button, time, duration, trackIndex);
  note.keyboardButton = button;
  return note;
}

/** Track 0 sustains, track 1 does not - the two cases the survivor rule is defined over. */
const SUSTAINS = [true, false];

describe('practice chunks admit one note per key', () => {
  it('a chunk with the same key twice completes on one click per distinct key', () => {
    // Two tracks doubling button 3, plus an unrelated key in the same instant.
    const chunks = RecordedSong.mergeNotesIntoChunks([
      noteOn(3, 1000, 800, 0),
      noteOn(3, 1000, 200, 0),
      noteOn(5, 1010, 0, 0),
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].notes).toHaveLength(3); // the merge itself is unchanged

    chunks.forEach((chunk) => (chunk.notes = dedupeChunkNotes(chunk.notes, SUSTAINS)));

    expect(chunks[0].notes.map((note) => note.keyboardButton)).toEqual([3, 5]);
    // The survivor is the longer hold: it is what draws the key's sustain ring.
    expect(chunks[0].notes[0].duration).toBe(800);

    // What the player does on a press: remove ONE entry matching the pressed key. Pressing each
    // key the chunk shows exactly once must empty it - that is the whole regression.
    for (const button of [3, 5]) {
      const at = chunks[0].notes.findIndex((note) => note.keyboardButton === button);
      chunks[0].notes.splice(at, 1);
    }
    expect(chunks[0].notes).toHaveLength(0);
  });

  it('keeps the duplicate that actually sustains, not merely the longest number', () => {
    // Track 1 cannot sustain, so its 2000ms duration rings for nothing; track 0's 400ms does.
    const kept = dedupeChunkNotes([noteOn(2, 0, 2000, 1), noteOn(2, 0, 400, 0)], SUSTAINS);

    expect(kept).toHaveLength(1);
    expect(kept[0].trackIndex).toBe(0);
    expect(kept[0].duration).toBe(400);
  });

  it('leaves a chunk that plays each key once untouched', () => {
    const notes = [noteOn(1, 0), noteOn(2, 0), noteOn(3, 0)];

    expect(dedupeChunkNotes(notes, SUSTAINS)).toEqual(notes);
  });

  it('does not deduplicate the same key across different chunks', () => {
    // Same key, far enough apart to chunk separately: a real repeated press, not a duplicate.
    const chunks = RecordedSong.mergeNotesIntoChunks([noteOn(4, 0), noteOn(4, 5000)]);
    chunks.forEach((chunk) => (chunk.notes = dedupeChunkNotes(chunk.notes, SUSTAINS)));

    expect(chunks).toHaveLength(2);
    expect(chunks.map((chunk) => chunk.notes.length)).toEqual([1, 1]);
  });
});

describe('the approaching queue admits one note per key per instant', () => {
  it('admits one of two simultaneous notes on the same key, the longer one', () => {
    const admitted = dedupeSimultaneousNotes(
      [noteOn(3, 1000, 200, 0), noteOn(3, 1000, 900, 0), noteOn(7, 1000, 0, 0)],
      SUSTAINS
    );

    expect(admitted.map((note) => note.keyboardButton)).toEqual([3, 7]);
    expect(admitted[0].duration).toBe(900);
  });

  it('treats notes inside the merge window as one instant, and the boundary as two', () => {
    const inside = dedupeSimultaneousNotes(
      [noteOn(1, 0), noteOn(1, SIMULTANEOUS_NOTE_THRESHOLD_MS - 1)],
      SUSTAINS
    );
    // Strictly `<`, exactly like the chunk merge: 50ms apart is already a separate press.
    const boundary = dedupeSimultaneousNotes(
      [noteOn(1, 0), noteOn(1, SIMULTANEOUS_NOTE_THRESHOLD_MS)],
      SUSTAINS
    );

    expect(inside).toHaveLength(1);
    expect(boundary).toHaveLength(2);
  });

  it('keeps the same key when it comes round again later in the song', () => {
    const admitted = dedupeSimultaneousNotes([noteOn(2, 0), noteOn(2, 400), noteOn(2, 800)], SUSTAINS);

    expect(admitted.map((note) => note.time)).toEqual([0, 400, 800]);
  });

  it('anchors the window on the note that opened it, so a dense run cannot walk it forward', () => {
    // 0/40/80: the middle note is a duplicate of the first, the last one is NOT - it is 80ms
    // from the note that opened the window, even though it is 40ms from the previous one.
    const admitted = dedupeSimultaneousNotes([noteOn(1, 0), noteOn(1, 40), noteOn(1, 80)], SUSTAINS);

    expect(admitted.map((note) => note.time)).toEqual([0, 80]);
  });
});
