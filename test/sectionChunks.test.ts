import {describe, expect, it} from 'vitest'
import {Chunk, RecordedNote, RecordedSong} from './imports'
import {chunkIndexAt, sectionQueue} from '$core/Songs/sectionChunks'

/**
 * ADR-0010's two pure pieces: where the sheet cursor sits, and which chunks a Section actually
 * runs. Both are driven here on hand-built notes rather than through a mounted keyboard - the
 * cases that matter are the ones where a chunk's notes and the span it stands for have come apart
 * (a filtered-out note, a deduped doubled key, a seam trim), which a real song reaches only by
 * accident.
 */

/** A note as the player has it mid-run: buttons resolved, position in `song.notes` stamped. */
function playerNote(absoluteIndex: number, time: number, keyboardButton: number, duration = 0, trackIndex = 0) {
    const note = new RecordedNote(60 + keyboardButton, time, duration, trackIndex)
    note.keyboardButton = keyboardButton
    note.absoluteIndex = absoluteIndex
    return note
}

const NO_SUSTAIN = [false, false]

/**
 * The builder song's shape (test/builders.ts, buttons as test/playerModeTransitions.test.ts
 * resolves them): one note, then three in one instant of which two share a key, then one.
 */
function builderShapedChunks(): Chunk[] {
    return RecordedSong.mergeNotesIntoChunks([
        playerNote(0, 100, 0),
        playerNote(1, 350, 3, 0, 1),
        playerNote(2, 350, 7),
        playerNote(3, 350, 7, 0, 1),
        playerNote(4, 900, 14),
    ])
}

describe('mergeNotesIntoChunks (absolute spans)', () => {
    it('stamps each chunk with the absolute span it was built from', () => {
        const chunks = builderShapedChunks()
        expect(chunks.map(chunk => [chunk.firstNoteIndex, chunk.lastNoteIndex]))
            .toEqual([[0, 0], [1, 3], [4, 4]])
    })

    it('leaves the span at -1 for notes that never went through a player run', () => {
        const chunks = RecordedSong.mergeNotesIntoChunks([new RecordedNote(60, 0)])
        expect(chunks[0].firstNoteIndex).toBe(-1)
        expect(chunks[0].lastNoteIndex).toBe(-1)
        // and an empty chunk stays constructible with the two-argument form
        expect(new Chunk([], 0).firstNoteIndex).toBe(-1)
    })

    it('carries the span through clone()', () => {
        const clone = builderShapedChunks()[1].clone()
        expect([clone.firstNoteIndex, clone.lastNoteIndex]).toEqual([1, 3])
        expect(clone.notes.map(note => note.absoluteIndex)).toEqual([1, 2, 3])
    })
})

describe('chunkIndexAt', () => {
    it('answers -1 when there are no chunks', () => {
        expect(chunkIndexAt([], 3)).toBe(-1)
    })

    it('holds a chunk across every index of its span', () => {
        const chunks = builderShapedChunks()
        expect([0, 1, 2, 3, 4].map(current => chunkIndexAt(chunks, current))).toEqual([0, 1, 1, 1, 2])
    })

    it('clamps below the first chunk and past the last one', () => {
        const chunks = builderShapedChunks()
        expect(chunkIndexAt(chunks, -3)).toBe(0)
        expect(chunkIndexAt(chunks, 5)).toBe(2)
        expect(chunkIndexAt(chunks, 900)).toBe(2)
    })

    it('reaches forward over a filter gap rather than back onto the finished chunk', () => {
        // absolute 2 and 3 were unplayable and never reached a chunk; `current` there means the
        // NEXT thing to consume, which is the chunk ahead
        const chunks = RecordedSong.mergeNotesIntoChunks([
            playerNote(0, 0, 0),
            playerNote(1, 10, 1),
            playerNote(4, 900, 5),
            playerNote(5, 910, 6),
        ])
        expect(chunkIndexAt(chunks, 2)).toBe(1)
        expect(chunkIndexAt(chunks, 3)).toBe(1)
    })
})

describe('sectionQueue', () => {
    it('queues every chunk for a Section covering the whole song, deduping each one', () => {
        const queue = sectionQueue(builderShapedChunks(), 0, 5, NO_SUSTAIN)
        expect(queue.map(chunk => chunk.notes.length)).toEqual([1, 2, 1])
        // the doubled key at absolute 3 is gone, the span it sat in is not
        expect(queue[1].notes.map(note => note.absoluteIndex)).toEqual([1, 2])
        expect([queue[1].firstNoteIndex, queue[1].lastNoteIndex]).toEqual([1, 3])
    })

    it('drops chunks outside the Section and trims the seam, end EXCLUSIVE', () => {
        const queue = sectionQueue(builderShapedChunks(), 2, 4, NO_SUSTAIN)
        expect(queue).toHaveLength(1)
        expect(queue[0].notes.map(note => note.keyboardButton)).toEqual([7])
        expect([queue[0].firstNoteIndex, queue[0].lastNoteIndex]).toEqual([2, 3])
    })

    it('trims BEFORE deduping, so a seam cannot delete a note the user still has to press', () => {
        // absolute 3 is the doubled key's second exposure: a whole-song dedupe keeps absolute 2
        // and drops it, so deduping first and trimming after would leave this Section empty
        const queue = sectionQueue(builderShapedChunks(), 3, 5, NO_SUSTAIN)
        expect(queue.map(chunk => chunk.notes.map(note => note.absoluteIndex))).toEqual([[3], [4]])
    })

    it('drops a chunk the trim empties rather than queueing a head no click can clear', () => {
        // one instant, two playable notes, an unplayable one between them that never reached the
        // chunk - so the span covers an index no note of the chunk carries
        const chunks = RecordedSong.mergeNotesIntoChunks([
            playerNote(1, 350, 3),
            playerNote(3, 350, 7),
        ])
        expect([chunks[0].firstNoteIndex, chunks[0].lastNoteIndex]).toEqual([1, 3])
        expect(sectionQueue(chunks, 2, 3, NO_SUSTAIN)).toEqual([])
    })

    it('returns fresh chunks and notes, so a queue the practice click splices cannot move the sheet', () => {
        const chunks = builderShapedChunks()
        const queue = sectionQueue(chunks, 0, 5, NO_SUSTAIN)
        queue[1].notes.splice(0, queue[1].notes.length)

        expect(queue[0]).not.toBe(chunks[0])
        expect(chunks[1].notes).toHaveLength(3)
    })
})
