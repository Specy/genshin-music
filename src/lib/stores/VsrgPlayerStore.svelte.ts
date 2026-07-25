// old src/stores/VsrgPlayerStore.ts (195 lines) - mobx -> Svelte 5 runes port, same pattern as
// PlayerStore.svelte.ts/PlayerControlsStore.svelte.ts/ZenKeyboardStore.svelte.ts:
// `@observable`/`@observable.shallow`/`makeObservable` all dropped; the constructor (which only
// ever called `makeObservable(this)`) is removed entirely; each of the three observable fields
// becomes its own top-level `$state(...)` class field (no wrapping getter layer - old exposed
// `keyboard`/`currentSong`/`score` as direct top-level properties, not nested under a `state`
// sub-object the way PlayerControlsStore does, so the port keeps that shape). Every method body is
// byte-verbatim, including `setLayout`'s in-place `splice(0, len, ...)` form (same idiom
// ZenKeyboardStore.svelte.ts's `setKeyboardLayout` already established) and `incrementScore`'s
// combo/score math EXACTLY as old wrote it (`type === 'miss' ? 0 : combo + 1`,
// `score + getScore(type) * combo`, the `baseScoreMap[type] ?? 0` fallback that is dead in
// practice since `VsrgPlayerHitType` and `baseScoreMap`'s keys are the same 6-member union, but
// preserved as-is). `listeners`/`keyboardListeners` stay plain arrays (not reactive `$state`):
// like VsrgComposerStore.svelte.ts's `listeners` Map, neither is ever read from a Svelte
// template/`$derived`/`$effect` - they only exist to be pushed/filtered/iterated imperatively by
// `addEventListener`/`removeEventListener`/`emitEvent` and the keyboard-listener trio - so there is
// no reactivity for a Svelte-reactivity wrapper to provide here (do not read this as a missed
// convention). Import-path swap: `$lib/Songs/VsrgSong` -> `$core/Songs/VsrgSong`.
import {VsrgSong} from '$core/Songs/VsrgSong'

export type KeyboardKey = {
    key: string
    index: number
    isPressed: boolean
}
export type VsrgPlayerSongEventType = 'play' | 'stop'
export type VsrgPlayerSong = {
    song: VsrgSong | null
    type: VsrgPlayerSongEventType
}
export type VsrgKeyboardPressType = 'down' | 'up'
export type VsrcPlayerKeyboardCallback = {
    callback: (key: KeyboardKey, type: VsrgKeyboardPressType) => void,
    id: string
}
export type VsrgPlayerHitType = 'amazing' | 'perfect' | 'great' | 'good' | 'bad' | 'miss'

export type VsrgLatestScore = {
    timestamp: number
    type: VsrgPlayerHitType | ''
    combo: number
}

export type VsrgPlayerScore = {
    scoreVisible: boolean
    combo: number
    score: number
    amazing: number
    perfect: number
    great: number
    good: number
    bad: number
    miss: number
    lastScore: VsrgLatestScore
}
const baseScoreMap = {
    amazing: 300,
    perfect: 200,
    great: 100,
    good: 50,
    bad: 25,
    miss: 0
}

export type VsrgPlayerEvent = 'fpsChange'
type VsrgPlayerCallback = {
    callback: (data: VsrgPlayerEvent) => void
    id: string
}

class VsrgPlayerStore {
    keyboard: KeyboardKey[] = $state([])
    currentSong: VsrgPlayerSong = $state({
        song: null,
        type: 'stop'
    })
    score: VsrgPlayerScore = $state({
        scoreVisible: false,
        combo: 0,
        score: 0,

        amazing: 0,
        perfect: 0,
        great: 0,
        good: 0,
        bad: 0,
        miss: 0,
        lastScore: {
            timestamp: 0,
            type: '',
            combo: 0
        }
    })
    private listeners: VsrgPlayerCallback[] = []
    private keyboardListeners: VsrcPlayerKeyboardCallback[] = []

