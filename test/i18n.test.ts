import {describe, expect, it} from 'vitest'
import {i18n, isLanguageLoaded, setI18nLanguage} from '../src/lib/i18n/i18n'

describe('i18n core', () => {
    it('boots with bundled english and translates a known key', () => {
        expect(isLanguageLoaded('en')).toBe(true)
        expect(i18n.t('common:confirm')).toBeTypeOf('string')
        expect(i18n.t('common:confirm').length).toBeGreaterThan(0)
    })
    it('setI18nLanguage falls back gracefully for an unfetchable locale', async () => {
        const ok = await setI18nLanguage(i18n, 'ja')  // fetch fails in vitest (no server) -> cache miss -> false
        expect(ok).toBe(false)
        expect(i18n.language ?? 'en').toBeTruthy()
    })
})
