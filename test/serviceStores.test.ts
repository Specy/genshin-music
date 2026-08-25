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

    //ADR-0013 added undo/redo to defaultShortcuts.composer. A stored map is the map as it stood
    //when it was written, and load() only ever MOVES shortcuts it finds by name - so a default
    //added later must survive a load of an older blob at the same version, or nobody with saved
    //keybinds (everyone who ever opened /keybinds) could reach it.
    it('a stored map from before a shortcut existed still receives its default key', () => {
        const stored = {
            version: 13,
            vsrg: {k4: ['A', 'S', 'J', 'K'], k6: ['A', 'S', 'D', 'H', 'J', 'K']},
            shortcuts: {
                //the composer map WITHOUT undo/redo, and with one rebind the user made
                composer: {
                    Space: {name: 'toggle_play', holdable: false, description: 'toggle_play_description'},
                    KeyU: {name: 'add_column', holdable: true, description: 'add_column_description'},
                },
                player: {}, keyboard: {}, vsrg_composer: {}, vsrg_player: {},
            },
        }
        localStorage.setItem(`${APP_NAME}_keybinds`, JSON.stringify(stored))
        keyBinds.load()
        expect(keyBinds.getShortcut('composer', 'ControlLeft+KeyZ')?.name).toBe('undo')
        expect(keyBinds.getShortcut('composer', 'ControlLeft+KeyY')?.name).toBe('redo')
        //holding the combo walks the history rather than firing once (design §7)
        expect(keyBinds.getShortcut('composer', 'ControlLeft+KeyZ')?.holdable).toBe(true)
        expect(keyBinds.getShortcut('composer', 'ControlLeft+KeyY')?.holdable).toBe(true)
        //...and the user's own rebind still lands, which is what makes this a merge and not a reset
        expect(keyBinds.getShortcut('composer', 'KeyU')?.name).toBe('add_column')
        expect(keyBinds.getShortcut('composer', 'KeyE')).toBeUndefined()
        keyBinds.setShortcut('composer', 'KeyU', 'KeyE')
    })
})
