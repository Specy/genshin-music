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