    setLayout = (layout: string[]) => {
        this.keyboard.splice(0, this.keyboard.length,
            ...layout.map((key, index) => {
                return {
                    key,
                    index,
                    isPressed: false
                }
            }))
    }
    addEventListener = (callback: (data: VsrgPlayerEvent) => void, id: string) => {
        this.listeners.push({
            callback,
            id
        })
    }
    emitEvent = (event: VsrgPlayerEvent) => {
        this.listeners.forEach(listener => listener.callback(event))
    }
    removeEventListener = (id: string) => {
        this.listeners = this.listeners.filter(l => l.id !== id)
    }
    resetScore = () => {
        const resetScore: VsrgPlayerScore = {
            scoreVisible: false,
            score: 0,
            amazing: 0,
            perfect: 0,
            great: 0,
            good: 0,
            bad: 0,
            miss: 0,
            combo: 0,
            lastScore: {
                timestamp: 0,
                type: '',
                combo: 0
            }
        }
        Object.assign(this.score, resetScore)
    }
    incrementScore = (type: VsrgPlayerHitType) => {
        const combo = type === 'miss' ? 0 : this.score.combo + 1
        Object.assign(this.score, {
            [type]: this.score[type] + 1,
            combo,
            score: this.score.score + this.getScore(type) * combo,
            lastScore: {
                timestamp: Date.now(),
                type,
                combo,
            }
        })
    }
    private getScore = (type: VsrgPlayerHitType) => {
        return baseScoreMap[type] ?? 0
    }
    playSong = (song: VsrgSong) => {
        this.currentSong.type = 'play'
        this.currentSong.song = song.clone()
    }
    showScore = () => {
        this.score.scoreVisible = true
    }
    stopSong = () => {
        this.currentSong.type = 'stop'
        this.currentSong.song = null
    }
    pressKey = (index: number) => {
        this.keyboard[index].isPressed = true
        this.emitKeyboardEvent(this.keyboard[index], 'down')
    }
    releaseKey = (index: number) => {
        this.keyboard[index].isPressed = false
        this.emitKeyboardEvent(this.keyboard[index], 'up')
    }
    addKeyboardListener = (listener: VsrcPlayerKeyboardCallback) => {
        this.keyboardListeners.push(listener)
    }
    removeKeyboardListener = (callback: Partial<VsrcPlayerKeyboardCallback>) => {
        const index = this.keyboardListeners.findIndex(x => x.id === callback.id || x.callback === callback.callback)
        if (index === -1) return
        this.keyboardListeners.splice(index, 1)
    }
    emitKeyboardEvent = (key: KeyboardKey, type: VsrgKeyboardPressType) => {
        this.keyboardListeners.forEach(listener => listener.callback(key, type))
    }
}


export const vsrgPlayerStore = new VsrgPlayerStore()

// The three subscribers below replace old's `mobx.observe`-based equivalents with
// `$effect.root`-built ones (spec §6.1's non-component subscribe-helper pattern - same mechanism
// `ThemeProvider.svelte.ts`'s `subscribeTheme` uses, see that function's header comment for the
// full `$effect.root` mechanics, incl. why a plain "skip the first run" boolean flag is UNSAFE).
// All three keep their old names, signatures and payload shapes EXACTLY, including two real
// old-code quirks documented per-function below. Two structural deviations apply to all three
// alike, disclosed once here rather than three times:
//   (1) NO INITIAL CALLBACK: none of these three old functions ever called `callback` at subscribe
//   time (unlike `subscribeTheme`) - a consumer had to read the store's current value directly for
//   its initial render and use these subscribers purely for update notifications. That is
//   preserved: none of the three below call `callback` synchronously either. What changes is HOW
//   "no callback until a real change" is achieved: Svelte's `$effect` always runs at least once to
//   discover its dependencies, and (verified live in this session, see `subscribeTheme`'s comment)
//   that mandatory first run is deferred, not synchronous, and can end up observing a mutation that
//   happened to land in the window before it executes. A naive `isFirstRun` boolean would
//   misidentify that as "just establishing deps" and silently swallow a real update. Each effect
//   below instead captures a cheap snapshot of what it's tracking at SUBSCRIBE time and only calls
//   `callback` when a LATER run observes something that differs from that snapshot - correct
//   regardless of how many times, or exactly when, the effect happens to execute.
//   (2) FIRE-COUNT/GRANULARITY: mobx's `observe` notifies once per individual property SET on the
//   observed object; `incrementScore`/`resetScore` each write several `score` fields in one
//   `Object.assign` call, so old's raw mobx listener could in principle fire multiple times per
//   single store-method call, and (since `Object.assign` writes keys one at a time) a listener
//   could theoretically observe a transiently PARTIAL snapshot mid-assignment. Svelte's `$effect`
//   instead coalesces every synchronous `$state` write into a single batched re-run, so the port
//   always delivers the fully-settled post-call state exactly once. This is an inherent difference
//   between the two reactivity models, not a bug: every consumer of these three subscribers only
//   ever cares about the latest value, never about an intermediate one, so the coalesced firing is
//   strictly safer and the "final value delivered" contract is unchanged.

