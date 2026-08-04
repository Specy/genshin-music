import {describe, expect, it} from 'vitest'
import {APP_NAME, INSTRUMENTS, NoteLayer} from './imports'

describe('environment smoke test', () => {
    it('runs against a selected game', () => {
        expect(['Genshin', 'Sky']).toContain(APP_NAME)
        // Genshin has 10 instruments; Sky had 34 (from Config.ts, counted directly)
        // +1 on 2026-08-04: the `test_sustain` dummy sustaining instrument
        expect(INSTRUMENTS.length).toBe(APP_NAME === 'Genshin' ? 10 : 35)
    })

    it('NoteLayer bit operations work', () => {
        const layer = new NoteLayer()
        layer.set(0, true)
        layer.set(3, true)
        expect(layer.serializeHex()).toBe('9') // 0b1001
        expect(layer.test(3)).toBe(true)
    })
})
