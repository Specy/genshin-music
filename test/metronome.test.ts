// Guards for the lookahead metronome scheduler (src/lib/audio/Metronome.ts).
//
// Two things make this file possible and both are deliberate seams in the class: the CLASS is
// exported beside the app-global singleton (a shared singleton would leak state between cases),
// and the wake timer is injectable. The injection is not a nicety - the real timer is
// worker-timers, which runs inside a Worker that jsdom does not provide, so calling it here
// throws `ReferenceError: Worker is not defined`. vi.useFakeTimers() does not reach inside
// worker-timers either.
//
// jsdom also has no AudioContext (see audioModels.test.ts's header), so these run against a
// minimal fake in the shape of test/sustainVoice.test.ts's - a mutable `currentTime` plus buffer
// sources that record their start/stop/disconnect calls with arguments. What is under test is
// WHERE ON THE AUDIO CLOCK each beat is placed and what happens to the beats that have been
// placed there but have not sounded yet; no DSP is involved.
import {describe, expect, it} from 'vitest'
import {Metronome} from '../src/lib/audio/Metronome'

type Call = { method: string, args: unknown[] }

// Two distinguishable stand-ins, so a test can tell an accented beat from a plain one.
const ACCENT_BUFFER = {duration: 0.1, __name: 'accent'} as unknown as AudioBuffer
const TICK_BUFFER = {duration: 0.1, __name: 'tick'} as unknown as AudioBuffer

type FakeSource = {
    calls: Call[]
    buffer: unknown
    connectedTo: unknown[]
    emitEnded(): void
}

function fakeContext(currentTime = 0) {
    const created: { sources: FakeSource[], gains: any[] } = {sources: [], gains: []}
    const context = {
        currentTime,
        createGain() {
            const calls: Call[] = []
            const gain = {
                calls,
                gain: {value: 1},
                connectedTo: [] as unknown[],
                connect(node: unknown) {
                    this.connectedTo.push(node)
                },
                disconnect() {
                    calls.push({method: 'disconnect', args: []})
                },
            }
            created.gains.push(gain)
            return gain
        },
        createBufferSource() {
            const calls: Call[] = []
            const listeners = new Map<string, () => void>()
            const source: FakeSource = {
                calls,
                buffer: null,
                connectedTo: [],
                connect(node: unknown) {
                    this.connectedTo.push(node)
                },
                disconnect() {
                    calls.push({method: 'disconnect', args: []})
                },
                start(when?: number) {
                    calls.push({method: 'start', args: [when]})
                },
                stop(when?: number) {
                    calls.push({method: 'stop', args: [when]})
                },
                addEventListener(type: string, cb: () => void) {
                    listeners.set(type, cb)
                },
                emitEnded() {
                    listeners.get('ended')?.()
                },
            } as unknown as FakeSource
            created.sources.push(source)
            return source
        },
    }
    return {context, created}
}

function fakeTimer() {
    let nextId = 1
    const intervals = new Map<number, { handler: () => void, ms: number }>()
    const timer = {
        setInterval(handler: () => void, ms: number) {
            const id = nextId++
            intervals.set(id, {handler, ms})
            return id
        },
        clearInterval(id: number) {
            intervals.delete(id)
        },
    }
    return {intervals, timer}
}

type Beat = { at: number, accent: boolean, cancelled: boolean }

