// The pin for ADR-0008: the composer's playback grid and ComposedSong.toRecordedSong must place
// every column at the SAME millisecond.
//
// They used to agree only at the tempos where 60000/bpm * changer is whole ms, because the
// composer summed a rounded value per column while the conversion accumulates exact ones and
// rounds where it emits a time. What plays and what a midi export re-imports as then slid apart
// in opposite directions depending on the tempo. columnsDurationMs is now a difference of two
// rounded cumulative boundaries, which telescopes onto the conversion's own onsets.
//
// The transport half drives the REAL ComposerTransport (same harness idiom as
// composerTransport.test.ts: a manual `{t, now}` clock and a fake timer, because jsdom has
// neither an AudioContext nor the Worker worker-timers needs), so what is pinned is the wiring
// as well as the arithmetic.
import {describe, expect, it} from 'vitest'
import {ComposedSong, INSTRUMENTS, INSTRUMENTS_DATA, TEMPO_CHANGERS} from './imports'
import {ComposerTransport, TRANSPORT_START_MARGIN_S} from '../src/lib/audio/ComposerTransport'

/** Every tempo the drift table in ADR-0008 measured: 8 that never disagreed, 4 that did. */
const BPMS = [40, 60, 90, 100, 110, 120, 140, 150, 200, 220, 240, 300]
const COLUMNS = 400
/** Spanned notes sit this far apart, so no span can reach the next same-(track, id) note. */
const SPAN_STRIDE = 7

function idOf(button: number): number {
    return INSTRUMENTS_DATA[INSTRUMENTS[0]].notes[button].midi
}

const PROBE_ID = idOf(0)
const SPAN_ID = idOf(4)

/**
 * A song whose track 0 carries one span-1 note in EVERY column, so toRecordedSong emits exactly
 * one onset per column in column order, and whose track 1 carries multi-column spans every
 * SPAN_STRIDE columns. All four tempo changers appear, cycling, so the grid is heterogeneous.
 */
function buildSong(bpm: number): { song: ComposedSong, spans: { column: number, span: number }[] } {
    const song = new ComposedSong('column timing', [INSTRUMENTS[0], INSTRUMENTS[1]])
    song.bpm = bpm
    song.addColumns(COLUMNS - song.columns.length, 'end')
    const spans: { column: number, span: number }[] = []
    for (let i = 0; i < COLUMNS; i++) {
        song.setTempoChangerAt(i, TEMPO_CHANGERS[i % TEMPO_CHANGERS.length])
        song.addNoteAt(i, 0, PROBE_ID)
        if (i % SPAN_STRIDE === 0 && i + SPAN_STRIDE < COLUMNS) {
            const span = (i % 5) + 2 // 2..6, always shorter than the stride
            song.addNoteAt(i, 1, SPAN_ID, span)
            spans.push({column: i, span})
        }
    }
    return {song, spans}
}

/** Column onsets as the CONVERSION states them: offset 0, one probe note per column, in order. */
function onsetsOf(song: ComposedSong): number[] {
    return song.toRecordedSong(0).notes.filter(note => note.trackIndex === 0).map(note => note.time)
}

function harness(song: ComposedSong) {
    const clock = {t: 0, now: () => clock.t}
    let nextId = 1
    const pending = new Map<number, { handler: () => void, target: number }>()
    const timer = {
        setTimeout(handler: () => void, ms: number) {
            const id = nextId++
            pending.set(id, {handler, target: clock.t + ms / 1000})
            return id
        },
        clearTimeout(id: number) {
            pending.delete(id)
        },
    }
    const commits: { index: number, at: number }[] = []
    let finished = 0
    const transport = new ComposerTransport(
        clock,
        {
            columnDurationMs: (i) => song.columnsDurationMs(i, i + 1),
            columnCount: () => song.columns.length,
            commitColumn: (index, at) => commits.push({index, at}),
            onSounding: () => {
            },
            onFinished: () => {
                finished++
            },
        },
        timer,
    )
    return {
        transport,
        clock,
        commits,
        finished: () => finished,
        /** Fire the single armed wake exactly at its target, as a punctual timer would. */
        runNextWake() {
            const [id, entry] = [...pending.entries()][0]
            pending.delete(id)
            clock.t = Math.max(clock.t, entry.target)
            entry.handler()
        },
    }
}

