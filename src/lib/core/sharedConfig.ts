// Shared, game-INDEPENDENT constants. BASE_LAYER_LIMIT is deliberately NOT in
// GameDefinition: it is BigInt-capability-based, not game data (audit Step-3
// documented exception; both games' config-surface fixtures carry 52).
import type { BaseNote } from '$lib/games/types';

export const APP_VERSION = '4.0.0' as const

export const HAS_BIGINT = typeof BigInt !== 'undefined'

export const BASE_LAYER_LIMIT = HAS_BIGINT ? 52 : 30

// Minimum recorded-note duration (ms) that UI surfaces treat as a deliberate hold.
// Post-format-v3, EVERY recorded note carries its press→release time — ordinary taps
// land well under this, so hold visuals (practice bars, approach rings, sheet markers)
// only appear for genuinely held notes. Composed spans are explicit and don't use this.
export const SUSTAIN_VISUAL_THRESHOLD_MS = 250

// old Config.ts:854 — `export const FOLDER_FILTER_TYPES = ["alphabetical", "date-created"] as const`
export const FOLDER_FILTER_TYPES = ['alphabetical', 'date-created'] as const

// old Config.ts:17-19 — `export const UPDATE_URL = process.env.NODE_ENV === 'development' ?
// '/updates.json' : 'https://raw.githubusercontent.com/Specy/genshin-music/main/public/updates.json'`.
// Game-independent (same URL both games; needsUpdate.ts's checkIfneedsUpdate() indexes the fetched
// JSON by APP_NAME itself), so it lives here rather than legacyConfig.ts - same IS_DEV rationale as
// that file (Vite's import.meta.env.DEV instead of Node's process.env.NODE_ENV) but written
// directly since this file must stay importable without the $game alias.
export const UPDATE_URL = import.meta.env.DEV
    ? '/updates.json'
    : 'https://raw.githubusercontent.com/Specy/genshin-music/main/public/updates.json'

// old Config.ts:704-709 — `export const SPEED_CHANGERS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map(e
// => { return {name: \`x${e}\`, value: e} })`. Game-independent (same 7 multipliers both games) -
// Phase-4b Task 1.
export const SPEED_CHANGERS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map(e => {
    return {
        name: `x${e}`,
        value: e
    }
})

// old Config.ts:872-880 — `export const DEFAULT_DOM_RECT = {bottom: 0, height: 0, left: 0, right:
// 0, top: 0, width: 0, x: 0, y: 0} as DOMRect`. Static stub, game-independent - Phase-4b Task 1.
export const DEFAULT_DOM_RECT = {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
} as DOMRect

// old Config.ts:717-745 — `export const CACHE_DATA = {noteData: {background: "#d3bd8e", border:
// "#de6b45", center: "#de6b45"}, horizontalLineBreak: NOTES_PER_COLUMN / 3, standards: [...4
// entries...], layersCombination: new Array(16).fill(0).map((_, index) => index), breakpoints:
// [...2 entries...]}`. `horizontalLineBreak` is the ONE game-DEPENDENT member (it is literally
// `NOTES_PER_COLUMN / 3`) - deliberately NOT included here; each consumer derives it itself from
// `game.notes.perColumn / 3` (Phase-4c ComposerCache/VsrgComposerCache). The other four members are
// byte-identical across both games, so they live here as COMPOSER_CACHE_DATA - Phase-4c Task 1
// (ComposerCache/VsrgComposerCache texture/color source).
export const COMPOSER_CACHE_DATA = {
    noteData: {
        background: '#d3bd8e',
        border: '#de6b45',
        center: '#de6b45',
    },
    standards: [
        {
            color: 0x515c6f, //lighter
        }, {
            color: 0x485363, //darker
        }, {
            color: 0x1a968b, //current
        }, {
            color: 0xd6722f, //selected
        },
    ],
    layersCombination: new Array(16).fill(0).map((_, index) => index),
    breakpoints: [
        {
            type: 'short',
            color: '#282875',
        }, {
            type: 'long',
            color: '#282875',
        },
    ],
}

// old Config.ts:774 — `export const VSRG_TEMPO_CHANGER = [2, 1.75, 1.5, 1.25, 1, 0.75, 0.50, 0.25]`.
// Game-independent (same 8 speed multipliers both games) - Phase-4c Task 1 (VsrgComposer timeline
// speed control). NOTE: old Config.ts:773 also exports `EMPTY_LAYER = "0000"` immediately above
// this - deliberately NOT ported here (restore-with-consumer rule): `git grep EMPTY_LAYER` on the
// old tree shows zero real consumers of that Config.ts export anywhere in old src (Layer.ts and
// SongClasses.ts each hardcode their own independent "0000"-based constant instead of importing
// it) - it was dead code in the old app too.
export const VSRG_TEMPO_CHANGER = [2, 1.75, 1.5, 1.25, 1, 0.75, 0.50, 0.25]