function harness({bpm = 240, beats = 4} = {}) {
    const {context, created} = fakeContext()
    const {intervals, timer} = fakeTimer()
    const metronome = new Metronome(bpm, timer)
    // init() is bypassed on purpose: it fires loadBuffers(), which fetches over the network and
    // would asynchronously overwrite both buffers with the same empty one - after which no test
    // could tell an accent from a plain beat.
    metronome.audioContext = context as unknown as AudioContext
    metronome.volumeNode = context.createGain() as unknown as GainNode
    metronome.crochetBuffer = ACCENT_BUFFER
    metronome.indicatorBuffer = TICK_BUFFER
    metronome.beats = beats
    return {
        metronome,
        context,
        created,
        intervals,
        now: () => context.currentTime,
        /** Advance the audio clock and fire whatever wake timer is currently installed. */
        tick(seconds: number) {
            context.currentTime += seconds
            for (const entry of [...intervals.values()]) entry.handler()
        },
        /** Advance the audio clock WITHOUT waking - a wake that was skipped entirely. */
        advance(seconds: number) {
            context.currentTime += seconds
        },
        beats(): Beat[] {
            return created.sources.map((source) => {
                const start = source.calls.find((c) => c.method === 'start')
                return {
                    at: start ? (start.args[0] as number) : NaN,
                    accent: source.buffer === ACCENT_BUFFER,
                    cancelled: source.calls.some((c) => c.method === 'stop'),
                }
            })
        },
        startTimes(): number[] {
            return this.beats().map((b) => b.at)
        },
        /** The beats that will actually be heard: scheduled and never cancelled. */
        audible(): Beat[] {
            return this.beats().filter((b) => !b.cancelled)
        },
    }
}

const PERIOD = 0.25 // 240 bpm
const FIRST = 0.05 // START_MARGIN_S

function gridIndex(at: number, period = PERIOD, first = FIRST) {
    return (at - first) / period
}

describe('the metronome scheduler', () => {
    it('places beats on the audio clock, not wherever the wake happened to land', () => {
        const h = harness()
        h.metronome.start()
        // Irregular wakes, exactly as a busy main thread produces. If any beat were placed from
        // the clock at wake time (the old `source.start(0)`) these jumps would show up in the
        // start times; on a generated grid they cannot.
        h.tick(0.01)
        h.tick(0.003)
        h.tick(0.09)
        h.tick(0.2)
        h.tick(0.007)
        h.tick(0.3)
        expect(h.startTimes().length).toBeGreaterThan(2)
        for (const at of h.startTimes()) {
            expect(gridIndex(at)).toBeCloseTo(Math.round(gridIndex(at)), 9)
        }
        // Every beat was committed before the audio clock reached it.
        expect(h.metronome.minMargin).toBeGreaterThan(0)
    })

    it('does not shift the grid when a wake is skipped entirely', () => {
        const h = harness()
        h.metronome.start()
        const before = h.startTimes()
        // 0.4s is less than the 0.5s lookahead, so nothing is due yet - but it is six wake
        // intervals' worth of silence. A scheduler that re-anchored on the clock it woke up to
        // (`nextBeatTime = currentTime + period`) would move the grid here.
        h.advance(0.4)
        h.tick(0)
        expect(h.startTimes().slice(0, before.length)).toEqual(before)
        for (const at of h.startTimes()) {
            expect(gridIndex(at)).toBeCloseTo(Math.round(gridIndex(at)), 9)
        }
        expect(h.metronome.missedBeats).toBe(0)
    })

    it('accumulates no drift over a long run', () => {
        const h = harness()
        h.metronome.start()
        for (let i = 0; i < 4000; i++) h.tick(PERIOD)
        const times = h.startTimes()
        expect(times.length).toBeGreaterThan(4000)
        // The last beat sits exactly where the ideal grid says, thousands of beats in. Any `+=`
        // accumulation or re-anchoring on a measured time shows up as a growing offset here.
        expect(times.at(-1)).toBeCloseTo(FIRST + (times.length - 1) * PERIOD, 9)
        expect(h.metronome.missedBeats).toBe(0)
        expect(h.metronome.minMargin).toBeGreaterThan(0)
    })

    it('keeps between one and two beats queued while the two-beat horizon is unclamped', () => {
        // NAMED FOR WHAT IT COVERS. The horizon is two beats CLAMPED to [0.1s, 1s], so the
        // one-to-two reading of "1/2 notes ahead" is what the code delivers only in the band where
        // neither clamp binds - roughly 120 to 1200 bpm. Below 120 the 1s cap binds; 40 bpm is an
        // ordinary practice tempo and queues at most one beat. The row this replaces asserted the
        // property as universal while running at a single tempo inside the band.
        for (const bpm of [120, 240, 600]) {
            const h = harness({bpm})
            const period = 60 / bpm
            h.metronome.start()
            // Right after start, two beats are committed - that is the "1/2 notes ahead" reading.
            expect(h.startTimes().length).toBe(2)
            for (let i = 0; i < 40; i++) {
                h.tick(period / 4)
                const pending = h.startTimes().filter((at) => at > h.now())
                expect(pending.length).toBeGreaterThanOrEqual(1)
                expect(pending.length).toBeLessThanOrEqual(3)
            }
        }
    })

    it('commits every beat well ahead of the audio clock at every tempo the setting admits', () => {
        // The invariant that DOES hold across the whole [0, 10000] bpm range, and the only one the
        // accuracy of the click depends on. A beat is committed at the first wake whose horizon
        // reaches it, so its margin is at least (horizon - one wake interval); both clamps are
        // sized so that stays comfortable, and the first beat of a run ties the bound at
        // START_MARGIN_S. 40 bpm is below the horizon cap, 3000 above the floor.
        for (const bpm of [40, 120, 240, 3000]) {
            const h = harness({bpm})
            const period = 60 / bpm
            h.metronome.start()
            for (let i = 0; i < 40; i++) h.tick(period / 4)
            expect(h.beats().length).toBeGreaterThan(4)
            expect(h.metronome.minMargin).toBeGreaterThanOrEqual(FIRST)
            expect(h.metronome.missedBeats).toBe(0)
        }
    })

    it('accents the first beat of every bar, and only that beat', () => {
        const h = harness({beats: 4})
        h.metronome.start()
        for (let i = 0; i < 12; i++) h.tick(PERIOD)
        const beats = h.beats()
        expect(beats.length).toBeGreaterThan(8)
        for (const beat of beats) {
            expect(beat.accent).toBe(Math.round(gridIndex(beat.at)) % 4 === 0)
        }
    })
})

