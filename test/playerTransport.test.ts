// Guards for the player's playback transport (src/lib/audio/PlayerTransport.ts, ADR-0009).
//
// Same harness idiom as composerTransport.test.ts, and for the same two reasons: jsdom has no
// AudioContext, so the clock is a mutable `{t, now: () => t}`, and the real timer is worker-timers,
// which runs inside a Worker jsdom does not provide. The fake timer records handler + ms + absolute
// target so a test can fire a wake on time, late, or after it was cleared.
//
// What is under test is WHERE ON THE AUDIO CLOCK each event is committed and WHEN the sounding
// cursor reaches it; no audio is involved - commitEvent is the transport's entire audio output, and
// the callbacks record everything they are handed.
import {describe, expect, it} from 'vitest'
import {
    PLAYER_TRANSPORT_START_MARGIN_S,
    PlayerTransport,
    type PlayerTimeline,
} from '../src/lib/audio/PlayerTransport'
import {TRANSPORT_HORIZON_S} from '../src/lib/audio/ComposerTransport'

type Commit = { index: number, at: number, clockAtCommit: number }
type Sounding = { index: number, at: number }
type Sleep = { handler: () => void, ms: number, target: number }

const MARGIN = PLAYER_TRANSPORT_START_MARGIN_S

/** A timeline from bare onsets; the finish defaults to the last onset unless a test says otherwise. */
function timelineOf(atS: number[], finishS = atS[atS.length - 1] ?? 0): PlayerTimeline {
    return {events: atS.map(t => ({atS: t})), finishS}
}

