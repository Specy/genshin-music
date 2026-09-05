import {describe, it} from 'vitest'
import {
    BaseTheme, ComposerSettings, MIDISettings, PlayerSettings, SheetVisualizerSettings,
    ThemeProvider, ThemeSettings, VsrgComposerSettings, VsrgPlayerSettings, ZenKeyboardSettings,
} from './imports'
import {expectGolden} from './golden'

describe('theme serialization', () => {
    it('BaseTheme serialize and sanitize are stable', () => {
        const theme = new BaseTheme('Golden theme')
        const serialized = theme.serialize()
        expectGolden('theme', {
            serialized,
            sanitized: ThemeProvider.sanitize(JSON.parse(JSON.stringify(serialized))),
        })
    })
})

describe('per-game settings defaults', () => {
    it('default settings objects are stable', () => {
        // JSON round-trip in expectGolden drops functions; what remains is the
        // persisted shape (settingVersion is game-prefixed, e.g. "Genshin71")
        //
        // These fixtures capture DESKTOP defaults only: BaseSettings calls
        // isMobile() at module load, and the jsdom environment here runs with
        // a desktop user agent (see test/setup.ts / vitest.config.ts), so the
        // mobile-aware fields (e.g. defaultNoteNameType) always resolve to
        // their desktop branch. The mobile-branch defaults are not
        // fixture-locked by this test.
        expectGolden('settings-defaults', {
            composer: ComposerSettings,
            player: PlayerSettings,
            midi: MIDISettings,
            theme: ThemeSettings,
            vsrgComposer: VsrgComposerSettings,
            vsrgPlayer: VsrgPlayerSettings,
            zenKeyboard: ZenKeyboardSettings,
            sheetVisualizer: SheetVisualizerSettings,
        })
    })
})
