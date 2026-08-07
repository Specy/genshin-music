/**
 * Tripwire for the 2026-08-06 reactive-model plan's #1 risk: a `$state` proxy escaping through a
 * serialize()/toOldFormat() path into IndexedDB. Called from `expectGolden` (so every golden
 * assertion in the suite is checked) and per entry point from test/serializePlain.test.ts.
 *
 * IT IS DORMANT TODAY - stated up front, because a guard believed to be watching something it is
 * not is worse than no guard. Neither reactive song class has a deep-`$state` object or array
 * field, so no proxy exists anywhere for this to catch:
 *  - `Song.instruments`, `ComposedSong.breakpoints`, `VsrgSong.breakpoints` and
 *    `VsrgSong.trackModifiers` are `$state.raw` - a whole-array signal over a PLAIN array;
 *  - `#columns` and `#tracks` are plain private arrays behind getters;
 *  - every scalar signal on both classes (`selected`, `keys`, `duration`, `difficulty`,
 *    `snapPoint`, `audioSongId`, and the five on Song) holds a primitive, which is never proxied;
 *  - `NoteColumn` / `ColumnNote` / `InstrumentData` / `VsrgTrack` / `VsrgHitObject` /
 *    `VsrgTrackModifier` are plain by contract.
 * Nothing else this guard is handed can carry one either (config constants, `BaseTheme`, the
 * settings defaults - all plain). So the watch set is EMPTY: every green run costs a
 * structuredClone and proves nothing about proxies. It stays because phases 3-4 may add a
 * deep-`$state` field, and the day one appears this fires without anyone remembering to write a
 * test for it.
 *
 * (`Theme.state`, in $core/theme/ThemeProvider.svelte.ts, is the one deep `$state` object in
 * src/lib/core. It reaches no path this guard sees - the golden theme test serializes a
 * `BaseTheme`, whose state is plain, and `Theme.serialize()` cloneDeeps its state on the way out.)
 *
 * Why structuredClone is the detector: it is exactly what the IndexedDB boundary does, and it
 * refuses ANY proxy (verified here: a proxied array reports "[object Array] could not be cloned",
 * a proxied plain object "#<Object> could not be cloned" - content-independent, empty ones
 * included). test/serializePlain.test.ts keeps that refusal itself proven, by feeding this a real
 * deep `$state` array and asserting it throws.
 *
 * What it does catch on the current tree, incidentally rather than by design: a FUNCTION or symbol
 * in a value handed to expectGolden. structuredClone refuses those where JSON.stringify silently
 * dropped them - test/configSurface.test.ts strips a Svelte component out of `game.shapes`
 * because of it.
 *
 * WHAT IT DOES NOT CATCH:
 * - ALIASING. `data: this.data` / `breakpoints: this.breakpoints` return the LIVE object, which
 *   clones perfectly. That is the other half of serialize()'s contract and it has its own guard:
 *   test/noAliasing.ts, which is the one with teeth against the current model.
 * - anything, when the golden fixtures are the only thing looking: `expectGolden` normalizes with
 *   JSON.parse(JSON.stringify(value)), and JSON.stringify walks a Svelte proxy transparently, so a
 *   leaked proxy produces byte-identical fixture output. That blindness is why this file exists.
 */
export function assertNoReactiveProxies(label: string, value: unknown): void {
    try {
        structuredClone(value)
    } catch (error) {
        throw new Error(
            `${label}: not structured-cloneable, so it cannot be written to IndexedDB.\n` +
            `  offending path: ${findUncloneablePath(value) ?? '<root>'}\n` +
            `  A Svelte $state array/object reaching a serialized result is the usual cause: ` +
            `serialize() must spread or .map() every reactive array ([...this.breakpoints], never ` +
            `this.breakpoints). See ComposedSong.serialize's header.\n` +
            `  A function or symbol in the value fails here too (JSON.stringify silently dropped ` +
            `those) - strip it in the caller rather than removing this check.\n` +
            `  original: ${String(error)}`
        )
    }
}

/** Deepest key path structuredClone refuses. Walked ONLY after a failure, so a green run pays nothing for it. */
function findUncloneablePath(value: unknown, path = ''): string | null {
    if (typeof value !== 'object' || value === null) return null
    for (const [key, child] of Object.entries(value)) {
        const childPath = path === '' ? key : `${path}.${key}`
        try {
            structuredClone(child)
        } catch {
            return findUncloneablePath(child, childPath) ?? childPath
        }
    }
    return null
}
