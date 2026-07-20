import {describe, expect, it} from 'vitest'
import {game} from '$game'
import {
    APP_NAME, ComposerSettings, INSTRUMENTS, NOTES_PER_COLUMN, PlayerSettings,
    ThemeSettings, ZenKeyboardSettings,
} from './imports'
import {InstrumentData} from './imports'

describe('GameDefinition fields match legacy-computed values (drift guard)', () => {
    it('identity + geometry', () => {
        expect(game.storageId).toBe(APP_NAME)
        expect(game.notes.perColumn).toBe(NOTES_PER_COLUMN)
        expect(game.instruments.list).toEqual(INSTRUMENTS)
    })
    it('defaults duplicated in core ternaries', () => {
        expect(new InstrumentData().volume).toBe(game.instruments.defaultVolume)
        expect(ThemeSettings.data.note_background.value).toBe(game.themes.defaultNoteBackground)
        expect(ComposerSettings.data.noteNameType.value).toBe(game.settings.defaultNoteNameType.composer.desktop)
        expect(PlayerSettings.data.noteNameType.value).toBe(game.settings.defaultNoteNameType.player.desktop)
        expect(ZenKeyboardSettings.data.noteNameType.value).toBe(game.settings.defaultNoteNameType.zen.desktop)
    })
})
