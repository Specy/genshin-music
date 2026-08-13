// DOMAIN-CORE LEGACY ADAPTER.
// Re-derives every old src/Config.ts constant from the selected GameDefinition
// so ported domain files change only their import path ($config -> $core/legacyConfig).
// Frozen at build time BY DESIGN (the $game alias is static).
// UI-TIER IMPORT RULE (amended, Phase-3 final review; BASE_LAYER_LIMIT added
// Phase-4a Task 1, closing the P3-final-review Minor-1 residual; FOLDER_FILTER_TYPES added
// task-5 review; SPEED_CHANGERS/DEFAULT_DOM_RECT added Phase-4b Task 1; COMPOSER_CACHE_DATA/
// VSRG_TEMPO_CHANGER/DEFAULT_VSRG_KEYS_MAP/VSRG_SCORE_COLOR_MAP/PIXI_VERTICAL_ALIGN/
// PIXI_HORIZONTAL_ALIGN/PIXI_CENTER_X_END_Y/PIXI_CENTER_ALIGN added Phase-4c Task 1): UI code MAY
// import IDENTITY/SHARED constants from this adapter — APP_NAME, APP_VERSION,
// LANG_PREFERENCE_KEY_NAME, UPDATE_MESSAGE, IS_DEV, BASE_LAYER_LIMIT, FOLDER_FILTER_TYPES,
// SPEED_CHANGERS, DEFAULT_DOM_RECT, COMPOSER_CACHE_DATA, VSRG_TEMPO_CHANGER,
// DEFAULT_VSRG_KEYS_MAP, VSRG_SCORE_COLOR_MAP, PIXI_VERTICAL_ALIGN, PIXI_HORIZONTAL_ALIGN,
// PIXI_CENTER_X_END_Y, PIXI_CENTER_ALIGN — because they are identity-locked
// (APP_NAME = game.storageId), game-independent, or simply constants re-exported from
// sharedConfig — constants re-exported from sharedConfig qualify the same way
// game-independent ones do.
// GAME-DATA constants (PITCHES, INSTRUMENTS, LAYOUT_*, MIDI_*, NOTE_*, ...)
// remain FORBIDDEN in UI code: read those from $game directly (spec §5.2).
// AUDIO/PROVIDER-TIER CARVE-OUT (whole-branch final review, finding B): the UI-TIER IMPORT RULE
// above governs UI/component code and its VALUE imports. It does not cover $lib/audio/
// Instrument.svelte.ts or $lib/providers/MIDIProvider.ts, two non-UI engine/provider files that
// minimal-diff-ported their old `$config` import lists verbatim and so also import the GAME-DATA
// values INSTRUMENTS, INSTRUMENTS_DATA, NOTE_SCALE, DO_RE_MI_NOTE_SCALE, PITCH_TO_INDEX
// (Instrument.svelte.ts) and MIDI_PRESETS (MIDIProvider.ts) from here (Pitch/NoteNameType are
// type-only imports and were never a value-import concern). This is documentation-only: five of
// those six are direct `game.*` aliases below, so importing them from here is behaviorally
// identical to reading `$game` directly; the sixth, PITCH_TO_INDEX, is instead a pure build-time
// derivation of one (`new Map(PITCHES.map(...))` over PITCHES = game.notes.pitches) that has NO
// `$game` equivalent to read instead - it exists only here, exactly as it existed only in old
// Config.ts. Either way no game-selection coupling is added beyond what the adapter already has.
// The carve-out is scoped to exactly these two named files - it is not a license for UI code to
// do the same.
// The config-surface golden fixture is the acceptance test for these derivations.
import {game} from '$game'
import type {Pitch, NoteNameType, TempoChanger, MIDIPreset, StorageId} from '../games/types'
import {
    APP_VERSION,
    HAS_BIGINT,
    BASE_LAYER_LIMIT,
    SUSTAIN_VISUAL_THRESHOLD_MS,
    FOLDER_FILTER_TYPES,
    SPEED_CHANGERS,
    DEFAULT_DOM_RECT,
    COMPOSER_CACHE_DATA,
    VSRG_TEMPO_CHANGER,
    DEFAULT_VSRG_KEYS_MAP,
    VSRG_SCORE_COLOR_MAP,
    VSRG_TRACK_COLORS,
    PIXI_VERTICAL_ALIGN,
    PIXI_HORIZONTAL_ALIGN,
    PIXI_CENTER_X_END_Y,
    PIXI_CENTER_ALIGN,
    PITCHES,
    NOTE_SCALE,
    DO_RE_MI_NOTE_SCALE,
} from './sharedConfig'

// ---- re-exported type aliases (old files import these from $config) ----
export type {Pitch, NoteNameType, TempoChanger, MIDIPreset}
export type AppName = StorageId

// ---- re-exported shared (game-independent) constants ----
export {
    APP_VERSION,
    HAS_BIGINT,
    BASE_LAYER_LIMIT,
    SUSTAIN_VISUAL_THRESHOLD_MS,
    FOLDER_FILTER_TYPES,
    SPEED_CHANGERS,
    DEFAULT_DOM_RECT,
    COMPOSER_CACHE_DATA,
    VSRG_TEMPO_CHANGER,
    DEFAULT_VSRG_KEYS_MAP,
    VSRG_SCORE_COLOR_MAP,
    VSRG_TRACK_COLORS,
    PIXI_VERTICAL_ALIGN,
    PIXI_HORIZONTAL_ALIGN,
    PIXI_CENTER_X_END_Y,
    PIXI_CENTER_ALIGN,
}

