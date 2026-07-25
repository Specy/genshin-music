import {describe, expect, it} from 'vitest'
import {
    subscribeCurrentVsrgSong,
    subscribeVsrgLatestScore,
    subscribeVsrgScore,
    vsrgPlayerStore,
} from '../src/lib/stores/VsrgPlayerStore.svelte'
import {VsrgSong} from '../src/lib/core/Songs/VsrgSong'

// The three `$effect.root`-based subscribers on `vsrgPlayerStore` share the same novel mechanism
// (and the same fixed race condition) as `subscribeTheme` - see that function's header comment in
// ThemeProvider.svelte.ts for the full story. Extra, non-brief-mandated coverage (global
// constraints permit new tests for new logic) specifically because a plain "skip the first
// $effect run" boolean was PROVEN unsafe here during implementation (a real mutation made with
// zero delay after subscribing was silently dropped) before being replaced with the
// snapshot-comparison approach these tests exercise.
function realDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

describe('subscribeCurrentVsrgSong', () => {
    it('does NOT call back synchronously at subscribe time (unlike subscribeTheme - old never primed this one either)', async () => {
        vsrgPlayerStore.stopSong()
        const calls: unknown[] = []
        const dispose = subscribeCurrentVsrgSong(data => calls.push(data))
        expect(calls.length).toBe(0)
        await realDelay(30)
        expect(calls.length).toBe(0) // subscribing alone is not a "change" - still nothing
        dispose()
    })

    it('fires with the LIVE currentSong object on a real change, even with ZERO delay before the mutation (the race case)', async () => {
        vsrgPlayerStore.stopSong()
        const calls: unknown[] = []
        const dispose = subscribeCurrentVsrgSong(data => calls.push(data))
        vsrgPlayerStore.playSong(new VsrgSong('race test')) // no await before this - the race case
        await realDelay(30)
        expect(calls.length).toBe(1)
        expect(calls[0]).toBe(vsrgPlayerStore.currentSong) // live reference, preserved old quirk
        dispose()
        vsrgPlayerStore.stopSong()
    })

    it('stops firing once dispose() has run', async () => {
        vsrgPlayerStore.stopSong()
        const calls: unknown[] = []
        const dispose = subscribeCurrentVsrgSong(data => calls.push(data))
        dispose()
        vsrgPlayerStore.playSong(new VsrgSong('after dispose'))
        await realDelay(30)
        expect(calls.length).toBe(0)
        vsrgPlayerStore.stopSong()
    })
})

describe('subscribeVsrgScore', () => {
    it('fires with a SHALLOW COPY of score (not the live object) on a real change, even with zero delay before the mutation', async () => {
        vsrgPlayerStore.resetScore()
        const calls: {amazing: number}[] = []
        const dispose = subscribeVsrgScore(data => calls.push(data))
        vsrgPlayerStore.incrementScore('amazing') // no await before this - the race case
        await realDelay(30)
        expect(calls.length).toBe(1)
        expect(calls[0]).not.toBe(vsrgPlayerStore.score) // shallow copy, per old's `{...score}`
        expect(calls[0]).toEqual({...vsrgPlayerStore.score})
        expect(calls[0].amazing).toBe(1)
        dispose()
    })

    it('does not fire from subscribing alone, with no intervening mutation', async () => {
        vsrgPlayerStore.resetScore()
        const calls: unknown[] = []
        const dispose = subscribeVsrgScore(data => calls.push(data))
        await realDelay(30)
        expect(calls.length).toBe(0)
        dispose()
    })
})

describe('subscribeVsrgLatestScore', () => {
    it('PRESERVED QUIRK: fires on ANY score mutation, not only ones that touch lastScore', async () => {
        vsrgPlayerStore.resetScore()
        const calls: {type: string}[] = []
        const dispose = subscribeVsrgLatestScore(data => calls.push(data))
        vsrgPlayerStore.showScore() // only touches scoreVisible, never lastScore itself
        await realDelay(30)
        expect(calls.length).toBe(1)
        expect(calls[0]).toEqual({timestamp: 0, type: '', combo: 0}) // lastScore content unchanged
        dispose()
    })

    it('reports the new lastScore after a real hit, even with zero delay before the mutation', async () => {
        vsrgPlayerStore.resetScore()
        const calls: {type: string, combo: number}[] = []
        const dispose = subscribeVsrgLatestScore(data => calls.push(data))
        vsrgPlayerStore.incrementScore('perfect')
        await realDelay(30)
        expect(calls.length).toBe(1)
        expect(calls[0].type).toBe('perfect')
        expect(calls[0].combo).toBe(1)
        dispose()
    })
})