describe('stopping the metronome', () => {
    it('silences the beats that have already been committed to the audio clock', () => {
        const h = harness()
        h.metronome.start()
        h.tick(0.0625)
        const pendingBefore = h.startTimes().filter((at) => at > h.now())
        expect(pendingBefore.length).toBeGreaterThan(0)
        h.metronome.stop()
        // This is the user-visible half of the bug: without it the metronome keeps clicking for a
        // whole lookahead after the toggle goes off.
        for (const beat of h.beats()) {
            expect(beat.cancelled).toBe(beat.at > h.now())
        }
        const after = h.startTimes().length
        h.tick(0.5)
        h.tick(0.5)
        expect(h.startTimes().length).toBe(after)
        expect(h.metronome.running).toBe(false)
    })

    it('does not cut off the click that is already sounding', () => {
        const h = harness()
        h.metronome.start()
        // 0.1 is past the first beat (0.05) and short of the second (0.30).
        h.tick(0.1)
        h.metronome.stop()
        const beats = h.beats()
        const sounding = beats.filter((b) => b.at <= h.now())
        const pending = beats.filter((b) => b.at > h.now())
        expect(sounding.length).toBeGreaterThan(0)
        expect(pending.length).toBeGreaterThan(0)
        // Hard-stopping a sample mid-waveform clicks; the queue is what "stop the scheduled
        // notes" is about.
        expect(sounding.every((b) => !b.cancelled)).toBe(true)
        expect(pending.every((b) => b.cancelled)).toBe(true)
    })

    it('yields a single tick train when stopped and restarted inside one beat', () => {
        const h = harness()
        h.metronome.start()
        h.advance(0.03)
        // A double-click of the metronome toggle. The old while-loop left its pending delay
        // parked, so the resumed loop ticked alongside the new one - two trains, forever.
        h.metronome.stop()
        h.metronome.start()
        for (let i = 0; i < 6; i++) h.tick(PERIOD)
        const audible = h.audible().map((b) => b.at)
        expect(audible.length).toBeGreaterThan(4)
        for (let i = 1; i < audible.length; i++) {
            expect(audible[i] - audible[i - 1]).toBeCloseTo(PERIOD, 9)
        }
    })

    it('ignores a second start while it is already running', () => {
        const h = harness()
        h.metronome.start()
        h.advance(0.03)
        // start() is idempotent on the TIMER HANDLE. Guarding on a boolean instead would let a
        // second start install a second wake timer and re-anchor the grid under the first, which
        // leaves two interleaved trains and leaks the original timer past the next stop().
        h.metronome.start()
        expect(h.intervals.size).toBe(1)
        for (let i = 0; i < 6; i++) h.tick(PERIOD)
        const audible = h.audible().map((b) => b.at)
        expect(audible.length).toBeGreaterThan(4)
        for (let i = 1; i < audible.length; i++) {
            expect(audible[i] - audible[i - 1]).toBeCloseTo(PERIOD, 9)
        }
        h.metronome.stop()
        expect(h.intervals.size).toBe(0)
    })

    it('does not throw when stopped before it was ever started', () => {
        const h = harness()
        expect(() => h.metronome.stop()).not.toThrow()
        // No context at all: the app-global singleton before AppInit has run.
        expect(() => new Metronome().stop()).not.toThrow()
    })

    it('stops the scheduler before dropping the gain node on destroy', () => {
        const h = harness()
        h.metronome.start()
        h.tick(0.0625)
        h.metronome.destroy()
        expect(h.metronome.running).toBe(false)
        expect(h.intervals.size).toBe(0)
        expect(h.beats().some((b) => b.cancelled)).toBe(true)
        expect(h.created.gains[0].calls.some((c: Call) => c.method === 'disconnect')).toBe(true)
    })

    it('refuses to start again after destroy rather than running silently', () => {
        const h = harness()
        h.metronome.start()
        h.tick(0.0625)
        h.metronome.destroy()
        const created = h.beats().length
        h.metronome.start()
        for (let i = 0; i < 6; i++) h.tick(PERIOD)
        // destroy() disconnects the shared gain node from the destination. start() used to check
        // only the AudioContext, so it happily armed a wake timer and connected every beat to a
        // node with no route out - a metronome whose button reads ON and that is silent forever.
        // Player.svelte reads its toggle back off `running`, so refusing has to be visible there.
        expect(h.metronome.running).toBe(false)
        expect(h.intervals.size).toBe(0)
        expect(h.beats().length).toBe(created)
    })
})

