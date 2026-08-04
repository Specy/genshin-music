import {describe, expect, it} from 'vitest'
import {INSTRUMENTS} from './imports'
import {foldIdIntoRange, getNoteIdTable} from '../src/lib/core/Songs/noteIds'

describe('foldIdIntoRange', () => {
    it('octave-folds ordinary ids without changing their pitch class', () => {
        const instrument = INSTRUMENTS[0]
        const table = getNoteIdTable(instrument)
        const min = Math.min(...table)
        const max = Math.max(...table)

        expect(foldIdIntoRange(instrument, max + 1) % 12).toBe((max + 1) % 12)
        expect(foldIdIntoRange(instrument, min - 1) % 12).toBe((min - 1 + 12) % 12)
    })

    it('handles huge finite ids in bounded time', () => {
        expect(Number.isFinite(foldIdIntoRange(INSTRUMENTS[0], 1e308))).toBe(true)
        expect(Number.isFinite(foldIdIntoRange(INSTRUMENTS[0], -1e308))).toBe(true)
    })
})
