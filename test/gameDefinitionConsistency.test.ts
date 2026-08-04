import {describe, expect, it} from 'vitest'
import {game} from '$game'
import {
    APP_NAME, ComposerSettings, INSTRUMENTS, LEGACY_NOTE_TABLES, NOTES_PER_COLUMN,
    PlayerSettings, SIMILAR_INSTRUMENTS, ThemeSettings, ZenKeyboardSettings,
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

describe('frozen legacy note tables match the live instrument data (transcription guard)', () => {
    // The tables in legacyNoteTables.ts are a FROZEN snapshot of the pre-format-v4
    // `midiNotes`. Today they must equal the live data byte-for-byte — a transcription
    // typo would silently retune every legacy song at conversion. If this test ever
    // fails because an instrument was DELIBERATELY retuned: do NOT edit the frozen
    // tables (they must stay as the legacy formats knew them); update or remove this
    // test consciously instead.
    it('every frozen table equals the live midiNotes of the same instrument', () => {
        const frozen = LEGACY_NOTE_TABLES[APP_NAME]
        expect(frozen.defaultInstrument).toBe(INSTRUMENTS[0])
        expect(frozen.perColumn).toBe(NOTES_PER_COLUMN)
        for (const [name, table] of Object.entries(frozen.tables)) {
            const live = game.instruments.data[name]
            expect(live, `frozen table for unknown instrument "${name}"`).toBeTruthy()
            expect([...table], `table mismatch for "${name}"`).toEqual([...live.midiNotes])
        }
        //and every live instrument has a frozen table (new instruments added after the
        //freeze belong in the similarity map + live data only, never in the freeze —
        //when adding one, list it here rather than freezing it)
        const POST_FREEZE_INSTRUMENTS = new Set(['test_sustain'])
        for (const name of INSTRUMENTS) {
            if (POST_FREEZE_INSTRUMENTS.has(name)) continue
            expect(frozen.tables[name], `live instrument "${name}" missing from the freeze`).toBeTruthy()
        }
    })

    it('every similarity-map target for this game names a real instrument', () => {
        for (const [sourceGame, entries] of Object.entries(SIMILAR_INSTRUMENTS)) {
            if (sourceGame === APP_NAME) continue
            for (const [sourceName, byTarget] of Object.entries(entries)) {
                const target = byTarget[APP_NAME as keyof typeof byTarget]
                if (target === undefined) continue
                expect(game.instruments.data[target],
                    `${sourceGame} "${sourceName}" maps to unknown ${APP_NAME} instrument "${target}"`
                ).toBeTruthy()
            }
        }
    })
})
