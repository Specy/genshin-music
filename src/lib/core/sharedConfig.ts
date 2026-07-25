// Shared, game-INDEPENDENT constants. BASE_LAYER_LIMIT is deliberately NOT in
// GameDefinition: it is BigInt-capability-based, not game data (audit Step-3
// documented exception; both games' config-surface fixtures carry 52).
export const APP_VERSION = '3.7.0' as const

export const HAS_BIGINT = typeof BigInt !== 'undefined'

export const BASE_LAYER_LIMIT = HAS_BIGINT ? 52 : 30

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

// old Config.ts:865-868 — `export const PIXI_VERTICAL_ALIGN = {x: 0.5, y: 0}`,
// `PIXI_HORIZONTAL_ALIGN = {x: 0, y: 0.5}`, `PIXI_CENTER_X_END_Y = {x: 0.5, y: 1}`,
// `PIXI_CENTER_ALIGN = 0.5`. pixi.js `anchor`/`align` values for text/sprite layout -
// game-independent, Phase-4c Task 1 (the three renderer classes' text/sprite alignment).
export const PIXI_VERTICAL_ALIGN = {x: 0.5, y: 0}
export const PIXI_HORIZONTAL_ALIGN = {x: 0, y: 0.5}
export const PIXI_CENTER_X_END_Y = {x: 0.5, y: 1}
export const PIXI_CENTER_ALIGN = 0.5