describe('the metronome under a stalled or backgrounded tab', () => {
    it('drops the beats it slept through instead of firing the backlog at once', () => {
        const h = harness()
        h.metronome.start()
        const before = h.startTimes().length
        // Five seconds in one step - twenty beats' worth. Web Audio plays a start time in the
        // past IMMEDIATELY, so scheduling the backlog would machine-gun it all out at once.
        h.tick(5)
        const added = h.startTimes().slice(before)
        expect(added.length).toBeLessThanOrEqual(3)
        for (const at of added) expect(at).toBeGreaterThan(h.now())
        expect(h.metronome.missedBeats).toBeGreaterThan(15)
    })

    it('keeps the bar phase after sleeping through beats', () => {
        const h = harness({beats: 4})
        h.metronome.start()
        h.tick(5)
        for (let i = 0; i < 8; i++) h.tick(PERIOD)
        // beatIndex advanced by the TRUE number of beats slept through, so the accent still lands
        // on the original grid rather than restarting the bar wherever the tab woke up.
        for (const beat of h.beats()) {
            expect(beat.accent).toBe(Math.round(gridIndex(beat.at)) % 4 === 0)
        }
    })

    it('queues nothing while the audio clock is frozen, and picks up when it moves', () => {
        const h = harness()
        h.metronome.start()
        const frozen = h.startTimes().length
        // A suspended AudioContext freezes currentTime. Everything derives from it, so the
        // scheduler finds nothing due and commits at most one lookahead in total.
        for (let i = 0; i < 50; i++) h.tick(0)
        expect(h.startTimes().length).toBe(frozen)
        h.tick(0.3)
        expect(h.startTimes().length).toBeGreaterThan(frozen)
    })
})

