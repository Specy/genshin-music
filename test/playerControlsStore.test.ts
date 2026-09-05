import {beforeEach, describe, expect, it} from 'vitest'
import {playerControlsStore} from '../src/lib/stores/PlayerControlsStore.svelte'
import {clamp} from '../src/lib/core/utils/Utilities'
import {Chunk, RecordedNote} from './imports'
import {buildRecordedSong} from './builders'

// playerControlsStore is a module-level singleton (matches the old mobx store's own singleton
// export) - reset every sub-state it owns before each test so execution order never matters.
beforeEach(() => {
    playerControlsStore.resetScore()
    playerControlsStore.clearPages()
    playerControlsStore.setState({position: 0, current: 0, sounded: -1, size: 0, end: 0, runEnd: 0})
})

describe('increaseScore (combo/score math)', () => {
    it('a correct hit scores the PRE-increment combo, then increments correct+combo', () => {
        // resetScore() baseline: {correct:1, wrong:1, score:0, combo:0}
        playerControlsStore.increaseScore(true)
        expect(playerControlsStore.score).toEqual({correct: 2, wrong: 1, score: 0, combo: 1})

        playerControlsStore.increaseScore(true)
        expect(playerControlsStore.score).toEqual({correct: 3, wrong: 1, score: 1, combo: 2})
    })

    it('accepts a debuff multiplier on the combo contribution', () => {
        playerControlsStore.increaseScore(true) // combo 0->1, score 0
        playerControlsStore.increaseScore(true) // combo 1->2, score 0+1*1=1
        playerControlsStore.increaseScore(true, 2) // combo 2->3, score 1+2*2=5
        expect(playerControlsStore.score).toEqual({correct: 4, wrong: 1, score: 5, combo: 3})
    })

    it('a wrong hit resets combo and increments wrong, leaving score/correct untouched', () => {
        playerControlsStore.increaseScore(true)
        playerControlsStore.increaseScore(true)
        playerControlsStore.increaseScore(true, 2)
        playerControlsStore.increaseScore(false)
        expect(playerControlsStore.score).toEqual({correct: 4, wrong: 2, score: 5, combo: 0})
    })
})

/**
 * The three chunks the builder song produces once resolved and merged (see
 * test/playerModeTransitions.test.ts for the run that proves it): note 0 alone, notes 1-3 in one
 * ~50ms instant, note 4 alone. Spans are what the merge stamps, BEFORE dedupe drops the doubled
 * key at absolute 3 - so chunk 1 owns an index no note of its own carries any more, which is
 * exactly the case a cursor lookup has to survive.
 */
function spannedChunk(first: number, last: number, delay = 0): Chunk {
    const notes = [new RecordedNote(first, first * 100)]
    notes[0].absoluteIndex = first
    return new Chunk(notes, delay, first, last)
}

describe('setPages (clone depth)', () => {
    it('deep-clones pages/chunks so the store never aliases the caller\'s arrays', () => {
        const note = new RecordedNote(0, 100)
        note.absoluteIndex = 3
        const original = [[new Chunk([note], 10, 3, 7)]]
        playerControlsStore.setPages(original)

        expect(playerControlsStore.pagesState.pages).not.toBe(original)
        expect(playerControlsStore.pagesState.pages[0]).not.toBe(original[0])
        expect(playerControlsStore.pagesState.pages[0][0]).not.toBe(original[0][0])
        expect(playerControlsStore.pagesState.pages[0][0].notes).not.toBe(original[0][0].notes)
        // content is preserved by Chunk.clone()/RecordedNote.clone() despite the new identities
        expect(playerControlsStore.pagesState.pages[0][0].delay).toBe(10)
        expect(playerControlsStore.pagesState.pages[0][0].notes[0].id).toBe(0)
        // ...the absolute span included (ADR-0010): setPages clones, and a frame that lost its span
        // could no longer say which part of the song it draws
        expect(playerControlsStore.pagesState.pages[0][0].firstNoteIndex).toBe(3)
        expect(playerControlsStore.pagesState.pages[0][0].lastNoteIndex).toBe(7)
        expect(playerControlsStore.pagesState.pages[0][0].notes[0].absoluteIndex).toBe(3)

        // currentPage is DERIVED from `current` now (ADR-0010) rather than stored beside `pages`,
        // so it is the page array itself - reference-equal, unlike the two independent `$state`
        // proxies the stored copy used to produce.
        expect(playerControlsStore.currentPage).toBe(playerControlsStore.pagesState.pages[0])
        expect(playerControlsStore.currentPageIndex).toBe(0)
        expect(playerControlsStore.currentChunkIndex).toBe(0)
    })

    it('falls back to an empty currentPage when pages is empty', () => {
        playerControlsStore.setPages([])
        expect(playerControlsStore.pagesState.pages).toEqual([])
        expect(playerControlsStore.currentPage).toEqual([])
    })
})

