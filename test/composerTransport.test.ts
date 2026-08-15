// Guards for the composer's playback transport (src/lib/audio/ComposerTransport.ts, ADR-0006).
//
// Both of the transport's constructor seams exist for this file: jsdom has no AudioContext, so
// the clock is a mutable `{t, now: () => t}`, and the real timer is worker-timers, which runs
// inside a Worker jsdom does not provide (`ReferenceError: Worker is not defined` - the same
// seam metronome.test.ts documents). The fake timer records handler + ms + absolute target so a
// test can fire a wake on time, late, or hold its handler and fire it after it was cleared - the
// stale in-flight wake the real clearTimeout cannot always beat.
//
// What is under test is WHERE ON THE AUDIO CLOCK each column is committed and WHEN the sounding
// cursor moves; no audio is involved - commitColumn is the transport's entire audio output, and
// the callbacks record everything they are handed.
import {describe, expect, it} from 'vitest'
import {
    ComposerTransport,
    TRANSPORT_HORIZON_S,
    TRANSPORT_MIN_COMMIT_AHEAD,
    TRANSPORT_START_MARGIN_S,
} from '../src/lib/audio/ComposerTransport'

type Commit = { index: number, at: number, clockAtCommit: number }
type Sleep = { handler: () => void, ms: number, target: number }

function harness(durationsMs: number[]) {
    const clock = {t: 0, now: () => clock.t}
    let nextId = 1
    const pending = new Map<number, Sleep>()
    const timer = {
        setTimeout(handler: () => void, ms: number) {
            const id = nextId++
            pending.set(id, {handler, ms, target: clock.t + ms / 1000})
            return id
        },
        clearTimeout(id: number) {
            pending.delete(id)
        },
    }
    const commits: Commit[] = []
    const sounded: number[] = []
    let finishedCount = 0
    const transport = new ComposerTransport(
        clock,
        {
            columnDurationMs: (i) => durationsMs[i],
            columnCount: () => durationsMs.length,
            // clockAtCommit captures the commit's MARGIN - the whole point of the horizon is
            // how far ahead of the audio clock each column goes out.
            commitColumn: (i, at) => commits.push({index: i, at, clockAtCommit: clock.t}),
            onSounding: (i) => sounded.push(i),
            onFinished: () => {
                finishedCount++
            },
        },
        timer,
    )
    return {
        transport,
        clock,
        pending,
        commits,
        sounded,
        durationsMs,
        finished: () => finishedCount,
        /** The single armed sleep - the transport never has more than one, so assert it. */
        sleep(): Sleep {
            expect(pending.size).toBe(1)
            return [...pending.values()][0]
        },
        /** Fire the armed wake exactly at its target time, as a punctual timer would. */
        runNextWake() {
            expect(pending.size).toBe(1)
            const [id, entry] = [...pending.entries()][0]
            pending.delete(id)
            clock.t = Math.max(clock.t, entry.target)
            entry.handler()
        },
        /** Fire the armed wake at the CURRENT clock, wherever a test has moved it - a late wake. */
        fireArmed() {
            const entries = [...pending.entries()]
            expect(entries.length).toBe(1)
            const [id, entry] = entries[0]
            pending.delete(id)
            entry.handler()
        },
    }
}

const MARGIN = TRANSPORT_START_MARGIN_S

