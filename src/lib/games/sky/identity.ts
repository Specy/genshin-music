// The DOM-free identity half of this game's GameDefinition (see
// GameIdentity in ../types for the full rationale). This module exists so a non-UI
// bundle - today: the service worker, src/service-worker.ts - can resolve this game's
// storageId without importing games/sky/index.ts, which pulls in this game's 3 .svelte
// glyph components (notes.svgGlyphs) and would drag the Svelte runtime into a context
// (self: ServiceWorkerGlobalScope) that has no DOM and never renders anything.
//
// Zero imports besides the GameIdentity type - keep it that way. Since ADR-0003 the
// same two fields are ALSO authored in this folder's game.json (the data side needs
// them without importing TS); defineGame() asserts both sources agree at module eval
// and gameDefinitionConsistency.test.ts pins it, so they can never drift silently.
// Not a repo-wide claim - the build scripts keep their own `id:` GAMES-table
// entries, svelte.config.js resolves the same literal from PUBLIC_GAME, and
// `APP_NAME === 'Genshin'` comparisons are the two-tier-allowed reads catalogued in the
// app-name audit.
//
// storageId casing ('Sky', not 'sky') is LEGACY-LOCKED - see types.ts's GameId/StorageId
// header and spec §5.3: it is the IndexedDB database name, every
// localStorage/sessionStorage key prefix, the serialized `appName` inside songs/backups,
// and (what this module exists to give the service worker) its cache-name prefix. Never
// derive it from `id`.
import type { GameIdentity } from '../types';

export const GAME_IDENTITY: GameIdentity = { id: 'sky', storageId: 'Sky' };
