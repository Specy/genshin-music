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
        // Sky +1 on 2026-08-23: Cymbals (Season of Radiance, 4 sounds on a 2x2 pad,
        // in-game capture). SFX_KrillHorn (one-button krill roar) landed the same day and
        // was retired 2026-08-26 — KrillHorn, the tuned octave built from its roar, is the
        // one that stayed, so the net for that pair is +1.
        // Sky +1 on 2026-08-24: TriumphHandPan (Season of Performance, the Sanctuary
        // Handpan reimagined — same 8 notes as HandPan, hollower shell, in-game capture)
        // Sky +1 on 2026-08-24: KrillHorn — that roar pitch-shifted onto a tuned 2x4 octave.
        expect(INSTRUMENTS.length).toBe(APP_NAME === 'Genshin' ? 11 : 44)
    })

    it('NoteLayer bit operations work', () => {
        const layer = new NoteLayer()
        layer.set(0, true)
        layer.set(3, true)
        expect(layer.serializeHex()).toBe('9') // 0b1001
        expect(layer.test(3)).toBe(true)
    })
})