/**
 * ADR-0010: nothing steps the chunk position any more. `current` is an absolute `song.notes`
 * index and the frame under the highlight is a pure lookup of it against the chunk spans - which
 * is what lets the sheet hold the WHOLE song while only the Section runs.
 */
describe('derived chunk/page cursor', () => {
    const wholeSong = () => [spannedChunk(0, 0), spannedChunk(1, 3, 250), spannedChunk(4, 4, 550)]

    it('resolves the cursor to the chunk containing `current`', () => {
        playerControlsStore.setPages([wholeSong()])
        playerControlsStore.setCurrent(0)
        expect(playerControlsStore.currentChunkIndex).toBe(0)
        expect(playerControlsStore.currentGlobalChunkIndex).toBe(0)
        expect(playerControlsStore.currentChunk?.firstNoteIndex).toBe(0)
    })

    it('holds the cursor on a chunk across EVERY index of its span, including ones no surviving note carries', () => {
        playerControlsStore.setPages([wholeSong()])
        // absolute 3 is inside chunk 1's span but its note was deduped away as a doubled key: a
        // lookup that asked "which chunk holds a note at 3" would answer nothing at all
        for (const current of [1, 2, 3]) {
            playerControlsStore.setCurrent(current)
            expect(playerControlsStore.currentChunkIndex).toBe(1)
        }
        playerControlsStore.setCurrent(4)
        expect(playerControlsStore.currentChunkIndex).toBe(2)
    })

    it('clamps a cursor before the first chunk and one past the last note', () => {
        playerControlsStore.setPages([wholeSong()])

        playerControlsStore.setCurrent(-1)
        expect(playerControlsStore.currentChunkIndex).toBe(0)

        // play mode really ends here: `current` is the note that has not sounded, so a finished
        // 5-note song leaves it at 5 - one past every span
        playerControlsStore.setCurrent(5)
        expect(playerControlsStore.currentChunkIndex).toBe(2)
        expect(playerControlsStore.currentChunk?.lastNoteIndex).toBe(4)
    })

    it('reaches FORWARD across the gaps a mode filter leaves, never back onto the finished chunk', () => {
        // an unplayable pair at absolute 2-3 belongs to no chunk: practice and approaching chunk
        // only the notes their keyboard can play. `current` means "the next note to consume", so
        // the answer is the chunk still ahead - answering with chunk 0 would leave the highlight
        // one frame behind for the rest of the run.
        playerControlsStore.setPages([[spannedChunk(0, 1), spannedChunk(4, 5)]])
        for (const current of [2, 3]) {
            playerControlsStore.setCurrent(current)
            expect(playerControlsStore.currentChunkIndex).toBe(1)
        }
    })

    it('converts the global chunk index into a page index and a page-relative one', () => {
        playerControlsStore.setPages([[spannedChunk(0, 0), spannedChunk(1, 3)], [spannedChunk(4, 4)]])
        playerControlsStore.setCurrent(4)

        expect(playerControlsStore.currentPageIndex).toBe(1)
        // page-relative: it is what PlayerPagesRenderer compares its own each-index to
        expect(playerControlsStore.currentChunkIndex).toBe(0)
        expect(playerControlsStore.currentGlobalChunkIndex).toBe(2)
        expect(playerControlsStore.currentPage).toHaveLength(1)
        expect(playerControlsStore.currentChunk?.firstNoteIndex).toBe(4)
    })

    // A finished run parks `current` ON its exclusive end so the slider's progress line reaches the
    // end. PlayerSlider maps it to the boundary after the frame; the sheet highlight is the other consumer of the same
    // number and must NOT overshoot, so it is taken one note inside `runEnd`.
    it('derives the run\'s LAST frame when `current` lands on the run end, not the one after it', () => {
        playerControlsStore.setPages([wholeSong()])
        // a Section of the first two frames: `end` 4 is exclusive, so frame 2 (span [4,4]) is
        // outside the run and must never take the highlight
        playerControlsStore.setState({size: 5, position: 0, end: 4, runEnd: 4})
        playerControlsStore.setCurrent(4)
        expect(playerControlsStore.currentGlobalChunkIndex).toBe(1)
        expect(playerControlsStore.currentChunk?.lastNoteIndex).toBe(3)
    })

    // The bound is applied to the FRAME, not the note index: practice/approaching cut frames from
    // playable notes only, so a Section whose tail notes have no key leaves `runEnd - 1` inside a
    // span gap - and chunkIndexAt's forward reach would jump that gap into the frame past the run.
    it('caps the parked highlight at the run\'s last frame even when the run ends inside a gap', () => {
        playerControlsStore.setPages([[
            spannedChunk(0, 20), spannedChunk(21, 44, 250), spannedChunk(52, 60, 550),
        ]])
        // no frame covers notes 45-51; the run ends at 50, so its last frame is [21,44]
        playerControlsStore.setState({size: 61, position: 0, end: 50, runEnd: 50})
        playerControlsStore.setCurrent(50)
        expect(playerControlsStore.currentGlobalChunkIndex).toBe(1)
    })

    it('leaves mid-run lookups unclamped, including a seek run whose end is the song length', () => {
        playerControlsStore.setPages([wholeSong()])
        playerControlsStore.setState({size: 5, position: 0, end: 5, runEnd: 5})
        for (const [current, chunk] of [[0, 0], [1, 1], [3, 1], [4, 2]] as const) {
            playerControlsStore.setCurrent(current)
            expect(playerControlsStore.currentGlobalChunkIndex).toBe(chunk)
        }
        // ...and the run's own end still resolves to the last frame it played
        playerControlsStore.setCurrent(5)
        expect(playerControlsStore.currentGlobalChunkIndex).toBe(2)
    })

    it('answers safely with no pages at all', () => {
        playerControlsStore.setCurrent(7)
        expect(playerControlsStore.currentPage).toEqual([])
        expect(playerControlsStore.currentChunk).toBeUndefined()
        expect(playerControlsStore.currentPageIndex).toBe(0)
        expect(playerControlsStore.currentChunkIndex).toBe(0)
        expect(playerControlsStore.currentGlobalChunkIndex).toBe(-1)
    })
})

