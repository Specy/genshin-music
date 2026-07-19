// Phase-1 placeholder shape. Phase 2 replaces this with the full
// GameDefinition from docs/superpowers/audits/2026-07-19-app-name-audit.md.
export interface GameSkeleton {
    /** lowercase id: asset paths, PUBLIC_GAME env, folder names */
    id: 'genshin' | 'sky'
    /** LEGACY-LOCKED cased id: IndexedDB name, localStorage prefixes,
     *  appName inside serialized songs. Never derived from `id`. */
    storageId: 'Genshin' | 'Sky'
    displayName: string
}