function harness() {
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
    const soundingEvents: Sounding[] = []
    let finishedCount = 0
    const transport = new PlayerTransport(
        clock,
        {
            // clockAtCommit captures the commit's MARGIN - the whole point of the horizon is how
            // far ahead of the audio clock each event goes out.
            commitEvent: (index, at) => commits.push({index, at, clockAtCommit: clock.t}),
            onSounding: (index, at) => {
                sounded.push(index)
                soundingEvents.push({index, at})
            },
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
        soundingEvents,
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

describe('anchoring a run', () => {
    it('commits from the anchor at now + margin, keeping the timeline\'s own spacing', () => {
        const h = harness()
        h.clock.t = 10
        // onsets 0, 0.1, ... 1.1: the horizon admits everything committed before clock + 1 s.
        h.transport.anchor(timelineOf([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1]), 0)

        expect(h.commits.map(c => c.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
        h.commits.forEach(c => expect(c.at).toBeCloseTo(10 + MARGIN + 0.1 * c.index, 9))
        // Nothing sounds inside anchor() itself - the anchor event has its own wake, unlike the
        // composer's anchor column, which the caller had already selected.
        expect(h.sounded).toEqual([])
        expect(h.transport.isRunning).toBe(true)
        expect(h.transport.anchorAudioTime).toBeCloseTo(10 + MARGIN, 9)
        // The armed sleep targets the ANCHOR event's own boundary.
        expect(h.sleep().ms).toBeCloseTo(MARGIN * 1000, 6)

        h.runNextWake()
        expect(h.soundingEvents).toEqual([{index: 0, at: 10 + MARGIN}])
    })

    it('anchors mid-list, leaving everything before it uncommitted and unsounded', () => {
        const h = harness()
        h.transport.anchor(timelineOf([0, 1, 2, 3, 4]), 3)
        // The grid is anchored ON event 3: it sounds at the margin, and event 4 - a second out,
        // past the horizon - waits for the top-up that follows event 3's own boundary.
        expect(h.commits.map(c => c.index)).toEqual([3])
        expect(h.commits[0].at).toBeCloseTo(MARGIN, 9)
        expect(h.transport.anchorAudioTime).toBeCloseTo(MARGIN, 9)
        while (h.finished() === 0) h.runNextWake()
        expect(h.sounded).toEqual([3, 4])
    })

    it('refuses an empty timeline or an out-of-range index without declaring the run finished', () => {
        // onFinished means the last event's sound elapsed; nothing sounded here, and firing it
        // would run the caller's end-of-song routine synchronously from inside anchor().
        const empty = harness()
        empty.transport.anchor(timelineOf([]), 0)
        expect(empty.transport.isRunning).toBe(false)
        expect(empty.transport.anchorAudioTime).toBeNull()
        expect(empty.pending.size).toBe(0)
        expect(empty.commits).toEqual([])
        expect(empty.finished()).toBe(0)

        const h = harness()
        h.transport.anchor(timelineOf([0, 1]), 5)
        h.transport.anchor(timelineOf([0, 1]), -1)
        expect(h.transport.isRunning).toBe(false)
        expect(h.pending.size).toBe(0)
        expect(h.commits).toEqual([])
        expect(h.sounded).toEqual([])
        expect(h.finished()).toBe(0)
    })
})

describe('the committed window', () => {
    it('tops the horizon back up at each boundary, committing every event exactly once', () => {
        const h = harness()
        const onsets = Array.from({length: 120}, (_, i) => i * 0.034)
        h.transport.anchor(timelineOf(onsets), 0)
        // Everything inside the 1 s horizon goes out at the anchor: 0.05 + 0.034k < 1 admits
        // k = 0..27.
        expect(h.commits.length).toBe(28)
        for (let i = 0; i < 40; i++) h.runNextWake()
        expect(h.sounded).toEqual(Array.from({length: 40}, (_, i) => i))

        const indices = h.commits.map(c => c.index)
        expect(new Set(indices).size).toBe(indices.length)
        h.commits.forEach(c => expect(c.at).toBeCloseTo(MARGIN + 0.034 * c.index, 9))
        // Every top-up keeps the margin at ~1 s (within an event of the horizon, never past it -
        // the gate is `at < now + horizon`), and nothing is ever committed into the past.
        for (const c of h.commits.slice(28)) {
            const margin = c.at - c.clockAtCommit
            expect(margin).toBeGreaterThan(TRANSPORT_HORIZON_S - 3 * 0.034)
            expect(margin).toBeLessThan(TRANSPORT_HORIZON_S)
        }
        expect(h.commits.every(c => c.at > c.clockAtCommit)).toBe(true)
    })

    it('commits the whole of the next boundary however far beyond the horizon it lies', () => {
        // The floor is TIME-based, not a count of events: a chord is several events at one
        // instant, so "two events ahead" can be three notes of one chord and zero seconds of
        // margin. What has to hold is that the next boundary is never uncommitted.
        const h = harness()
        h.transport.anchor(timelineOf([0, 5, 5, 5, 10]), 0)
        // The horizon alone admits only the anchor - the next boundary is five seconds out.
        expect(h.commits.map(c => c.index)).toEqual([0])

        h.runNextWake()
        expect(h.sounded).toEqual([0])
        // ...and the whole chord at that boundary is committed as soon as it IS the next one.
        expect(h.commits.map(c => c.index)).toEqual([0, 1, 2, 3])
        h.commits.slice(1).forEach(c => {
            expect(c.at).toBeCloseTo(MARGIN + 5, 9)
            expect(c.at - c.clockAtCommit).toBeGreaterThan(TRANSPORT_HORIZON_S)
        })
    })

    it('advances the cursor across every event of a chord, in order, on one wake', () => {
        const h = harness()
        h.transport.anchor(timelineOf([0, 0.1, 0.1, 0.1, 0.2]), 0)
        h.runNextWake()
        expect(h.sounded).toEqual([0])

        h.runNextWake()
        expect(h.soundingEvents.slice(1)).toEqual([
            {index: 1, at: MARGIN + 0.1},
            {index: 2, at: MARGIN + 0.1},
            {index: 3, at: MARGIN + 0.1},
        ])
        // One boundary, one sleep: the chord does not arm three wakes at the same instant.
        expect(h.sleep().ms).toBeCloseTo(100, 6)
    })
})

describe('the wake loop', () => {
    it('re-arms onto the absolute next boundary after a late wake, not boundary + lateness', () => {
        const h = harness()
        h.transport.anchor(timelineOf([0, 0.2, 0.4, 0.6]), 0)
        h.runNextWake() // event 0 sounds at 0.05; the next boundary is 0.25 ABSOLUTE
        h.clock.t = 0.38 // the wake lands 130 ms late
        h.fireArmed()
        expect(h.sounded).toEqual([0, 1])
        // 70 ms remain of the 0.45 boundary. A scheduler accumulating intervals (or correcting
        // them with a delayOffset) would sleep 200 ms and carry the 130 ms forever.
        expect(h.sleep().ms).toBeCloseTo(70, 6)
    })

    it('reports every event a stall slept through, in order, without recommitting any', () => {
        const h = harness()
        const onsets = Array.from({length: 40}, (_, i) => i * 0.034)
        h.transport.anchor(timelineOf(onsets), 0)
        const committedBefore = h.commits.length
        // The tab stalls: the clock jumps half a second past the anchor in one step.
        h.clock.t = 0.55
        h.fireArmed()

        // A contiguous cursor history - the cursor is position, not sound, and it must land where
        // the audio actually is.
        expect(h.sounded).toEqual(Array.from({length: 15}, (_, i) => i))
        h.soundingEvents.forEach(event =>
            expect(event.at).toBeCloseTo(MARGIN + 0.034 * event.index, 9))
        const indices = h.commits.map(c => c.index)
        expect(new Set(indices).size).toBe(indices.length)
        expect(h.commits.slice(committedBefore).every(c => c.at > c.clockAtCommit)).toBe(true)
    })

    it('skips events a stall carried past the committed window instead of bursting them', () => {
        const h = harness()
        const onsets = Array.from({length: 100}, (_, i) => i * 0.034)
        h.transport.anchor(timelineOf(onsets), 0)
        expect(h.commits.at(-1)?.index).toBe(27)
        const committedBefore = h.commits.length

        // The committed horizon ends around 1.002 s. Audio time jumps well past it, so events
        // 28..44 were never scheduled and are now irrecoverably in the past.
        h.clock.t = 1.55
        h.fireArmed()

        expect(h.sounded).toEqual(Array.from({length: 45}, (_, i) => i))
        const afterStall = h.commits.slice(committedBefore)
        expect(afterStall[0].index).toBe(45)
        expect(afterStall.every(c => c.at > c.clockAtCommit)).toBe(true)
        expect(h.commits.some(c => c.index >= 28 && c.index <= 44)).toBe(false)
    })

    it('does not advance or recommit while the audio clock is frozen', () => {
        const h = harness()
        h.transport.anchor(timelineOf([0, 0.2, 0.4]), 0)
        const committed = [...h.commits]
        // A suspended AudioContext freezes currentTime even though worker timers keep waking.
        for (let i = 0; i < 3; i++) {
            h.fireArmed()
            expect(h.clock.t).toBe(0)
            expect(h.sounded).toEqual([])
            expect(h.commits).toEqual(committed)
            expect(h.sleep().ms).toBeCloseTo(MARGIN * 1000, 6)
        }
        h.clock.t = MARGIN
        h.fireArmed()
        expect(h.soundingEvents).toEqual([{index: 0, at: MARGIN}])
    })

    it('finishes at the finish time, not when the last event sounds', () => {
        const h = harness()
        // The last note is a two-second press: the run is not over when it is triggered.
        h.transport.anchor(timelineOf([0, 0.1], 2.1), 0)
        h.runNextWake()
        h.runNextWake()
        expect(h.sounded).toEqual([0, 1])
        expect(h.finished()).toBe(0)
        expect(h.transport.isRunning).toBe(true)
        // The remaining sleep is the rest of that press, on the absolute grid.
        expect(h.sleep().ms).toBeCloseTo(2000, 6)

        h.runNextWake()
        expect(h.clock.t).toBeCloseTo(MARGIN + 2.1, 9)
        expect(h.finished()).toBe(1)
        expect(h.transport.isRunning).toBe(false)
        expect(h.transport.anchorAudioTime).toBeNull()
        expect(h.pending.size).toBe(0)
    })
})

describe('stopping the transport', () => {
    it('clears the pending wake and no callback fires afterwards', () => {
        const h = harness()
        h.transport.anchor(timelineOf([0, 0.2, 0.4, 0.6, 0.8]), 0)
        const stale = h.sleep().handler
        const committedBefore = h.commits.length

        h.transport.stop()
        expect(h.transport.isRunning).toBe(false)
        expect(h.pending.size).toBe(0)

        // Long after every boundary would have passed, even a wake already in flight when stop()
        // cleared it finds `running` false and does nothing.
        h.clock.t = 60
        stale()
        expect(h.commits.length).toBe(committedBefore)
        expect(h.sounded).toEqual([])
        expect(h.finished()).toBe(0)
        expect(h.pending.size).toBe(0)
    })

    it('a re-anchor while running cancels the old wake and rebuilds from the new index', () => {
        const h = harness()
        const timeline = timelineOf([0, 0.2, 0.4, 0.6, 0.8, 1.0])
        h.transport.anchor(timeline, 0)
        h.runNextWake()
        expect(h.sounded).toEqual([0])

        h.clock.t = 0.5
        h.transport.anchor(timeline, 4)
        // Exactly one armed sleep: the old grid's timer must not survive to double-fire.
        expect(h.pending.size).toBe(1)
        h.runNextWake()
        expect(h.sounded).toEqual([0, 4])
        expect(h.soundingEvents.at(-1)?.at).toBeCloseTo(0.5 + MARGIN, 9)
    })
})
