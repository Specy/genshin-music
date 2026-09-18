import {describe, expect, it} from 'vitest'
import {ThemeProvider} from './imports'

describe('reactive theme model', () => {
    it('set() updates value and recomputes text color', () => {
        ThemeProvider.set('accent', '#000000')
        expect(ThemeProvider.getValue('accent')).toBe('#000000')
        expect(ThemeProvider.getText('accent').toString().toLowerCase()).not.toBe('#000000')
    })
    it('layer() lightens dark colors', () => {
        ThemeProvider.set('primary', '#101010')
        const layered = ThemeProvider.layer('primary', 0.15)
        expect(layered.luminosity()).toBeGreaterThan(ThemeProvider.get('primary').luminosity())
    })
})
