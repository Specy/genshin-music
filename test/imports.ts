// Config constants (game-dependent surface)
export {
    APP_NAME,
    APP_VERSION,
    PITCHES,
    INSTRUMENTS,
    INSTRUMENTS_DATA,
    NOTES_PER_COLUMN,
    NOTE_SCALE,
    DO_RE_MI_NOTE_SCALE,
    INSTRUMENT_NOTE_LAYOUT_KINDS,
    INSTRUMENT_MIDI_LAYOUT_KINDS,
    LAYOUT_KINDS,
    LAYOUT_ICONS_KINDS,
    TEMPO_CHANGERS,
    BASE_LAYER_LIMIT,
    COMPOSER_NOTE_POSITIONS,
    IMPORT_NOTE_POSITIONS,
    NOTES_CSS_CLASSES,
    BASE_THEME_CONFIG,
    NOTE_NAME_TYPES,
    MIDI_MAP_TO_NOTE,
    NOTE_MAP_TO_MIDI,
    MIDI_BOUNDS,
    MIDI_PRESETS,
} from '$config'
// Domain models
export {NoteLayer} from '$lib/Songs/Layer'
export {ColumnNote, NoteColumn, InstrumentData, RecordedNote} from '$lib/Songs/SongClasses'
export {Song, extractStorable} from '$lib/Songs/Song'
export {ComposedSong, defaultInstrumentMap} from '$lib/Songs/ComposedSong'
export {RecordedSong} from '$lib/Songs/RecordedSong'
export {VsrgHitObject, VsrgSong, VsrgTrack, VsrgTrackModifier} from '$lib/Songs/VsrgSong'
export {Folder} from '$lib/Folder'
// Theme
export {BaseTheme, Theme, ThemeProvider} from '$stores/ThemeStore/ThemeProvider'
// Settings defaults
export {
    ComposerSettings,
    PlayerSettings,
    MIDISettings,
    ThemeSettings,
    VsrgComposerSettings,
    VsrgPlayerSettings,
    ZenKeyboardSettings,
} from '$lib/BaseSettings'
// Import pipeline (pulls DbInstance -> ZangoDB -> needs fake-indexeddb from setup)
export {songService} from '$lib/Services/SongService'