describe('changing the metronome settings mid-run', () => {
    it('re-anchors onto the new tempo without doubling up beats at the seam', () => {
        const h = harness({bpm: 240})
        h.metronome.start()
        h.tick(0.0625)
        h.metronome.bpm = 120
        h.tick(0.0625)
        for (let i = 0; i < 6; i++) h.tick(0.25)
        const audible = h.audible().map((b) => b.at)
        // No two audible beats share a start time, and none is out of order.
        for (let i = 1; i < audible.length; i++) {
            expect(audible[i]).toBeGreaterThan(audible[i - 1])
        }
        // The tail is on the new half-speed grid, and got there without waiting out the
        // already-committed lookahead.
        const tail = audible.slice(-4)
        for (let i = 1; i < tail.length; i++) {
            expect(tail[i] - tail[i - 1]).toBeCloseTo(0.5, 9)
        }
        expect(h.metronome.minMargin).toBeGreaterThan(0)
    })

    it('does not move the click that was about to happen when the tempo changes', () => {
        // THE FIXED POINT the re-anchor rests on, and the mechanism guard for both faces of the
        // defect below. The new grid is anchored on the EARLIEST beat still ahead of the audio
        // clock, so that beat is re-committed exactly where it was and a second change re-derives
        // the same time. Deriving the anchor from the queue AFTER cancelling it leaves only beats
        // in the past to anchor on, which is an anchor on `now` wearing a disguise - it moves the
        // click that was about to happen, by a little on a small tempo change and by a lot on a
        // large one. Swept over both, and over tempos either side of the ~300 bpm boundary where
        // a wake interval becomes shorter than START_MARGIN_S.
        for (const [from, to] of [
            [240, 120],
            [220, 221],
            [600, 601],
            [120, 600],
        ]) {
            const h = harness({bpm: from})
            h.metronome.start()
            h.tick(60 / from / 4)
            const nextBefore = Math.min(...h.startTimes().filter((at) => at > h.now()))
            h.metronome.bpm = to
            // Wake repeatedly WITHOUT letting the clock reach the beat under test: a large tempo
            // rise shortens the horizon, so the beat is re-committed a few wakes later rather
            // than on the wake that saw the change - at the same time either way, which is the
            // claim. Stopping short of it also means no beat can cross from pending to sounded
            // and change what "earliest pending" means between the two reads.
            const step = (nextBefore - h.now()) / 50
            for (let i = 0; i < 49; i++) h.tick(step)
            const stillDue = h
                .audible()
                .map((b) => b.at)
                .filter((at) => at > h.now())
            expect(Math.min(...stillDue)).toBeCloseTo(nextBefore, 9)
        }
    })

    it('does not go silent when bpm changes arrive faster than the beats do', () => {
        // THE USER-VISIBLE FACE, and the one the spinner reaches: SettingsInput calls onComplete
        // on every click of its +/- button, so a user holding a conversation with it writes
        // `metronome.bpm` several times a second. Above ~300 bpm a wake interval is shorter than
        // START_MARGIN_S, so each wake reached the beat the previous change had injected at
        // `now + START_MARGIN_S`, cancelled it and injected another - nothing ever survived to
        // sound, for as long as the changes kept coming. 600 bpm is inside the [0, 10000]
        // threshold. (Below 300 the injected beat does survive, so the audible result there is a
        // shifted click rather than silence - the row above is what pins that end.)
        const h = harness({bpm: 600})
        h.metronome.start()
        for (let i = 0; i < 80; i++) {
            h.metronome.bpm = i % 2 === 0 ? 601 : 600
            h.tick(0.025)
        }
        const heard = h
            .audible()
            .map((b) => b.at)
            .filter((at) => at <= h.now())
        // Two seconds at ~600 bpm is about twenty clicks; the defect gave exactly none.
        expect(heard.length).toBeGreaterThan(15)
        expect(h.metronome.minMargin).toBeGreaterThan(0)
    })

    it('restarts the bar when the meter changes, without re-accenting committed beats', () => {
        const h = harness({beats: 4})
        h.metronome.start()
        for (let i = 0; i < 6; i++) h.tick(PERIOD)
        const committed = h.beats().length
        h.metronome.beats = 3
        for (let i = 0; i < 9; i++) h.tick(PERIOD)
        const after = h.beats().slice(committed)
        expect(after.length).toBeGreaterThan(5)
        const firstAccent = after.findIndex((b) => b.accent)
        expect(firstAccent).toBeGreaterThanOrEqual(0)
        // From the restart the accents are three beats apart.
        for (let i = firstAccent; i < after.length; i++) {
            expect(after[i].accent).toBe((i - firstAccent) % 3 === 0)
        }
    })

    it('never sounds two accents back to back when the meter changes', () => {
        // Whether the last beat already committed was an old-meter downbeat depends on where in
        // the lookahead the change lands, so a single fixed change time is structurally blind to
        // this - sweep a whole old bar's worth of them. When it does happen the two accents are a
        // quarter of a second apart at 240 bpm, which is the whole audible complaint.
        for (let step = 0; step <= 20; step++) {
            const h = harness({beats: 4})
            h.metronome.start()
            for (let i = 0; i < step; i++) h.tick(0.05)
            h.metronome.beats = 3
            for (let i = 0; i < 40; i++) h.tick(0.05)
            const accents = h.audible().map((b) => b.accent)
            expect(accents.length).toBeGreaterThan(8)
            for (let i = 1; i < accents.length; i++) {
                expect(accents[i] && accents[i - 1]).toBe(false)
            }
        }
    })

    it('queues nothing at a bpm of 0, and recovers when a usable bpm arrives', () => {
        // 0 is inside the bpm setting's own [0, 10000] threshold, and an emptied input reads as
        // 0 too. The old loop turned it into `await delay(Infinity)`.
        const h = harness({bpm: 0})
        h.metronome.start()
        for (let i = 0; i < 100; i++) h.tick(0.05)
        expect(h.beats().length).toBe(0)
        h.metronome.bpm = 240
        h.tick(0.05)
        expect(h.beats().length).toBeGreaterThan(0)
        for (const at of h.startTimes()) expect(at).toBeGreaterThan(0)
    })

    it('accents nothing at a meter of 0 rather than producing NaN', () => {
        // 0 is inside the metronomeBeats threshold [0, 16]; the old `currentTick % 0` was NaN.
        const h = harness({beats: 0})
        h.metronome.start()
        for (let i = 0; i < 8; i++) h.tick(PERIOD)
        const beats = h.beats()
        expect(beats.length).toBeGreaterThan(4)
        expect(beats.every((b) => !b.accent)).toBe(true)
        for (const at of h.startTimes()) expect(Number.isFinite(at)).toBe(true)
    })

    it('treats volume as a gain and never as a transport control', () => {
        const h = harness()
        h.metronome.start()
        h.tick(0.0625)
        const pendingBefore = h.startTimes().filter((at) => at > h.now()).length
        h.metronome.changeVolume(0)
        // Muting must not cancel the queue...
        expect(h.beats().some((b) => b.cancelled)).toBe(false)
        expect(h.startTimes().filter((at) => at > h.now()).length).toBe(pendingBefore)
        expect(h.metronome.running).toBe(true)
        // ...and because every beat shares the one gain node, the change reaches beats that are
        // already committed to the audio clock. That is why there is no gain per beat.
        const volumeNode = h.created.gains[0]
        expect(volumeNode.gain.value).toBe(0)
        expect(h.created.sources.every((s) => s.connectedTo.includes(volumeNode))).toBe(true)
        const before = h.startTimes().length
        h.tick(0.25)
        expect(h.startTimes().length).toBeGreaterThan(before)
    })
})

describe('the metronome scheduler bookkeeping', () => {
    it('disconnects a beat once it has finished sounding', () => {
        const h = harness()
        h.metronome.start()
        h.tick(0.1)
        const first = h.created.sources[0]
        first.emitEnded()
        expect(first.calls.some((c) => c.method === 'disconnect')).toBe(true)
        // The entry is gone from the cancellation queue too, so a later stop() cannot reach back
        // and call stop() on a source that has already ended.
        h.metronome.stop()
        expect(first.calls.some((c) => c.method === 'stop')).toBe(false)
    })
})
