import { Chunk } from './RecordedSong';
import { dedupeChunkNotes } from './duplicateNotes';

/**
 * THE SHEET IS THE WHOLE SONG, THE SECTION IS WHAT RUNS (ADR-0010).
 *
 * Both halves of that split are pure functions over a chunk list whose `firstNoteIndex`/
 * `lastNoteIndex` were stamped at merge time: where the cursor sits (`chunkIndexAt`, which the
 * store derives every frame index from) and which chunks a run actually consumes
 * (`sectionQueue`, practice's queue). Kept out of the component so both can be pinned by tests
 * without mounting a keyboard - and out of a class, so the model folder's serialize guard
 * (test/serializePlain.test.ts) has nothing new to register.
 */

/**
 * The frame `current` sits on: the FIRST chunk that has not been fully consumed, i.e. the first
 * whose span reaches `current`, and the last chunk once `current` is past all of them.
 *
 * Reaching forward rather than back is what makes it survive the gaps a mode filter leaves. In
 * practice and approaching the chunks are built from playable notes only, so `current` can name a
 * note no chunk holds; "the last chunk starting at or before `current`" would then answer with the
 * chunk the user just finished and leave the highlight one frame behind for the rest of the run,
 * while "the first chunk still ahead" answers with the one they are being asked to play. Every
 * mode counts `current` as the NEXT note to consume, so the two agree wherever there is no gap.
 *
 * Returns -1 for an empty chunk list; the caller decides what an absent frame means.
 */
export function chunkIndexAt(chunks: readonly Chunk[], current: number): number {
  if (chunks.length === 0) return -1;
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].lastNoteIndex >= current) return i;
  }
  return chunks.length - 1;
}

/**
 * The chunks of `chunks` a Section [start, end) actually runs, seam chunks trimmed to the notes
 * inside it. The result is a fresh list of fresh chunks: the caller splices its queue as the user
 * clears notes, and the pages built from the same chunking must not move underneath the sheet.
 *
 * TRIM BEFORE DEDUPE, never after. `dedupeChunkNotes` keeps the LONGEST-RINGING exposure of a key
 * in a chunk, not the earliest, so a seam chunk's survivor can be a note outside the Section whose
 * dropped twin was inside it - deduping first and trimming after would delete a note the user still
 * has to press. A chunk left with nothing after the trim is dropped rather than queued: the click
 * handler only advances the queue on a successful click, so an empty head would stall practice.
 */
export function sectionQueue(
  chunks: readonly Chunk[],
  start: number,
  end: number,
  sustainingTracks: readonly boolean[]
): Chunk[] {
  const queue: Chunk[] = [];
  for (const chunk of chunks) {
    if (chunk.lastNoteIndex < start || chunk.firstNoteIndex >= end) continue;
    const inside = chunk.notes.filter(
      (note) => note.absoluteIndex >= start && note.absoluteIndex < end
    );
    const kept = dedupeChunkNotes(inside, sustainingTracks);
    if (kept.length === 0) continue;
    //span RE-NARROWED to the trim, and read off `inside` rather than `kept`: the trim is what the
    //completion jump moves `current` to, and dedupe keeps the longest-ringing exposure of a key
    //rather than the earliest, so its output is no longer in note order.
    queue.push(
      new Chunk(
        kept.map((note) => note.clone()),
        chunk.delay,
        inside[0].absoluteIndex,
        inside[inside.length - 1].absoluteIndex
      )
    );
  }
  return queue;
}