// old:
//   export function subscribeCurrentVsrgSong(callback: (data: VsrgPlayerSong) => void) {
//       const dispose = observe(vsrgPlayerStore.currentSong, () => {
//           callback(vsrgPlayerStore.currentSong)
//       })
//       return dispose
//   }
// PRESERVED QUIRK: passes the LIVE `vsrgPlayerStore.currentSong` object itself (not a copy) -
// unlike the other two subscribers below, which both pass a shallow-copied snapshot. Kept exactly
// as-is (not "fixed" for consistency with its two siblings).
export function subscribeCurrentVsrgSong(callback: (data: VsrgPlayerSong) => void): () => void {
    // `song` is always REASSIGNED wholesale (never mutated in place - `playSong`/`stopSong` both
    // do `this.currentSong.song = ...`), so reference equality is a correct and cheap change test.
    let lastSong = vsrgPlayerStore.currentSong.song
    let lastType = vsrgPlayerStore.currentSong.type
    return $effect.root(() => {
        $effect(() => {
            // touch both fields to track them, mirroring old's un-scoped `observe(currentSong, ...)`
            const song = vsrgPlayerStore.currentSong.song
            const type = vsrgPlayerStore.currentSong.type
            if (song === lastSong && type === lastType) return
            lastSong = song
            lastType = type
            callback(vsrgPlayerStore.currentSong)
        })
    })
}

// old:
//   export function subscribeVsrgScore(callback: (data: VsrgPlayerScore) => void) {
//       const dispose = observe(vsrgPlayerStore.score, () => {
//           callback({...vsrgPlayerStore.score})
//       })
//       return dispose
//   }
export function subscribeVsrgScore(callback: (data: VsrgPlayerScore) => void): () => void {
    // `score` is a small plain-data object (no class instances), so a JSON snapshot is cheap and
    // correct; it also naturally covers `lastScore` (which `incrementScore`/`resetScore` always
    // REPLACE wholesale via `Object.assign`, never mutate in place), mirroring old's un-scoped
    // `observe(vsrgPlayerStore.score, ...)` without needing a second, separate tracked read.
    let lastSnapshot = JSON.stringify(vsrgPlayerStore.score)
    return $effect.root(() => {
        $effect(() => {
            const snapshot = JSON.stringify(vsrgPlayerStore.score)
            if (snapshot === lastSnapshot) return
            lastSnapshot = snapshot
            callback({...vsrgPlayerStore.score})
        })
    })
}

// old:
//   export function subscribeVsrgLatestScore(callback: (data: VsrgLatestScore) => void) {
//       const dispose = observe(vsrgPlayerStore.score, () => {
//           callback({...vsrgPlayerStore.score.lastScore})
//       })
//       return dispose
//   }
// PRESERVED QUIRK: old observes the WHOLE `score` object (same scope as `subscribeVsrgScore`
// above), not just `lastScore` - so this fires on ANY score-level mutation (e.g. `showScore()`'s
// bare `scoreVisible` toggle, which never touches `lastScore` at all), even though the callback
// only ever reports `lastScore`. Kept exactly as-is (not narrowed to only fire on real `lastScore`
// changes) - the snapshot below is deliberately of the WHOLE `score` object, same as
// `subscribeVsrgScore`, to preserve that exact coarse-grained firing scope.
export function subscribeVsrgLatestScore(callback: (data: VsrgLatestScore) => void): () => void {
    let lastSnapshot = JSON.stringify(vsrgPlayerStore.score)
    return $effect.root(() => {
        $effect(() => {
            const snapshot = JSON.stringify(vsrgPlayerStore.score)
            if (snapshot === lastSnapshot) return
            lastSnapshot = snapshot
            callback({...vsrgPlayerStore.score.lastScore})
        })
    })
}
