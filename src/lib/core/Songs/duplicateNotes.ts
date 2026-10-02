import type { RecordedNote } from './SongClasses';

/**
 * DUPLICATE EXPOSURES: the same key sounded twice in one instant.
 *
 * A song whose tracks double each other (two instruments playing the same line, an octave
 * arrangement folded onto one keyboard, an import that split one part in two) produces two notes
 * with the SAME `keyboardButton` at the same time. Every playback path is happy with that - both
 * notes sound - but the two interactive modes are not, because each of them lets the user clear
 * exactly ONE queued note per press:
 *
 *  - practice: both entries land in one chunk (RecordedSong.mergeNotesIntoChunks), a click
 *    splices ONE of them out and the key's red mark is reset either way, so the chunk keeps an
 *    invisible leftover it can never be told about again. Practice stops dead with every visible
 *    note already clicked.
 *  - approaching: two identical circles are spawned on one row. One press can only be scored
 *    against one of them; the twin runs out and is counted as a MISS.
 *
 * The fix is to admit ONE note per key per instant, which is exactly what the user can press.
 * These helpers are the whole rule, kept pure and out of the component so both modes share one
 * definition of "the same note twice" - and so it can be pinned by tests.
 *
 * WHAT SURVIVES: the entry that rings the longest, because the survivor is also what draws the
 * key's sustain ring / the circle's tail. Length here is the SOUNDING hold, not `duration`:
 * a duration on a track whose instrument cannot sustain is not held at all (both modes gate it
 * on `sustainingTracks`), so a 2s note on a plucked track loses to a 0.8s note on a sustaining
 * one. Nothing is lost by dropping the other - it is the same key at the same moment.
 */

/**
 * The window two notes count as simultaneous within. Same value (and same strict `<`) as the
 * practice chunk merge, so the approaching queue treats as one instant exactly what the practice
 * queue puts in one chunk.
 */
export const SIMULTANEOUS_NOTE_THRESHOLD_MS = 50;

/** The hold this note actually rings for: a duration only sustains on a sustaining track. */
function holdMsOf(note: RecordedNote, sustainingTracks: readonly boolean[]): number {
  return sustainingTracks[note.trackIndex] ? note.duration : 0;
}

/**
 * Is `candidate` the better one to keep of two exposures of the same key? Longest ring first,
 * then longest raw duration, and otherwise the one already admitted stays - so a run of
 * identical duplicates keeps the first, and the result is stable.
 */
function outranks(
  candidate: RecordedNote,
  admitted: RecordedNote,
  sustainingTracks: readonly boolean[]
): boolean {
  const candidateHold = holdMsOf(candidate, sustainingTracks);
  const admittedHold = holdMsOf(admitted, sustainingTracks);
  if (candidateHold !== admittedHold) return candidateHold > admittedHold;
  return candidate.duration > admitted.duration;
}

/**
 * One entry per key inside ONE practice chunk. Time is not consulted: a chunk already IS the
 * ~50ms window, and the same key in a LATER chunk is a real, separate press that must survive.
 * Feed each chunk's notes separately - never the whole song.
 */
export function dedupeChunkNotes<T extends RecordedNote>(
  notes: readonly T[],
  sustainingTracks: readonly boolean[]
): T[] {
  const kept: T[] = [];
  const indexByButton = new Map<number, number>();
  for (const note of notes) {
    const at = indexByButton.get(note.keyboardButton);
    if (at === undefined) {
      indexByButton.set(note.keyboardButton, kept.length);
      kept.push(note);
    } else if (outranks(note, kept[at], sustainingTracks)) {
      kept[at] = note;
    }
  }
  return kept;
}

/**
 * One entry per key per instant across a whole (chronological) note stream - the approaching
 * queue's form of the same rule, since it has no chunks to scope the comparison.
 *
 * The window is anchored to the note that OPENED it rather than to the last one admitted, so a
 * dense run of duplicates cannot walk the window forward note by note and swallow a genuine
 * repeat of the same key further along.
 */
export function dedupeSimultaneousNotes<T extends RecordedNote>(
  notes: readonly T[],
  sustainingTracks: readonly boolean[],
  thresholdMs: number = SIMULTANEOUS_NOTE_THRESHOLD_MS
): T[] {
  const admitted: T[] = [];
  const openByButton = new Map<number, { index: number; anchorMs: number }>();
  for (const note of notes) {
    const open = openByButton.get(note.keyboardButton);
    if (open !== undefined && Math.abs(note.time - open.anchorMs) < thresholdMs) {
      if (outranks(note, admitted[open.index], sustainingTracks)) admitted[open.index] = note;
      continue;
    }
    openByButton.set(note.keyboardButton, { index: admitted.length, anchorMs: note.time });
    admitted.push(note);
  }
  return admitted;
}
