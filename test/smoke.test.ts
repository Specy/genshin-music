import {describe, expect, it} from 'vitest'
import {APP_NAME, INSTRUMENTS, NoteLayer} from './imports'

describe('environment smoke test', () => {
    it('runs against a selected game', () => {
        expect(['Genshin', 'Sky']).toContain(APP_NAME)
        // Genshin had 10 instruments; Sky had 34 (from Config.ts, counted directly)
        // Sky +1 on 2026-08-05: `sustained_recorder` (VCSL) — the `test_sustain` dummy
        // it replaced (added 2026-08-04) was deleted the same day it became redundant
        // Genshin +1: the same instrument, widened to its 21-note keyboard
        // Genshin +1 on 2026-08-13: `NightwindHorn` (in-game capture, loopless sustain)
        expect(INSTRUMENTS.length).toBe(APP_NAME === 'Genshin' ? 12 : 35)
    })

    it('NoteLayer bit operations work', () => {
        const layer = new NoteLayer()
        layer.set(0, true)
        layer.set(3, true)
        expect(layer.serializeHex()).toBe('9') // 0b1001
        expect(layer.test(3)).toBe(true)
    })
})