// ---- identity ----
export const APP_NAME: AppName = game.storageId

// ---- pitches (music theory — sharedConfig since ADR-0003, identical across games) ----
export {PITCHES}
// old Config.ts:712 — `export const PITCH_TO_INDEX = new Map<Pitch, number>(PITCHES.map((pitch, index) => [pitch, index]))`
export const PITCH_TO_INDEX = new Map<Pitch, number>(PITCHES.map((pitch, index) => [pitch, index]))

// ---- instruments ----
export const INSTRUMENTS = game.instruments.list
export const INSTRUMENTS_DATA = game.instruments.data

// ---- note geometry ----
export const NOTES_PER_COLUMN = game.notes.perColumn
// NOTE_SCALE / DO_RE_MI_NOTE_SCALE moved to sharedConfig (ADR-0003): music theory,
// byte-identical across games. Re-exported here under the historical names.
export {NOTE_SCALE, DO_RE_MI_NOTE_SCALE}
export const NOTES_CSS_CLASSES = game.notes.cssClasses
export const NOTE_NAME_TYPES = game.notes.nameTypes
// ADR-0004: the Song Grid's ordered Note Ids — index N pairs with
// COMPOSER_NOTE_POSITIONS[N], so a note's canvas row follows from its id alone.
export const CANONICAL_NOTE_IDS = game.notes.canonicalNoteIds
export const COMPOSER_NOTE_POSITIONS = game.notes.composerPositions
export const IMPORT_NOTE_POSITIONS = game.notes.importPositions

// ---- layouts ----
// The four *_KINDS exports died with ADR-0003: they had zero runtime consumers
// (instruments inlined copies instead of referencing them), and their authoring
// role is replaced by Note Presets (presets.json) + Shape Label Sets (shapes.ts).

// ---- note rendering defaults (ADR-0003 cleanup: these replace the literal
// `APP_NAME === 'Genshin' ? … : …` ternaries in PlayerStore/ObservableNote that
// duplicated existing GameDefinition fields) ----
export const NOTE_ANIMATION_DELAY_MS = game.notes.animationDelayMs
export const DEFAULT_NOTE_ICON = game.notes.defaultIcon

// ---- composer ----
export const TEMPO_CHANGERS = game.composer.tempoChangers

// ---- theme ----
export const BASE_THEME_CONFIG = game.themes.baseConfig

// ---- MIDI ----
// old Config.ts:775 built this as `new Map(Object.entries(APP_NAME === 'Sky' ? {...} : {...}))`
// over a plain object keyed by MIDI note number. Object.entries() always stringifies numeric
// object keys, so the resulting Map is STRING-keyed - consumers rely on this exact shape (e.g.
// `MIDI_MAP_TO_NOTE.get(\`${midiNote}\`)` in Songs/SongClasses.ts). Preserve it exactly.
export const MIDI_MAP_TO_NOTE = new Map(Object.entries(game.midi.mapToNote))

// Derivation loop copied verbatim from old Config.ts:869-871 (comment included):
//   //get only non accidentals
//   const entries = Object.entries(Object.fromEntries(MIDI_MAP_TO_NOTE)).filter(([k, v]) => v[1] === false)
//   export const NOTE_MAP_TO_MIDI = new Map(entries.map(([k, v]) => [v[0], Number(k)]))
//get only non accidentals
const entries = Object.entries(Object.fromEntries(MIDI_MAP_TO_NOTE)).filter(([k, v]) => v[1] === false)
export const NOTE_MAP_TO_MIDI = new Map(entries.map(([k, v]) => [v[0], Number(k)]))

export const MIDI_BOUNDS = game.midi.bounds
export const MIDI_PRESETS = game.midi.presets

// ---- i18n / misc (game-independent) ----
// old Config.ts:887 — `export const IS_DEV = process.env.NODE_ENV === "development"`. Derived via
// Vite's build-time `import.meta.env.DEV` instead of Node's `process.env.NODE_ENV`: same meaning
// (true outside production builds), but keeps this file framework/tool-agnostic (no SvelteKit
// `$app/environment` coupling - core must stay importable outside the SvelteKit module graph,
// e.g. under plain vitest) and matches how Vite itself expects this check to be written.
export const IS_DEV = import.meta.env.DEV
// old Config.ts:888 — `export const LANG_PREFERENCE_KEY_NAME = APP_NAME + "_Lang"`
export const LANG_PREFERENCE_KEY_NAME = APP_NAME + '_Lang'
// old Config.ts:7-15 — `export const UPDATE_MESSAGE = (APP_NAME === 'Genshin' ? \`...\` :
// \`...\`).trim()` (changelog-toast body shown by needsUpdate.ts). Game-DEPENDENT (unlike the rest
// of this section) - both games' literal text already collapsed to one string during the
// GameDefinition port (P2 Task 2/3 note: pre-existing upstream copy-paste artifact, byte-identical
// both games), stored as game.i18n.updateMessage.
export const UPDATE_MESSAGE = game.i18n.updateMessage
