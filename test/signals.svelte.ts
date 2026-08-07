// `.svelte.ts` so vite-plugin-svelte rune-compiles this module (it matches the plugin's `.svelte.`
// module infix). It is NOT collected as a suite: vitest's include is `test/**/*.test.ts`, which
// this name does not match. Runes stay confined here and the test files using it stay plain `.ts` -
// the same split test/subscribeTheme.test.ts already uses against ThemeProvider.svelte.ts.

export interface SignalObserver {
    /** How many times the effect has run. 1 after the first flushEffects() = the baseline. */
    runs(): number

    dispose(): void
}

/**
 * Count how many times `read()`'s signal dependencies have invalidated. `$effect.root` is the only
 * way to create an effect outside a component, and the effect runs once on creation - so a caller
 * must flushEffects() once and take that count as its baseline before mutating anything.
 *
 * Effects COALESCE: three publishes between two flushes are one run. This counts "did it publish",
 * not "how many times" - for the latter (catching a double publish) compare NoteColumn.version,
 * which is a plain counter and does not coalesce.
 */
export function observeSignal(read: () => unknown): SignalObserver {
    let runs = 0
    const dispose = $effect.root(() => {
        $effect(() => {
            read()
            runs++
        })
    })
    return {runs: () => runs, dispose}
}

/**
 * Same counter, but with a `$derived` BETWEEN the read and the effect - which is the difference
 * that matters, and the reason this exists next to observeSignal.
 *
 * An `$effect` re-runs whenever a dependency invalidates, whatever the new value is. A `$derived`
 * does not propagate that far: if its recomputed value is referentially identical to the previous
 * one, Svelte skips its consumers. So a derived whose value is an object read out of the model
 * (`$derived(vsrg.tracks[i])`, `$derived(song.columns[i])`) silently swallows every structure bump,
 * while a derived of a primitive or of a freshly built array does not. Template `{@const}` and
 * `{#each}` item bindings behave the same way - all three compile to identity-compared values.
 *
 * That is the trap the vsrg composer's track panel and note keyboard sat in before phase 2 of the
 * 2026-08-06 reactive-model plan (it only worked because refreshVsrg() rebuilt every track with
 * .map()), and it is the whole reason VsrgTop.svelte reads `vsrg.tracks` at the point of use.
 */
export function observeDerived<T>(compute: () => T): SignalObserver {
    let runs = 0
    const dispose = $effect.root(() => {
        const value = $derived.by(compute)
        $effect(() => {
            value //intentional bare read: it is the subscription, the value is unused
            runs++
        })
    })
    return {runs: () => runs, dispose}
}

/**
 * Svelte schedules effects on a real task, not synchronously, and `flushSync()` from 'svelte' does
 * NOT drive effects created inside an `$effect.root` here (verified: the counter never left 0, not
 * even the mandatory first run). One real macrotask is enough - the same mechanism, and the same
 * reasoning, as subscribeTheme.test.ts's `realDelay`.
 *
 * NEVER combine a consumer of this with vi.useFakeTimers(): the timer would never fire and the
 * await would hang. (test/composerRenderLoop.test.ts does use fake timers, but vitest isolates per
 * file - do not merge these files.)
 */
export function flushEffects(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0))
}

/**
 * A deep `$state` array - i.e. a Svelte Proxy. Exists so test/serializePlain.test.ts can prove
 * assertNoReactiveProxies() actually fires on the thing it exists to catch; a guard nobody has
 * seen fail is indistinguishable from one that never fires.
 */
export function reactiveArray<T>(items: T[]): T[] {
    //via a variable, not `return $state(items)`: a rune may only initialize a declaration
    let reactive = $state(items)
    return reactive
}
