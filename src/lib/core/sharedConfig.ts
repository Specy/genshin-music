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
