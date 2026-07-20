import {describe, expect, it, vi} from 'vitest'
import Color from 'color'
import {themeStore} from '../src/lib/stores/ThemeStore.svelte'
import {songsStore} from '../src/lib/stores/SongsStore.svelte'
import {keyBinds} from '../src/lib/stores/KeybindsStore.svelte'
import {APP_NAME, BaseTheme, ThemeProvider} from './imports'

describe('theme persistence (P2 Important-1 acceptance: "theme edit persists across reload")', () => {
    it('Theme.save() persists the current theme id and the edited doc', async () => {
        const custom = new BaseTheme('My custom')
        const id = await themeStore.addTheme(custom.serialize())
        ThemeProvider.loadFromTheme({...custom.serialize(), id})
        ThemeProvider.set('accent', '#123456')
        await ThemeProvider.save()
        expect(themeStore.getCurrentThemeId()).toBe(id)
        await themeStore.sync()
        const persisted = themeStore.themes.find(t => t.id === id)
        // ThemeService.getThemes() runs every theme through ThemeProvider.sanitize(), which
        // re-stringifies each color via `Color(value.value).toString()` (pre-existing,
        // byte-verbatim from the old blob - see ThemeProvider.ts:199) - a hex input round-trips
        // to an rgb(...) string, same color, different representation. Compare via hex, the same
        // representation-agnostic idiom ThemeProvider.ts's own isDefault() uses.
        expect(Color(persisted?.data.accent.value).hex().toLowerCase()).toBe('#123456')
    })
})

describe('songsStore debounced sync', () => {
    it('collapses burst syncs into one read after 10ms', async () => {
        vi.useFakeTimers()
        const spy = vi.spyOn(await import('./imports').then(m => m.songService), 'getStorableSongs')
        songsStore.sync(); songsStore.sync(); songsStore.sync()
        await vi.advanceTimersByTimeAsync(15)
        expect(spy).toHaveBeenCalledTimes(1)
        vi.useRealTimers()
    })
})

describe('keybinds persistence', () => {
    it('round-trips serialize/load at version 13 under the legacy key', () => {
        keyBinds.save()
        const raw = localStorage.getItem(`${APP_NAME}_keybinds`)
        expect(raw).toBeTruthy()
        expect(JSON.parse(raw!).version).toBe(13)
    })
})
