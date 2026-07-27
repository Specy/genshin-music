// Dynamically imported so bundlers split @spotify/basic-pitch (pulls in a TensorFlow.js runtime)
// into its own lazy chunk, fetched only when a consumer first calls basicPitchLoader(). Memoized
// so repeat calls reuse the same promise.
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
