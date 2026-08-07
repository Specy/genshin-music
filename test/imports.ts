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
export {ApproachingNote, NoteColumn, InstrumentData, MidiNote, RecordedNote, Recording} from '$core/Songs/SongClasses'
// ColumnNote is plain data, not a class - it MUST stay on its own `export type` line. Left in the
// value list above it does NOT fail loudly (verified: vitest links the module fine and the name
// just resolves to undefined), and no other gate would catch it either - tsconfig's `exclude` keeps
// test/ out of check:sky, and eslint/prettier both ignore test/.
export type {ColumnNote} from '$core/Songs/SongClasses'
export {Song, extractStorable} from '$core/Songs/Song.svelte'
export {ComposedSong, defaultInstrumentMap} from '$core/Songs/ComposedSong.svelte'
// `Chunk` here is RecordedSong's own chunk class (notes/delay pair) - NOT the same class as
// VisualSong's `Chunk` below (deliberately distinct, see VisualSong.ts's header comment); only one
// of the two is re-exported under this name from this barrel, so no collision.
export {Chunk, RecordedSong} from '$core/Songs/RecordedSong'
export {VisualSong, TempoChunk} from '$core/Songs/VisualSong'
// ...and the OTHER `Chunk`, under a name that does not collide: test/serializePlain.test.ts's
// per-class registry has to name both, and they are genuinely two different classes.
export {Chunk as VisualChunk} from '$core/Songs/VisualSong'
export {LEGACY_NOTE_TABLES} from '$core/Songs/legacyNoteTables'
export {SIMILAR_INSTRUMENTS} from '$core/Songs/instrumentSimilarity'
export {VsrgHitObject, VsrgSong, VsrgTrack, VsrgTrackModifier} from '$core/Songs/VsrgSong.svelte'
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
