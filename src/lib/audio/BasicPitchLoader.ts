// old src/lib/audio/BasicPitchLoader.ts (11 lines) — verbatim, zero changes (no imports to swap,
// the file only ever references the bare `@spotify/basic-pitch` package specifier). This is the
// mechanism that keeps `@spotify/basic-pitch` (which pulls in a TensorFlow.js runtime) out of the
// entry bundle: the dynamic `import()` below is the ONLY reference to the package anywhere in the
// tree, so bundlers split it into its own lazy chunk, fetched only when a consumer (MidiParser,
// Phase-4c) first calls `basicPitchLoader()`. Memoized so repeat calls reuse the same promise.
type BasePitch = typeof import('@spotify/basic-pitch')
let basicPitchPromise: Promise<BasePitch> | null = null

export function basicPitchLoader(): Promise<BasePitch> {
    if (basicPitchPromise === null) {
        basicPitchPromise = import('@spotify/basic-pitch').then(m => {
            return m
        })
    }
    return basicPitchPromise
}
