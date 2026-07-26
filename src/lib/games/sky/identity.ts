// Phase 5 Task 1: the DOM-free identity half of this game's GameDefinition (see
// GameIdentity in ../types for the full rationale). This module exists so a non-UI
// bundle - today: the service worker, src/service-worker.ts - can resolve this game's
// storageId without importing games/sky/index.ts, which pulls in this game's 3 .svelte
// glyph components (notes.svgGlyphs) and would drag the Svelte runtime into a context
// (self: ServiceWorkerGlobalScope) that has no DOM and never renders anything.
//
// Zero imports besides the GameIdentity type - keep it that way. games/sky/index.ts
// imports GAME_IDENTITY from here (not the other way around), so this game's 'sky' /
// 'Sky' literals exist exactly once in the whole tree.
//
// storageId casing ('Sky', not 'sky') is LEGACY-LOCKED - see types.ts's GameId/StorageId
// header and spec §5.3: it is the IndexedDB database name, every
// localStorage/sessionStorage key prefix, the serialized `appName` inside songs/backups,
// and (what this module exists to give the service worker) its cache-name prefix. Never
// derive it from `id`.
import type {GameIdentity} from '../types'

export const GAME_IDENTITY: GameIdentity = {id: 'sky', storageId: 'Sky'}
