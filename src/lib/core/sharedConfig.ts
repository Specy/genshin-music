// Shared, game-INDEPENDENT constants. BASE_LAYER_LIMIT is deliberately NOT in
// GameDefinition: it is BigInt-capability-based, not game data (audit Step-3
// documented exception; both games' config-surface fixtures carry 52).
export const APP_VERSION = '3.7.0' as const

export const HAS_BIGINT = typeof BigInt !== 'undefined'

export const BASE_LAYER_LIMIT = HAS_BIGINT ? 52 : 30