// old Config.ts:841-844 — `export const DEFAULT_VSRG_KEYS_MAP = {4: ["A", "S", "G", "H"], 6: ["A",
// "S", "D", "G", "H", "J"]}`. Game-independent (both games' VSRG songs share the same 4-key/6-key
// default layouts) - Phase-4c Task 1 (VsrgPlayerSettings default keyboard-key assignment).
export const DEFAULT_VSRG_KEYS_MAP = {
    4: ['A', 'S', 'G', 'H'],
    6: ['A', 'S', 'D', 'G', 'H', 'J'],
}

// old Config.ts:845-853 — `export const VSRG_SCORE_COLOR_MAP = {amazing: '#cff3e3', perfect:
// '#d9af0a', great: '#358a55 ', good: '#380cc4', bad: '#dd8d46', miss: '#f24b5b', '': '#ffffff'}`.
// Game-independent (VSRG scoring UI colors are shared) - Phase-4c Task 1. PRESERVED QUIRK: `great`'s
// value has a trailing space baked into the hex string (`'#358a55 '`) - a pre-existing old-data
// typo, kept byte-for-byte (flag, never silently fix).
export const VSRG_SCORE_COLOR_MAP = {
    amazing: '#cff3e3',
    perfect: '#d9af0a',
    great: '#358a55 ',
    good: '#380cc4',
    bad: '#dd8d46',
    miss: '#f24b5b',
    '': '#ffffff',
}

// Not from old Config.ts: new tracks used to all be born '#FFFFFF', so every track in the vsrg
// composer looked identical until the user opened track settings and picked a color by hand.
// VsrgSong.addTrack() walks this palette instead, taking the first entry no existing track is
// already using (and wrapping once all 16 are taken). White stays FIRST so a song's first track
// still looks exactly as it always has, and only the second one onward picks up a color.
// Deserialization is deliberately NOT routed through this - saved songs keep whatever color
// they stored.
export const VSRG_TRACK_COLORS = [
    '#ffffff', '#d16d6d', '#d1a56d', '#c9d16d',
    '#8ed16d', '#6dd192', '#6dd1c4', '#6db4d1',
    '#6d84d1', '#8a6dd1', '#b96dd1', '#d16dae',
    '#d16d80', '#b58b5e', '#5eb58b', '#5e7db5',
]

// old Config.ts:865-868 — `export const PIXI_VERTICAL_ALIGN = {x: 0.5, y: 0}`,
// `PIXI_HORIZONTAL_ALIGN = {x: 0, y: 0.5}`, `PIXI_CENTER_X_END_Y = {x: 0.5, y: 1}`,
// `PIXI_CENTER_ALIGN = 0.5`. pixi.js `anchor`/`align` values for text/sprite layout -
// game-independent, Phase-4c Task 1 (the three renderer classes' text/sprite alignment).
export const PIXI_VERTICAL_ALIGN = {x: 0.5, y: 0}
export const PIXI_HORIZONTAL_ALIGN = {x: 0, y: 0.5}
export const PIXI_CENTER_X_END_Y = {x: 0.5, y: 1}
export const PIXI_CENTER_ALIGN = 0.5

// ---- shared music theory (moved out of per-game GameDefinitions, ADR-0003) ----
// Byte-identical in both games' definitions before the folder-based config change
// (verified programmatically during extraction): these are western-scale spelling
// tables, not game data. Types live in $lib/games/types; legacyConfig re-exports
// these under the same historical names.

export const PITCHES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const