describe('the column grid the composer plays on', () => {
    it('places every column boundary where toRecordedSong does, at every tempo', () => {
        for (const bpm of BPMS) {
            const {song} = buildSong(bpm)
            const onsets = onsetsOf(song)
            expect(onsets.length).toBe(COLUMNS)
            for (let n = 0; n < COLUMNS; n++) {
                expect(song.columnsDurationMs(0, n)).toBe(onsets[n])
            }
            // ...and consecutive calls telescope: the transport only ever adds these up.
            let running = 0
            for (let n = 0; n < COLUMNS; n++) {
                expect(running).toBe(onsets[n])
                running += song.columnsDurationMs(n, n + 1)
            }
        }
    })

    it('is not the sum of per-column rounded lengths (the drift this replaced)', () => {
        // Non-vacuity guard for the tempos above: at 110 bpm this grid really does disagree with
        // the old policy, so the equalities are not being satisfied by both sides rounding alike.
        const {song} = buildSong(110)
        const msPerBeat = 60000 / 110
        let naive = 0
        for (const column of song.columns) {
            naive += Math.round(msPerBeat * TEMPO_CHANGERS[column.tempoChanger].changer)
        }
        expect(Math.abs(naive - song.columnsDurationMs(0, COLUMNS))).toBeGreaterThanOrEqual(1)
    })

    it('gives a spanned note the same ms length the conversion writes as its duration', () => {
        for (const bpm of BPMS) {
            const {song, spans} = buildSong(bpm)
            const recorded = song.toRecordedSong(0).notes.filter(note => note.trackIndex === 1)
            expect(recorded.length).toBe(spans.length)
            spans.forEach(({column, span}, i) => {
                // Both sides are integers off the same rounded boundaries - exact, not approximate.
                expect(song.columnsDurationMs(column, column + span)).toBe(recorded[i].duration)
            })
        }
    })

    it('rebuilds its cached grid when the bpm or a tempo changer moves under it', () => {
        const {song} = buildSong(110)
        // Read first: the point is that a POPULATED cache is invalidated, not that a cold one works.
        expect(song.columnsDurationMs(0, 10)).toBe(onsetsOf(song)[10])
        song.bpm = 140
        const fresh = buildSong(140).song
        for (let n = 0; n < COLUMNS; n++) {
            expect(song.columnsDurationMs(0, n)).toBe(fresh.columnsDurationMs(0, n))
        }
        expect(song.columnsDurationMs(0, COLUMNS - 1)).toBe(onsetsOf(song)[COLUMNS - 1])

        // A structural edit with no bpm change: the other half of the validation key.
        song.setTempoChangerAt(3, TEMPO_CHANGERS[TEMPO_CHANGERS.length - 1])
        const afterEdit = onsetsOf(song)
        for (let n = 0; n < COLUMNS; n++) {
            expect(song.columnsDurationMs(0, n)).toBe(afterEdit[n])
        }
    })
})

describe('the transport running on that grid', () => {
    it("commits every column at the conversion's own onset, at every tempo", () => {
        for (const bpm of BPMS) {
            const {song} = buildSong(bpm)
            const onsets = onsetsOf(song)
            const h = harness(song)
            h.transport.anchor(0)
            const anchorStart = TRANSPORT_START_MARGIN_S
            expect(h.commits[0].at).toBeCloseTo(anchorStart, 9)
            while (h.finished() === 0) h.runNextWake()
            expect(h.commits.length).toBe(COLUMNS)
            for (const {index, at} of h.commits) {
                // The transport works in SECONDS (durS = ms / 1000) and its grid is a running sum
                // of thousands of those, so the seconds can differ from the exact integer by a few
                // 1e-13; rounding the ms back out is the conversion tolerance, not a fuzzy compare.
                expect(Math.round((at - anchorStart) * 1000)).toBe(onsets[index])
            }
        }
    })
})