// A LISTENER'S FRAME IS THE ONE SOUNDING, never the one about to sound. `current` runs a note
// ahead by construction - it names what the run will consume NEXT - so a play run whose highlight
// read it alone handed the frame over at the instant that frame's own last note was heard, and the
// listener watched the next frame light up while still hearing this one.
describe('cursor while a play run sounds (`sounded`)', () => {
    // note 0 alone, notes 1-2 together, note 3 alone
    const wholeSong = () => [spannedChunk(0, 0), spannedChunk(1, 2), spannedChunk(3, 3)]

    it('keeps the frame that was HEARD while `current` already names the next one', () => {
        playerControlsStore.setPages([wholeSong()])
        // the run's first note has just sounded: `current` is frame 1's first note already
        playerControlsStore.setState({current: 1, sounded: 0})
        expect(playerControlsStore.currentGlobalChunkIndex).toBe(0)
        // ...and the frame changes hands only once frame 1 is heard to begin
        playerControlsStore.setState({current: 2, sounded: 1})
        expect(playerControlsStore.currentGlobalChunkIndex).toBe(1)
    })

    it('holds one frame through every note inside it', () => {
        playerControlsStore.setPages([wholeSong()])
        for (const sounded of [1, 2]) {
            playerControlsStore.setState({current: sounded + 1, sounded})
            expect(playerControlsStore.currentGlobalChunkIndex).toBe(1)
        }
    })

    it('parks on the last frame played rather than past it when the run ends', () => {
        playerControlsStore.setPages([wholeSong()])
        // the finish counts the tail in: `current` reaches the run's exclusive end, the ear stops
        // on the last note there was
        playerControlsStore.setState({current: 4, sounded: 3, runEnd: 4})
        expect(playerControlsStore.currentGlobalChunkIndex).toBe(2)
    })

    it('falls back to `current` before a note has sounded, and in the modes that sound none', () => {
        playerControlsStore.setPages([wholeSong()])
        // a run dispatched onto frame 1 (a seek, or practice waiting to be played): nothing has
        // been heard, and the frame to show is the one being asked for
        playerControlsStore.setState({current: 1, sounded: -1})
        expect(playerControlsStore.currentGlobalChunkIndex).toBe(1)
    })

    it('leaves the progress boundary measuring what the run CONSUMED', () => {
        playerControlsStore.setPages([wholeSong()])
        // the two cursors name different frames here, and the boundary must still answer what it
        // answered when `current` alone drove it: one whole frame is behind the line
        playerControlsStore.setState({current: 1, sounded: 0})
        expect(playerControlsStore.currentGlobalChunkIndex).toBe(0)
        expect(playerControlsStore.currentFrameBoundary).toBe(1)
        // mid-frame the line stays put while the highlight does too
        playerControlsStore.setState({current: 2, sounded: 1})
        expect(playerControlsStore.currentFrameBoundary).toBe(1)
        playerControlsStore.setState({current: 3, sounded: 2})
        expect(playerControlsStore.currentFrameBoundary).toBe(2)
    })
})

