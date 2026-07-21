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
} from '$core/legacyConfig'
// Domain models
export {NoteLayer} from '$core/Songs/Layer'
export {ColumnNote, NoteColumn, InstrumentData, RecordedNote} from '$core/Songs/SongClasses'
export {Song, extractStorable} from '$core/Songs/Song'
export {ComposedSong, defaultInstrumentMap} from '$core/Songs/ComposedSong'
// `Chunk` here is RecordedSong's own chunk class (notes/delay pair) - NOT the same class as
// VisualSong's `Chunk` below (deliberately distinct, see VisualSong.ts's header comment); only one
// of the two is re-exported under this name from this barrel, so no collision.
export {Chunk, RecordedSong} from '$core/Songs/RecordedSong'
export {VisualSong, TempoChunk} from '$core/Songs/VisualSong'
export {VsrgHitObject, VsrgSong, VsrgTrack, VsrgTrackModifier} from '$core/Songs/VsrgSong'
export {Folder} from '$core/Folder'
// Theme
export {BaseTheme, Theme, ThemeProvider} from '$core/theme/ThemeProvider.svelte'
// Settings defaults
export {
    ComposerSettings,
    PlayerSettings,
    MIDISettings,
    ThemeSettings,
    VsrgComposerSettings,
    VsrgPlayerSettings,
    ZenKeyboardSettings,
} from '$core/BaseSettings'
// Import pipeline (pulls DbInstance -> ZangoDB -> needs fake-indexeddb from setup)
export {songService} from '$core/Services/SongService'