describe('anchoring the transport', () => {
    it('commits the anchor column at now + margin and the window as exact running sums', () => {
        const h = harness([100, 200, 300, 400, 500, 600])
        h.clock.t = 10
        h.transport.anchor(0)
        // The horizon gate (commitTime < now + 1s) admits columns 0..3; committing 3 pushes the
        // running sum to 11.05, past the window, and the MIN_COMMIT_AHEAD floor is already
        // satisfied. Absolute times, asserted as the exact running sum from the anchor.
        expect(h.commits.map((c) => c.index)).toEqual([0, 1, 2, 3])
        const expected = [10 + MARGIN, 10.15, 10.35, 10.65]
        h.commits.forEach((c, i) => expect(c.at).toBeCloseTo(expected[i], 9))
        // At least MIN_COMMIT_AHEAD columns beyond the cursor are committed.
        expect(Math.max(...h.commits.map((c) => c.index))).toBeGreaterThanOrEqual(
            0 + TRANSPORT_MIN_COMMIT_AHEAD,
        )
        // The anchor column gets no onSounding - the caller selected it itself.
        expect(h.sounded).toEqual([])
        // The armed sleep targets the anchor column's boundary on the absolute grid.
        expect(h.sleep().ms).toBeCloseTo((MARGIN + 0.1) * 1000, 6)
        expect(h.transport.isRunning).toBe(true)
        expect(h.transport.soundingColumn).toBe(0)
    })

    it('anchored on the last column, plays it and finishes at its end', () => {
        const h = harness([100, 100, 100])
        h.clock.t = 5
        h.transport.anchor(2)
        expect(h.commits.map((c) => c.index)).toEqual([2])
        expect(h.commits[0].at).toBeCloseTo(5 + MARGIN, 9)
        h.runNextWake()
        expect(h.clock.t).toBeCloseTo(5 + MARGIN + 0.1, 9)
        expect(h.finished()).toBe(1)
        expect(h.sounded).toEqual([])
        expect(h.transport.isRunning).toBe(false)
    })

    it('refuses an empty song or an out-of-range column without declaring the song finished', () => {
        // onFinished means the last column's audio elapsed; nothing sounded here, and firing it
        // would run the caller's end-of-song routine synchronously from inside anchor().
        const empty = harness([])
        empty.transport.anchor(0)
        expect(empty.transport.isRunning).toBe(false)
        expect(empty.pending.size).toBe(0)
        expect(empty.commits).toEqual([])
        expect(empty.finished()).toBe(0)

        const h = harness([100, 100])
        h.transport.anchor(5)
        h.transport.anchor(-1)
        expect(h.transport.isRunning).toBe(false)
        expect(h.pending.size).toBe(0)
        expect(h.commits).toEqual([])
        expect(h.finished()).toBe(0)
    })

    it('a jump while running cancels the old wake and rebuilds from the new column', () => {
        const h = harness(new Array(20).fill(200))
        h.transport.anchor(0)
        h.runNextWake()
        expect(h.transport.soundingColumn).toBe(1)
        const before = h.commits.length
        h.clock.t = 0.5
        h.transport.anchor(10)
        // Exactly one armed sleep: the old grid's timer must not survive to double-fire.
        expect(h.pending.size).toBe(1)
        const jumped = h.commits.slice(before)
        jumped.forEach((c, k) => {
            expect(c.index).toBe(10 + k)
            expect(c.at).toBeCloseTo(0.5 + MARGIN + 0.2 * k, 9)
        })
        expect(jumped.length).toBeGreaterThanOrEqual(1 + TRANSPORT_MIN_COMMIT_AHEAD)
        // No onSounding for the jump target either, and the next wake advances on the NEW grid.
        expect(h.sounded).toEqual([1])
        h.runNextWake()
        expect(h.transport.soundingColumn).toBe(11)
        expect(h.sounded).toEqual([1, 11])
    })
})

describe('the committed window', () => {
    it('fast tempo: fills the horizon up front and tops it back up at each boundary', () => {
        const h = harness(new Array(120).fill(34))
        h.transport.anchor(0)
        // Everything inside the 1 s horizon goes out at the anchor: 0.05 + 0.034k < 1 admits
        // k = 0..27.
        expect(h.commits.length).toBe(28)
        for (let i = 0; i < 40; i++) h.runNextWake()
        expect(h.sounded).toEqual(Array.from({length: 40}, (_, i) => i + 1))
        // The watermark commits each column exactly once across all those wakes...
        const indices = h.commits.map((c) => c.index)
        expect(new Set(indices).size).toBe(indices.length)
        // ...on the exact anchored grid...
        h.commits.forEach((c) => expect(c.at).toBeCloseTo(MARGIN + 0.034 * c.index, 9))
        // ...and every boundary top-up keeps the margin at ~1 s (within a column of the
        // horizon, never past it - the gate is commitTime < now + horizon).
        for (const c of h.commits.slice(28)) {
            const margin = c.at - c.clockAtCommit
            expect(margin).toBeGreaterThan(TRANSPORT_HORIZON_S - 3 * 0.034)
            expect(margin).toBeLessThan(TRANSPORT_HORIZON_S)
        }
    })

    it('slow tempo: a column is always committed at least one full column before it sounds', () => {
        // Trap 1: gated on the horizon alone, a 1000 ms column reaches its boundary exactly as
        // the window edge does and would be committed with zero margin. The
        // TRANSPORT_MIN_COMMIT_AHEAD floor is what this pins.
        const h = harness(new Array(6).fill(1000))
        h.transport.anchor(0)
        // The horizon alone would admit only column 0; the floor commits two more.
        expect(h.commits.map((c) => c.index)).toEqual([0, 1, 2])
        while (h.finished() === 0) h.runNextWake()
        for (const c of h.commits.slice(1)) {
            expect(c.at - c.clockAtCommit).toBeGreaterThanOrEqual(1)
        }
        expect(h.sounded).toEqual([1, 2, 3, 4, 5])
    })

    it('resync rebuilds the window from fresh durations behind the rewound watermark', () => {
        const h = harness(new Array(10).fill(100))
        h.transport.anchor(0)
        expect(h.commits.map((c) => c.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
        // The bpm halves under a running transport; the composer has cancelled the instruments'
        // committed-but-unstarted events and calls resync().
        for (let i = 0; i < h.durationsMs.length; i++) h.durationsMs[i] = 200
        const before = h.commits.length
        h.transport.resync()
        const recommitted = h.commits.slice(before)
        // The watermark rewound to the cursor: columns cursor+1.. go out AGAIN, on the new
        // grid. The sounding column itself is not recommitted - its audio already started.
        expect(recommitted.map((c) => c.index)).toEqual([1, 2, 3, 4])
        recommitted.forEach((c, k) => expect(c.at).toBeCloseTo(MARGIN + 0.2 * (k + 1), 9))
        // The sounding column's own boundary was recomputed with its fresh duration too.
        expect(h.sleep().ms).toBeCloseTo((MARGIN + 0.2) * 1000, 6)
    })

    it('floors a degenerate column duration instead of wedging the grid', () => {
        // A NaN duration would poison every later time through the running sums (and freeze the
        // wake loop - no comparison against NaN is true); a zero one would stall the boundary.
        const h = harness([100, 0, NaN, 100])
        h.transport.anchor(0)
        const times = h.commits.map((c) => c.at)
        for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1])
        expect(times.every((at) => Number.isFinite(at))).toBe(true)
        while (h.finished() === 0) h.runNextWake()
        expect(h.sounded).toEqual([1, 2, 3])
    })
})