describe('advanceSoundedTo (monotonic ear)', () => {
    it('moves forward only, so a late event cannot walk the highlight back', () => {
        playerControlsStore.advanceSoundedTo(3)
        expect(playerControlsStore.state.sounded).toBe(3)
        playerControlsStore.advanceSoundedTo(1)
        expect(playerControlsStore.state.sounded).toBe(3)
        playerControlsStore.advanceSoundedTo(4)
        expect(playerControlsStore.state.sounded).toBe(4)
    })

    it('starts from -1, which is what a fresh run is reset to', () => {
        expect(playerControlsStore.state.sounded).toBe(-1)
        playerControlsStore.advanceSoundedTo(0)
        expect(playerControlsStore.state.sounded).toBe(0)
    })
})

describe('advanceCurrentTo (monotonic cursor)', () => {
    it('moves `current` forward and ignores anything at or behind it', () => {
        playerControlsStore.setCurrent(4)
        playerControlsStore.advanceCurrentTo(6)
        expect(playerControlsStore.current).toBe(6)
        // a note clicked out of order, or a circle that expires after a later one, must not drag
        // the highlight back over ground already covered
        playerControlsStore.advanceCurrentTo(2)
        expect(playerControlsStore.current).toBe(6)
        playerControlsStore.advanceCurrentTo(6)
        expect(playerControlsStore.current).toBe(6)
    })

    it('leaves a run dispatch free to reset the cursor backwards through setCurrent', () => {
        playerControlsStore.setCurrent(9)
        playerControlsStore.setCurrent(2)
        expect(playerControlsStore.current).toBe(2)
    })
})

describe('setSong', () => {
    it('sets size from notes.length and resets position/current/sounded/pages', () => {
        // 5 flat notes under the per-track model (the pre-v3 builder's 4th entry was one
        // merged two-layer note; it's now one note per track), see test/builders.ts
        const song = buildRecordedSong()
        playerControlsStore.setPages([[new Chunk([], 0)]])
        playerControlsStore.advanceSoundedTo(3)

        playerControlsStore.setSong(song)

        expect(playerControlsStore.size).toBe(5)
        expect(playerControlsStore.position).toBe(0)
        expect(playerControlsStore.current).toBe(0)
        // a new song has been heard as far as nothing at all, whatever the last one reached
        expect(playerControlsStore.state.sounded).toBe(-1)
        expect(playerControlsStore.pagesState.pages).toEqual([])
    })
})

describe('clamp (restored core Utilities helper - the slider-position math PlayerSlider.svelte (Task 5) uses)', () => {
    it('passes values already within range through unchanged', () => {
        expect(clamp(5, 0, 10)).toBe(5)
    })
    it('clamps values below the minimum up to the minimum', () => {
        expect(clamp(-5, 0, 10)).toBe(0)
    })
    it('clamps values above the maximum down to the maximum', () => {
        expect(clamp(15, 0, 10)).toBe(10)
    })
    it('is inclusive at both boundaries', () => {
        expect(clamp(0, 0, 10)).toBe(0)
        expect(clamp(10, 0, 10)).toBe(10)
    })
})
