import {describe, it} from 'vitest'
import {
    BaseTheme, ComposerSettings, MIDISettings, PlayerSettings, ThemeProvider,
    ThemeSettings, VsrgComposerSettings, VsrgPlayerSettings, ZenKeyboardSettings,
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
        expectGolden('settings-defaults', {
            composer: ComposerSettings,
            player: PlayerSettings,
            midi: MIDISettings,
            theme: ThemeSettings,
            vsrgComposer: VsrgComposerSettings,
            vsrgPlayer: VsrgPlayerSettings,
            zenKeyboard: ZenKeyboardSettings,
        })
    })
})
