// Phase-1 placeholder shape. Phase 2 replaces this with the full
// GameDefinition from docs/superpowers/audits/2026-07-19-app-name-audit.md.
//
// TEMPORARY (Phase 2 in progress, Task 2 of N): genshin/index.ts now exports the
// full GameDefinition (src/lib/games/types.ts); sky/index.ts still exports this
// GameSkeleton until Task 3 ports Sky's data. `$game` resolves to whichever
// module the build selects (svelte.config.js), so both shapes must keep
// satisfying every current `$game` read — hence `meta.title` is added here too,
// mirroring GameDefinition.meta.title. Task 3 deletes GameSkeleton entirely once
// both games export GameDefinition.
export interface GameSkeleton {
    /** lowercase id: asset paths, PUBLIC_GAME env, folder names */
    id: 'genshin' | 'sky'
    /** LEGACY-LOCKED cased id: IndexedDB name, localStorage prefixes,
     *  appName inside serialized songs. Never derived from `id`. */
    storageId: 'Genshin' | 'Sky'
    displayName: string
    meta: {title: string}
}
