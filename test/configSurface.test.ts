import {describe, it} from 'vitest'
import {
    APP_NAME, BASE_LAYER_LIMIT, BASE_THEME_CONFIG, COMPOSER_NOTE_POSITIONS,
    DO_RE_MI_NOTE_SCALE, IMPORT_NOTE_POSITIONS, INSTRUMENT_MIDI_LAYOUT_KINDS,
    INSTRUMENT_NOTE_LAYOUT_KINDS, INSTRUMENTS, INSTRUMENTS_DATA, LAYOUT_ICONS_KINDS,
    LAYOUT_KINDS, MIDI_BOUNDS, MIDI_MAP_TO_NOTE, MIDI_PRESETS, NOTE_MAP_TO_MIDI,
    NOTE_NAME_TYPES, NOTE_SCALE, NOTES_CSS_CLASSES, NOTES_PER_COLUMN, PITCHES,
    TEMPO_CHANGERS,
} from './imports'
import {expectGolden} from './golden'

describe('game config surface', () => {
    it('all game-defining constants are stable', () => {
        // This fixture is the acceptance contract for the future GameDefinition:
        // games/<id>/ must reproduce every value here exactly.
        expectGolden('config-surface', {
            appName: APP_NAME,
            instruments: INSTRUMENTS,
            instrumentsData: INSTRUMENTS_DATA,      // functions/components drop in JSON
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
            // Added beyond the brief's baseline (see task-8 discovery): these are
            // clearly part of the per-game surface and a future GameDefinition
            // must reproduce them too.
            notesPerColumn: NOTES_PER_COLUMN,
            noteScale: NOTE_SCALE,
            doReMiNoteScale: DO_RE_MI_NOTE_SCALE,
            instrumentNoteLayoutKinds: INSTRUMENT_NOTE_LAYOUT_KINDS,
            instrumentMidiLayoutKinds: INSTRUMENT_MIDI_LAYOUT_KINDS,
            layoutKinds: LAYOUT_KINDS,
            layoutIconsKinds: LAYOUT_ICONS_KINDS,
        })
    })
})
