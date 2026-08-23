import {describe, expect, it} from 'vitest'
import {game} from '$game'
import {GAME_IDENTITY} from '$game/identity'
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
    it('identity.ts and game.json agree on both identity fields (Codex review M2)', () => {
        // defineGame throws on drift at module eval; this pins the same invariant
        // observably. identity.ts feeds the service worker's cache namespace, game.json
        // feeds IndexedDB/storage-key/appName via the definition — they must never split.
        expect(game.id).toBe(GAME_IDENTITY.id)
        expect(game.storageId).toBe(GAME_IDENTITY.storageId)
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
    it('every frozen table equals the live Note Ids of the same instrument', () => {
        const frozen = LEGACY_NOTE_TABLES[APP_NAME]
        expect(frozen.defaultInstrument).toBe(INSTRUMENTS[0])
        expect(frozen.perColumn).toBe(NOTES_PER_COLUMN)
        // Names whose LIVE data entry was removed (ADR-0003): Aurora_Short was an
        // orphaned data key with no audio folder, unreachable through the INSTRUMENTS
        // constructor guard. Its frozen table stays (legacy files may name it), but
        // there is deliberately no live instrument to compare against anymore.
        const DROPPED_LIVE_INSTRUMENTS = new Set(['Aurora_Short'])
        for (const [name, table] of Object.entries(frozen.tables)) {
            if (DROPPED_LIVE_INSTRUMENTS.has(name)) continue
            const live = game.instruments.data[name]
            expect(live, `frozen table for unknown instrument "${name}"`).toBeTruthy()
            expect([...table], `table mismatch for "${name}"`).toEqual(live.notes.map((n) => n.midi))
        }
        //and every live instrument has a frozen table (new instruments added after the
        //freeze belong in the similarity map + live data only, never in the freeze —
        //when adding one, list it here rather than freezing it)
        const POST_FREEZE_INSTRUMENTS = new Set([
            'NightwindHorn',
            //Sky, 2026-08-21: in-game Instruments the app was missing (see games/sky/instruments)
            'Cello',
            'Violin',
            'Saxophone',
            'Harmonica',
            'TransverseFlute',
            'SmallBell',
            'FortuneDrum',
            //Sky, 2026-08-23: one-button krill roar, in-game capture
            'SFX_KrillHorn',
            //Sky, 2026-08-23: Season of Radiance 2x2 cymbals, in-game capture
            'Cymbals',
        ])
        for (const name of INSTRUMENTS) {
            if (POST_FREEZE_INSTRUMENTS.has(name)) continue
            expect(frozen.tables[name], `live instrument "${name}" missing from the freeze`).toBeTruthy()
        }
    })

    it('the Song Grid row order equals the frozen default-instrument table (ADR-0004 drift pin)', () => {
        // canonicalNoteIds is authored INLINE in game.json now, so nothing in the app
        // derives it from instruments.list[0] anymore — the whole point of ADR-0004. That
        // also means nothing forces it to keep matching the layout every stored song, MIDI
        // import table and canvas fixture was written against: the grid's row order IS the
        // legacy default instrument's, and a reordering typo there would move notes on the
        // canvas with every other test still green. Pin it against the FROZEN table (not
        // the live instrument) so retuning an instrument can't quietly re-bless the grid.
        // A deliberate grid change is possible but is a song-visual break: update this
        // test consciously, never to make it pass.
        const frozen = LEGACY_NOTE_TABLES[APP_NAME]
        expect([...game.notes.canonicalNoteIds]).toEqual([...frozen.tables[frozen.defaultInstrument]])
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
