// Shared, game-INDEPENDENT constants. BASE_LAYER_LIMIT is deliberately NOT in
// GameDefinition: it is BigInt-capability-based, not game data (audit Step-3
// documented exception; both games' config-surface fixtures carry 52).
export const APP_VERSION = '3.7.0' as const

export const HAS_BIGINT = typeof BigInt !== 'undefined'

export const BASE_LAYER_LIMIT = HAS_BIGINT ? 52 : 30

// old Config.ts:17-19 — `export const UPDATE_URL = process.env.NODE_ENV === 'development' ?
// '/updates.json' : 'https://raw.githubusercontent.com/Specy/genshin-music/main/public/updates.json'`.
// Game-independent (same URL both games; needsUpdate.ts's checkIfneedsUpdate() indexes the fetched
// JSON by APP_NAME itself), so it lives here rather than legacyConfig.ts - same IS_DEV rationale as
// that file (Vite's import.meta.env.DEV instead of Node's process.env.NODE_ENV) but written
// directly since this file must stay importable without the $game alias.
export const UPDATE_URL = import.meta.env.DEV
    ? '/updates.json'
    : 'https://raw.githubusercontent.com/Specy/genshin-music/main/public/updates.json'
