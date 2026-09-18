import {describe, expect, it} from 'vitest'
import {subscribeTheme, ThemeProvider} from '../src/lib/core/theme/ThemeProvider.svelte'

// subscribeTheme is the FIRST use of `$effect.root` anywhere in this tree (spec §6.1's explicit
// subscribe-helper pattern for non-component consumers - the three Phase-4c pixi renderer classes
// are its first real consumers). Extra, non-brief-mandated coverage (global constraints permit new
// tests for new pure-ish logic) specifically because this mechanism is genuinely novel: Svelte's
// `$effect` always runs once immediately via a MICROTASK (`queueMicrotask`, verified against
// node_modules/svelte's own `batch.js`/`task.js` source - not a fake-timer-controllable macrotask),
// unlike old's mobx `observe` which never fires on registration at all - so this file empirically
// proves the `isFirstRun` guard actually suppresses that spurious extra run, using real short
// delays (not `vi.useFakeTimers()`, which does not intercept `queueMicrotask` by default) to let
// both the microtask-scheduled effect flush and the 50ms debounce elapse for real.
function realDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

describe('subscribeTheme', () => {
    it('calls back synchronously exactly once at subscribe time, with the LIVE ThemeProvider singleton (not a shallow copy)', async () => {
        const calls: unknown[] = []
        const dispose = subscribeTheme(theme => calls.push(theme))

        // synchronous: true even before any await, matching the brief's "immediate synchronous
        // first callback(...) before returning" requirement (renderers rely on this at construction time)
        expect(calls.length).toBe(1)
        expect(calls[0]).toBe(ThemeProvider) // reference equality - disclosed deviation from old's `{...ThemeProvider}` copy

        // let the effect's own mandatory first run (deferred to a microtask) settle - it must NOT
        // add a second, spurious call
        await realDelay(20)
        expect(calls.length).toBe(1)

        dispose()
    })

    it('debounces and fires again ~50ms after a real theme mutation, still with the live singleton', async () => {
        const calls: unknown[] = []
        const dispose = subscribeTheme(theme => calls.push(theme))
        expect(calls.length).toBe(1)

        const before = ThemeProvider.getValue('accent')
        const next = before === '#123456' ? '#654321' : '#123456'
        ThemeProvider.set('accent', next)

        // immediately after the mutation: neither the microtask-deferred effect re-run nor the
        // 50ms debounce has fired yet
        expect(calls.length).toBe(1)

        await realDelay(90) // > 50ms debounce + slack for the effect's microtask flush
        expect(calls.length).toBe(2)
        expect(calls[1]).toBe(ThemeProvider)
        expect(ThemeProvider.getValue('accent')).toBe(next)

        dispose()
        ThemeProvider.set('accent', before) // restore - this suite shares the singleton across its own tests
    })

    it('coalesces multiple synchronous mutations within the same debounce window into a single callback', async () => {
        const calls: unknown[] = []
        const dispose = subscribeTheme(theme => calls.push(theme))
        expect(calls.length).toBe(1)

        const before = ThemeProvider.getValue('primary')
        ThemeProvider.set('primary', '#111111')
        await realDelay(10) // let the effect observe the first write, well under the 50ms debounce
        ThemeProvider.set('primary', '#222222')
        await realDelay(10)
        ThemeProvider.set('primary', '#333333')

        await realDelay(90)
        expect(calls.length).toBe(2) // the initial sync call, plus exactly ONE debounced update
        expect(ThemeProvider.getValue('primary')).toBe('#333333')

        dispose()
        ThemeProvider.set('primary', before) // restore
    })

    it('stops calling back once the returned dispose() function has run', async () => {
        const calls: unknown[] = []
        const dispose = subscribeTheme(theme => calls.push(theme))
        expect(calls.length).toBe(1)
        dispose()

        const before = ThemeProvider.getValue('note_background')
        ThemeProvider.set('note_background', before === '#abcdef' ? '#fedcba' : '#abcdef')
        await realDelay(90)
        expect(calls.length).toBe(1) // unchanged - the effect root was torn down

        ThemeProvider.set('note_background', before) // restore
    })
})