export const NOTE_SCALE: Readonly<Record<BaseNote, readonly string[]>> = {
  Cb: ['Cb', 'Dbb', 'Db', 'Ebb', 'Eb', 'Fb', 'Gbb', 'Gb', 'Abb', 'Ab', 'Bbb', 'Bb'],
  C: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
  'C#': ['C#', 'D', 'D#', 'E', 'E#', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'B#'],
  Db: ['Db', 'Ebb', 'Eb', 'Fb', 'F', 'Gb', 'Abb', 'Ab', 'Bbb', 'Bb', 'Cb', 'C'],
  D: ['D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B', 'C', 'C#'],
  'D#': ['D#', 'E', 'E#', 'F#', 'F##', 'G#', 'A', 'A#', 'B', 'B#', 'C#', 'C##'],
  Eb: ['Eb', 'Fb', 'F', 'Gb', 'G', 'Ab', 'Bbb', 'Bb', 'Cb', 'C', 'Db', 'D'],
  E: ['E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B', 'C', 'C#', 'D', 'D#'],
  'E#': ['E#', 'F#', 'F##', 'G#', 'G##', 'A#', 'B', 'B#', 'C#', 'C##', 'D#', 'D##'],
  Fb: ['Fb', 'Gbb', 'Gb', 'Abb', 'Ab', 'Bbb', 'Cbb', 'Cb', 'Dbb', 'Db', 'Ebb', 'Eb'],
  F: ['F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'Cb', 'C', 'Db', 'D', 'Eb', 'E'],
  'F#': ['F#', 'G', 'G#', 'A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'E#'],
  Gb: ['Gb', 'Abb', 'Ab', 'Bbb', 'Bb', 'Cb', 'Dbb', 'Db', 'Ebb', 'Eb', 'Fb', 'F'],
  G: ['G', 'Ab', 'A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#'],
  'G#': ['G#', 'A', 'A#', 'B', 'B#', 'C#', 'D', 'D#', 'E', 'E#', 'F#', 'F##'],
  Ab: ['Ab', 'Bbb', 'Bb', 'Cb', 'C', 'Db', 'Ebb', 'Eb', 'Fb', 'F', 'Gb', 'G'],
  A: ['A', 'Bb', 'B', 'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#'],
  'A#': ['A#', 'B', 'B#', 'C#', 'C##', 'D#', 'E', 'E#', 'F#', 'F##', 'G#', 'G##'],
  Bb: ['Bb', 'Cb', 'C', 'Db', 'D', 'Eb', 'Fb', 'F', 'Gb', 'G', 'Ab', 'A'],
  B: ['B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#'],
  'B#': ['B#', 'C#', 'C##', 'D#', 'D##', 'E#', 'F#', 'F##', 'G#', 'G##', 'A#', 'A##'],
  '': ['', '', '', '', '', '', '', '', '', '', '', ''],
}

export const DO_RE_MI_NOTE_SCALE: Readonly<Record<BaseNote, readonly string[]>> = {
  Cb: [
    'dob',
    'rebb',
    'reb',
    'mibb',
    'mib',
    'fab',
    'solbb',
    'solb',
    'labb',
    'lab',
    'tibb',
    'tib',
  ],
  C: ['do', 'reb', 're', 'mib', 'mi', 'fa', 'solb', 'sol', 'lab', 'la', 'tib', 'ti'],
  'C#': ['do#', 're', 're#', 'mi', 'mi#', 'fa#', 'sol', 'sol#', 'la', 'la#', 'ti', 'ti#'],
  Db: ['reb', 'mibb', 'mib', 'fab', 'fa', 'solb', 'labb', 'lab', 'tibb', 'tib', 'dob', 'do'],
  D: ['re', 'mib', 'mi', 'fa', 'fa#', 'sol', 'lab', 'la', 'tib', 'ti', 'do', 'do#'],
  'D#': ['re#', 'mi', 'mi#', 'fa#', 'fa##', 'sol#', 'la', 'la#', 'ti', 'ti#', 'do#', 'do##'],
  Eb: ['mib', 'fab', 'fa', 'solb', 'sol', 'lab', 'tibb', 'tib', 'dob', 'do', 'reb', 're'],
  E: ['mi', 'fa', 'fa#', 'sol', 'sol#', 'la', 'tib', 'ti', 'do', 'do#', 're', 're#'],
  'E#': [
    'mi#',
    'fa#',
    'fa##',
    'sol#',
    'sol##',
    'la#',
    'ti',
    'ti#',
    'do#',
    'do##',
    're#',
    're##',
  ],
  Fb: [
    'fab',
    'solbb',
    'solb',
    'labb',
    'lab',
    'tibb',
    'dobb',
    'dob',
    'rebb',
    'reb',
    'mibb',
    'mib',
  ],
  F: ['fa', 'solb', 'sol', 'lab', 'la', 'tib', 'dob', 'do', 'reb', 're', 'mib', 'mi'],
  'F#': ['fa#', 'sol', 'sol#', 'la', 'la#', 'ti', 'do', 'do#', 're', 're#', 'mi', 'mi#'],
  Gb: ['solb', 'labb', 'lab', 'tibb', 'tib', 'dob', 'rebb', 'reb', 'mibb', 'mib', 'fab', 'fa'],
  G: ['sol', 'lab', 'la', 'tib', 'ti', 'do', 'reb', 're', 'mib', 'mi', 'fa', 'fa#'],
  'G#': ['sol#', 'la', 'la#', 'ti', 'ti#', 'do#', 're', 're#', 'mi', 'mi#', 'fa#', 'fa##'],
  Ab: ['lab', 'tibb', 'tib', 'dob', 'do', 'reb', 'mibb', 'mib', 'fab', 'fa', 'solb', 'sol'],
  A: ['la', 'tib', 'ti', 'do', 'do#', 're', 'mib', 'mi', 'fa', 'fa#', 'sol', 'sol#'],
  'A#': ['la#', 'ti', 'ti#', 'do#', 'do##', 're#', 'mi', 'mi#', 'fa#', 'fa##', 'sol#', 'sol##'],
  Bb: ['tib', 'dob', 'do', 'reb', 're', 'mib', 'fab', 'fa', 'solb', 'sol', 'lab', 'la'],
  B: ['ti', 'do', 'do#', 're', 're#', 'mi', 'fa', 'fa#', 'sol', 'sol#', 'la', 'la#'],
  'B#': [
    'ti#',
    'do#',
    'do##',
    're#',
    're##',
    'mi#',
    'fa#',
    'fa##',
    'sol#',
    'sol##',
    'la#',
    'la##',
  ],
  '': ['', '', '', '', '', '', '', '', '', '', '', ''],
}
