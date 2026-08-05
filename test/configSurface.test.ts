import {describe, expect, it} from 'vitest'
import {game} from '$game'
import {
    APP_NAME, BASE_LAYER_LIMIT, BASE_THEME_CONFIG, COMPOSER_NOTE_POSITIONS,
    DO_RE_MI_NOTE_SCALE, IMPORT_NOTE_POSITIONS, INSTRUMENTS, INSTRUMENTS_DATA,
    MIDI_BOUNDS, MIDI_MAP_TO_NOTE, MIDI_PRESETS, NOTE_MAP_TO_MIDI, NOTE_NAME_TYPES,
    NOTE_SCALE, NOTES_CSS_CLASSES, NOTES_PER_COLUMN, PITCHES, TEMPO_CHANGERS,
} from './imports'
import {expectGolden, readFixture} from './golden'

describe('game config surface', () => {
    it('all game-defining constants are stable (folder-based config, ADR-0003)', () => {
        // v2 fixture: the post-ADR-0003 surface — per-note structs + Shape ids +
        // Shape registries (components drop in JSON). The music-theory constants
        // (pitches/scales) still appear even though they now live in sharedConfig:
        // they remain part of the runtime surface consumers read.
        expectGolden('config-surface-v2', {
            appName: APP_NAME,
            instruments: INSTRUMENTS,
            instrumentsData: INSTRUMENTS_DATA,      // functions/components drop in JSON
            shapes: game.shapes,                    // {id, capacity, columns, labels} survive JSON
            pitches: PITCHES,
            tempoChangers: TEMPO_CHANGERS,
            baseLayerLimit: BASE_LAYER_LIMIT,
            composerNotePositions: COMPOSER_NOTE_POSITIONS,
            importNotePositions: IMPORT_NOTE_POSITIONS,
            notesCssClasses: NOTES_CSS_CLASSES,
            baseThemeConfig: BASE_THEME_CONFIG,
            noteNameTypes: NOTE_NAME_TYPES,
            midiMapToNote: Object.fromEntries(MIDI_MAP_TO_NOTE),
            noteMapToMidi: Object.fromEntries(NOTE_MAP_TO_MIDI),
            midiBounds: MIDI_BOUNDS,
            midiPresets: MIDI_PRESETS,
            notesPerColumn: NOTES_PER_COLUMN,
            noteScale: NOTE_SCALE,
            doReMiNoteScale: DO_RE_MI_NOTE_SCALE,
        })
    })

    it('reproduces the frozen pre-ADR-0003 surface exactly (equivalence proof)', () => {
        // The v1 fixture (config-surface.json) is FROZEN: it captured the surface as
        // the parallel-array GameDefinitions produced it. This derives that old shape
        // back out of the new folder-based config and must reproduce it byte-for-byte
        // — proving the conversion moved structure, never values.
        //
        // Documented, deliberate removals (deleted from the frozen copy below):
        //  - the four *Kinds sections: zero runtime consumers ever (instruments
        //    inlined copies), authoring role replaced by presets.json + shapes.ts
        //  - instrumentsData.Aurora_Short (Sky): orphaned data key with NO audio
        //    folder, unreachable through the INSTRUMENTS constructor guard; its
        //    legacy conversion tables in code are untouched
        //  - test_sustain (Sky): the dummy sustaining instrument (2026-08-04,
        //    predates the freeze) deleted 2026-08-05 when `sustained_recorder`
        //    replaced it — removed from both the list and the data below
        const frozen = readFixture('config-surface')
        delete frozen.layoutKinds
        delete frozen.layoutIconsKinds
        delete frozen.instrumentNoteLayoutKinds
        delete frozen.instrumentMidiLayoutKinds
        delete frozen.instrumentsData['Aurora_Short']
        delete frozen.instrumentsData['test_sustain']
        frozen.instruments = frozen.instruments.filter((name: string) => name !== 'test_sustain')

        // Instruments added AFTER the v1 freeze have no old surface to reproduce —
        // they exist only in the v2 fixture.
        const POST_FREEZE_INSTRUMENTS = new Set(['sustained_recorder'])

        const derivedInstrumentsData = Object.fromEntries(
            Object.entries(INSTRUMENTS_DATA)
                .filter(([name]) => !POST_FREEZE_INSTRUMENTS.has(name))
                .map(([name, data]) => {
                const labels = game.shapes[data.shape].labels
                const sustain = data.sustain
                    ? {
                        release: data.sustain.release,
                        ...(data.sustain.crossfade !== undefined
                            ? {crossfade: data.sustain.crossfade}
                            : {}),
                        loop: data.sustain.loop,
                        ...(data.notes.some((n) => n.loop)
                            ? {noteLoops: data.notes.map((n) => n.loop ?? null)}
                            : {}),
                    }
                    : undefined
                return [name, {
                    notes: data.notes.length,
                    family: data.family,
                    midiName: data.midiName,
                    ...(data.fill !== undefined ? {fill: data.fill} : {}),
                    ...(data.clickColor !== undefined ? {clickColor: data.clickColor} : {}),
                    baseNotes: data.notes.map((n) => n.baseNote),
                    layout: {
                        keyboardLayout: labels.keyboard,
                        numberLayout: labels.number,
                        abcLayout: labels.abc,
                        playstationLayout: labels.playstation,
                        switchLayout: labels.switch,
                    },
                    icons: data.notes.map((n) => n.icon),
                    midiNotes: data.notes.map((n) => n.midi),
                    ...(sustain !== undefined ? {sustain} : {}),
                }]
            })
        )

        const derived = JSON.parse(JSON.stringify({
            appName: APP_NAME,
            instruments: INSTRUMENTS.filter((name) => !POST_FREEZE_INSTRUMENTS.has(name)),
            instrumentsData: derivedInstrumentsData,
            pitches: PITCHES,
            tempoChangers: TEMPO_CHANGERS,
            baseLayerLimit: BASE_LAYER_LIMIT,
            composerNotePositions: COMPOSER_NOTE_POSITIONS,
            importNotePositions: IMPORT_NOTE_POSITIONS,
            notesCssClasses: NOTES_CSS_CLASSES,
            baseThemeConfig: BASE_THEME_CONFIG,
            noteNameTypes: NOTE_NAME_TYPES,
            midiMapToNote: Object.fromEntries(MIDI_MAP_TO_NOTE),
            noteMapToMidi: Object.fromEntries(NOTE_MAP_TO_MIDI),
            midiBounds: MIDI_BOUNDS,
            midiPresets: MIDI_PRESETS,
            notesPerColumn: NOTES_PER_COLUMN,
            noteScale: NOTE_SCALE,
            doReMiNoteScale: DO_RE_MI_NOTE_SCALE,
        }))
        expect(derived).toEqual(frozen)
    })
})