describe('the wake loop', () => {
    it('re-arms onto the absolute next boundary after a late wake, not boundary + lateness', () => {
        const h = harness(new Array(10).fill(200))
        h.transport.anchor(0) // boundary at 0.25
        h.clock.t = 0.38 // the wake lands 130 ms late
        h.fireArmed()
        expect(h.transport.soundingColumn).toBe(1)
        // The next boundary is at 0.45 ABSOLUTE, so the sleep is the 70 ms that remain of it. A
        // scheduler accumulating intervals (or correcting them with a delayOffset) would sleep
        // 200 ms and carry the 130 ms forever.
        expect(h.sleep().ms).toBeCloseTo(70, 6)
    })

    it('walks every boundary a stall slept through, in order, committing each column once', () => {
        const h = harness(new Array(40).fill(34))
        h.transport.anchor(0)
        // The tab stalls: the clock jumps 500 ms past the first boundary in one step.
        h.clock.t = 0.55
        h.fireArmed()
        // One wake fires onSounding for every column whose boundary passed - a contiguous
        // cursor history, the opposite of Metronome dropping missed beats.
        expect(h.sounded).toEqual(Array.from({length: 14}, (_, i) => i + 1))
        expect(h.transport.soundingColumn).toBe(14)
        // The watermark holds: nothing recommitted, and the times are the unchanged absolute
        // running sums from the anchor.
        const indices = h.commits.map((c) => c.index)
        expect(new Set(indices).size).toBe(indices.length)
        h.commits.forEach((c) => expect(c.at).toBeCloseTo(MARGIN + 0.034 * c.index, 9))
        // And the next sleep is aimed at column 14's boundary on that same grid.
        expect(h.sleep().ms).toBeCloseTo((MARGIN + 0.034 * 15 - 0.55) * 1000, 6)
    })

    it('a stale wake from before a resync advances nothing and re-arms onto the new grid', () => {
        const h = harness([250, 250, 250, 250])
        h.transport.anchor(0) // old boundary at 0.30
        // The wake is already in flight when the resync clears it - hold the handler.
        const stale = h.sleep().handler
        h.durationsMs[0] = 400
        h.transport.resync() // new boundary at 0.45
        h.clock.t = 0.32 // past the OLD boundary, short of the new one
        stale()
        // The while condition is the staleness guard: no boundary is due on the new grid.
        expect(h.transport.soundingColumn).toBe(0)
        expect(h.sounded).toEqual([])
        expect(h.sleep().ms).toBeCloseTo(130, 6)
    })

    it('finishes when the last column stops sounding, not when the commits run out', () => {
        const h = harness([100, 100, 100])
        h.transport.anchor(0)
        // The whole song is inside the horizon: commits run out immediately. If exhausting them
        // meant "finished", the song would end here, ~1 s of audio early.
        expect(h.commits.map((c) => c.index)).toEqual([0, 1, 2])
        h.runNextWake()
        h.runNextWake()
        expect(h.sounded).toEqual([1, 2])
        expect(h.finished()).toBe(0)
        expect(h.transport.isRunning).toBe(true)
        // The boundary at the last column's END is the audio-true end of the song.
        h.runNextWake()
        expect(h.clock.t).toBeCloseTo(MARGIN + 0.3, 9)
        expect(h.finished()).toBe(1)
        expect(h.transport.isRunning).toBe(false)
        expect(h.pending.size).toBe(0)
    })
})

describe('stopping the transport', () => {
    it('clears the pending wake and no callback fires afterwards', () => {
        const h = harness(new Array(5).fill(200))
        h.transport.anchor(0)
        const stale = h.sleep().handler
        const committedBefore = h.commits.length
        h.transport.stop()
        expect(h.transport.isRunning).toBe(false)
        expect(h.pending.size).toBe(0)
        // Long after every boundary would have passed, even a wake that was already in flight
        // when stop() cleared it finds `running` false and does nothing.
        h.clock.t = 60
        stale()
        expect(h.commits.length).toBe(committedBefore)
        expect(h.sounded).toEqual([])
        expect(h.finished()).toBe(0)
        expect(h.pending.size).toBe(0)
    })

    it('resync is a no-op when the transport is not running', () => {
        const h = harness([100, 100])
        h.transport.resync()
        expect(h.commits).toEqual([])
        expect(h.pending.size).toBe(0)
        expect(h.transport.isRunning).toBe(false)
    })
})
