// DOMAIN-CORE LEGACY ADAPTER.
// Re-derives every old src/Config.ts constant from the selected GameDefinition
// so ported domain files change only their import path ($config -> $core/legacyConfig).
// Frozen at build time BY DESIGN (the $game alias is static). UI code must NOT
// import this file - it reads $game fields directly (spec §5.2/§5.5).
// The config-surface golden fixture is the acceptance test for these derivations.
import {game} from '$game'
import type {Pitch, NoteNameType, TempoChanger, MIDIPreset, StorageId} from '../games/types'
import {APP_VERSION, HAS_BIGINT, BASE_LAYER_LIMIT} from './sharedConfig'

// ---- re-exported type aliases (old files import these from $config) ----
export type {Pitch, NoteNameType, TempoChanger, MIDIPreset}
export type AppName = StorageId

// ---- re-exported shared (game-independent) constants ----
export {APP_VERSION, HAS_BIGINT, BASE_LAYER_LIMIT}

// ---- identity ----
export const APP_NAME: AppName = game.storageId

// ---- pitches ----
export const PITCHES = game.notes.pitches
// old Config.ts:712 — `export const PITCH_TO_INDEX = new Map<Pitch, number>(PITCHES.map((pitch, index) => [pitch, index]))`
export const PITCH_TO_INDEX = new Map<Pitch, number>(PITCHES.map((pitch, index) => [pitch, index]))

// ---- instruments ----
export const INSTRUMENTS = game.instruments.list
export const INSTRUMENTS_DATA = game.instruments.data

// ---- note geometry ----
export const NOTES_PER_COLUMN = game.notes.perColumn
export const NOTE_SCALE = game.notes.scale
export const DO_RE_MI_NOTE_SCALE = game.notes.doReMiScale
export const NOTES_CSS_CLASSES = game.notes.cssClasses
export const NOTE_NAME_TYPES = game.notes.nameTypes
export const COMPOSER_NOTE_POSITIONS = game.notes.composerPositions
export const IMPORT_NOTE_POSITIONS = game.notes.importPositions

// ---- layouts ----
export const INSTRUMENT_NOTE_LAYOUT_KINDS = game.layouts.noteLayoutKinds
export const INSTRUMENT_MIDI_LAYOUT_KINDS = game.layouts.midiLayoutKinds
export const LAYOUT_KINDS = game.layouts.layoutKinds
export const LAYOUT_ICONS_KINDS = game.layouts.iconKinds

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

// ---- folders (game-independent) ----
// old Config.ts:854 — `export const FOLDER_FILTER_TYPES = ["alphabetical", "date-created"] as const`
export const FOLDER_FILTER_TYPES = ['alphabetical', 'date-created'] as const
