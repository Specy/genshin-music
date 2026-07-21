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
    playerControlsStore.setState({position: 0, current: 0, size: 0, end: 0})
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

describe('setPages (clone depth)', () => {
    it('deep-clones pages/chunks so the store never aliases the caller\'s arrays', () => {
        const original = [[new Chunk([new RecordedNote(0, 100)], 10)]]
        playerControlsStore.setPages(original)

        expect(playerControlsStore.pagesState.pages).not.toBe(original)
        expect(playerControlsStore.pagesState.pages[0]).not.toBe(original[0])
        expect(playerControlsStore.pagesState.pages[0][0]).not.toBe(original[0][0])
        expect(playerControlsStore.pagesState.pages[0][0].notes).not.toBe(original[0][0].notes)
        // content is preserved by Chunk.clone()/RecordedNote.clone() despite the new identities
        expect(playerControlsStore.pagesState.pages[0][0].delay).toBe(10)
        expect(playerControlsStore.pagesState.pages[0][0].notes[0].index).toBe(0)

        // currentPage mirrors the FIRST cloned page's content. NOTE for reviewer: under Svelte 5
        // runes this is content-equal but NOT reference-equal (`.toBe` fails here) - `setPagesState`
        // assigns `pages` and `currentPage` as two separate `Object.assign` targets on the reactive
        // `$state` proxy, and Svelte proxies each raw array independently on assignment (unlike a
        // plain-JS object graph, or mobx's own admin-object wrapping, there is no cross-property
        // proxy-identity cache) - `pagesState.currentPage` and `pagesState.pages[0]` end up as two
        // distinct Proxy objects around the same underlying clone. No store method ever compares
        // them by reference (only by content/index), so this is a reactivity-substrate detail, not
        // a port bug - documented here rather than silently asserted away.
        expect(playerControlsStore.pagesState.currentPage).toEqual(playerControlsStore.pagesState.pages[0])
        expect(playerControlsStore.pagesState.currentPageIndex).toBe(0)
        expect(playerControlsStore.pagesState.currentChunkIndex).toBe(0)
    })

    it('falls back to an empty currentPage when pages is empty', () => {
        playerControlsStore.setPages([])
        expect(playerControlsStore.pagesState.pages).toEqual([])
        expect(playerControlsStore.pagesState.currentPage).toEqual([])
    })
})

describe('incrementChunkPositionAndSetCurrent (page/chunk advance)', () => {
    it('advances the chunk index within a page, then rolls over to the next page, then STOPS (and does not even update `current`) once on the last chunk of the last page', () => {
        const chunkA = new Chunk([new RecordedNote(0, 0)], 0)
        const chunkB = new Chunk([new RecordedNote(1, 10)], 10)
        const chunkC = new Chunk([new RecordedNote(2, 20)], 10)
        playerControlsStore.setPages([[chunkA, chunkB], [chunkC]])

        // chunk 0 -> chunk 1, still page 0 (2 chunks on page 0)
        playerControlsStore.incrementChunkPositionAndSetCurrent(5)
        expect(playerControlsStore.pagesState.currentPageIndex).toBe(0)
        expect(playerControlsStore.pagesState.currentChunkIndex).toBe(1)
        expect(playerControlsStore.current).toBe(5)

        // last chunk of page 0 -> rolls over to page 1, chunk 0
        playerControlsStore.incrementChunkPositionAndSetCurrent(6)
        expect(playerControlsStore.pagesState.currentPageIndex).toBe(1)
        expect(playerControlsStore.pagesState.currentChunkIndex).toBe(0)
        expect(playerControlsStore.current).toBe(6)
        expect(playerControlsStore.currentChunk?.notes[0].index).toBe(2) // chunkC (cloned)

        // last chunk of the LAST page: old quirk - early `return` before any setState/setPagesState,
        // so `current` is NOT updated to 7 either (byte-parity with old PlayerControlsStore.ts).
        playerControlsStore.incrementChunkPositionAndSetCurrent(7)
        expect(playerControlsStore.pagesState.currentPageIndex).toBe(1)
        expect(playerControlsStore.pagesState.currentChunkIndex).toBe(0)
        expect(playerControlsStore.current).toBe(6)
    })

    it('defaults the `current` argument to the store\'s own current value when omitted', () => {
        const chunkA = new Chunk([new RecordedNote(0, 0)], 0)
        const chunkB = new Chunk([new RecordedNote(1, 10)], 10)
        playerControlsStore.setPages([[chunkA, chunkB]])
        playerControlsStore.setCurrent(42)

        playerControlsStore.incrementChunkPositionAndSetCurrent()
        expect(playerControlsStore.pagesState.currentChunkIndex).toBe(1)
        expect(playerControlsStore.current).toBe(42)
    })
})

describe('setSong', () => {
    it('sets size from notes.length and resets position/current/pages', () => {
        const song = buildRecordedSong() // 4 notes, see test/builders.ts
        playerControlsStore.setPages([[new Chunk([], 0)]])

        playerControlsStore.setSong(song)

        expect(playerControlsStore.size).toBe(4)
        expect(playerControlsStore.position).toBe(0)
        expect(playerControlsStore.current).toBe(0)
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
