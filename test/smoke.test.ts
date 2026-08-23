import {describe, expect, it} from 'vitest'
import {APP_NAME, INSTRUMENTS, NoteLayer} from './imports'

describe('environment smoke test', () => {
    it('runs against a selected game', () => {
        expect(['Genshin', 'Sky']).toContain(APP_NAME)
        // Genshin had 10 instruments; Sky had 34 (from Config.ts, counted directly)
        // Genshin +1 on 2026-08-13: `NightwindHorn` (in-game capture, loopless sustain)
        // Sky +7 on 2026-08-21: in-game Instruments the app had never shipped — Cello,
        // Violin, Saxophone, Harmonica, TransverseFlute, SmallBell, FortuneDrum
        // Both games carried `sustained_recorder` (VCSL) from 2026-08-05 to 2026-08-21;
        // it was only ever a stress test for the sustain engine, and the real sustaining
        // Instruments that landed with the Sky additions retired it. The `test_sustain`
        // dummy it had itself replaced (2026-08-04) is likewise long gone.
        // Sky +2 on 2026-08-23: SFX_KrillHorn (in-game capture, one-button krill roar)
        // and Cymbals (Season of Radiance, 4 sounds on a 2x2 pad, in-game capture)
        expect(INSTRUMENTS.length).toBe(APP_NAME === 'Genshin' ? 11 : 43)
    })

    it('NoteLayer bit operations work', () => {
        const layer = new NoteLayer()
        layer.set(0, true)
        layer.set(3, true)
        expect(layer.serializeHex()).toBe('9') // 0b1001
        expect(layer.test(3)).toBe(true)
    })
})
