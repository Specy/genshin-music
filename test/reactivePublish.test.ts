import {describe, expect, it} from 'vitest'
import {
    APP_NAME,
    ComposedSong,
    InstrumentData,
    INSTRUMENTS,
    INSTRUMENTS_DATA,
    NoteColumn,
    RecordedNote,
    TEMPO_CHANGERS,
    VsrgHitObject,
    VsrgSong,
    VsrgTrack,
    VsrgTrackModifier,
} from './imports'
import {buildRecordedSong} from './builders'
import {instanceCallables} from './reflect'
import {flushEffects, observeDerived, observeSignal} from './signals.svelte'

/**
 * The publish contract of the two reactive song classes, as a table (2026-08-06 reactive-model
 * plan: ComposedSong from phase 1, VsrgSong from phase 2). One section each, sharing the driver
 * below; the ComposedSong section comes first, the VsrgSong one after it.
 *
 * Why this file exists: the plan's top-listed risk is "a missed version bump is silently stale".
 * Nothing else in the suite can see one - before this file, DELETING ANY SINGLE #bumpStructure()
 * call left all six verification gates green, because every other test reads the model directly
 * and never subscribes to anything. Phases 3-4 build a renderer on these exact signals, so the
 * contract needs a gate of its own.
 *
 * Two halves, because they catch different failures:
 *  - `publishes`: which Svelte signals the call invalidates, matched as an EXACT SET. Effects
 *    coalesce (three publishes between two flushes are one run), so this half is structurally
 *    blind to publishing twice.
 *  - `touches`: which columns' plain `version` counter advanced, and by exactly how much. Plain
 *    counters do not coalesce, so this is the half that catches a double publish - and it is the
 *    value ComposerRenderer's narrowed repaint reads. This column is the MODEL half of that
 *    contract; the renderer half is test/composerRenderer.test.ts's REPAINTS table, whose four
 *    #touchColumns rows state the same ranges as painted column indices. A change to the range rule
 *    below has to move both. ComposedSong only: VsrgSong has no per-object render counters
 *    (VsrgHitObject.renderId is written by its constructor and read by nothing), so a double bump
 *    there is genuinely invisible to this file. Said plainly rather than implied by its absence.
 */

type SignalName =
    'structure' | 'selected' | 'breakpoints' | 'instruments'
    | 'name' | 'bpm' | 'pitch' | 'id' | 'folderId'

/**
 * How each signal is observed. EVERY reactive field of ComposedSong (its own plus the five it
 * inherits from Song) has an entry, which is what makes the `publishes: [...]` column an honest
 * exact set: a mutator that also wrote `name` or `bpm` on the side would otherwise satisfy
 * "EXACTLY these, no more" while publishing something no row mentions. The last four earn their
 * place that way alone - no mutator in the table touches them today.
 *
 * `Record<SignalName, ...>` is load-bearing: TypeScript refuses a new SignalName without a reader
 * here, and 'the table cannot be escaped' > 'observes every reactive field' refuses a new `$state`
 * field on the class without a SignalName.
 */
const SIGNAL_READERS: Record<SignalName, (song: ComposedSong) => unknown> = {
    //`columns` is the observation point for the private #structure signal: the getter reads it,
    //which is the only way to see it - and is exactly what every real consumer does
    structure: song => song.columns,
    selected: song => song.selected,
    //the FIELD, not .length: ComposerCanvas takes `breakpoints={song.breakpoints}` and
    //ComposerRendererState stores a plain number[], so a publish that only invalidated the
    //array's own index/length sources would never reach that consumer
    breakpoints: song => song.breakpoints,
    instruments: song => song.instruments,
    name: song => song.name,
    bpm: song => song.bpm,
    pitch: song => song.pitch,
    id: song => song.id,
    folderId: song => song.folderId,
}

/** Observation (and reporting) order. Kept in step with SIGNAL_READERS by a test below. */
const SIGNALS: SignalName[] = [
    'structure', 'selected', 'breakpoints', 'instruments', 'name', 'bpm', 'pitch', 'id', 'folderId'
]

interface PublishCase {
    /** a real method name on ComposedSong - cross-checked against the reflected surface below */
    name: string
    /** disambiguator when one method needs several rows (hit vs miss, clamped vs not) */
    label?: string
    /** the signals this call must invalidate - EXACTLY these, no more */
    publishes: SignalName[]
    /** whose plain NoteColumn.version must advance by exactly 1; every other column by 0 */
    touches: 'all' | 'none' | number[]
    /** state the case needs that is not the call under test - runs BEFORE the observers exist, so
     *  its own publishes are never counted */
    setup?: (song: ComposedSong) => void
    run: (song: ComposedSong) => void | Promise<void>
}

/** Note Id of a button on the game's default instrument. */
function idOf(button: number): number {
    return INSTRUMENTS_DATA[INSTRUMENTS[0]].notes[button].midi
}

/**
 * LOCAL builder on purpose - deliberately NOT test/builders.ts's buildComposedSong(), which is
 * frozen golden-fixture input: growing it to give this table interesting content (spans > 1, a
 * tempo changer, a breakpoint) would move fixtures.
 */
function makeSong(): ComposedSong {
    const song = new ComposedSong('publish table', [INSTRUMENTS[0], INSTRUMENTS[1]])
    song.bpm = 160
    //a note whose span COVERS two further columns - the range rule in #touchColumns is about
    //exactly this, and a single-column song would never exercise it
    song.addNoteAt(0, 0, idOf(0), 3)
    song.addNoteAt(0, 1, idOf(4))
    song.addNoteAt(4, 1, idOf(2))
    song.setTempoChangerAt(1, TEMPO_CHANGERS[1])
    song.breakpoints = [0, 3]
    song.selected = 0
    return song
}

/** Columns to hand to restoreColumns/initColumnsForConstruction: a real snapshot, fresh counters. */
function snapshotColumns(song: ComposedSong, amount: number): NoteColumn[] {
    return song.columns.slice(0, amount).map(column => column.clone())
}

const CASES: PublishCase[] = [
    // ---- leaf note edits -------------------------------------------------------------------
    {
        name: 'addNoteAt',
        publishes: ['structure'],
        touches: [6, 7],
        run: song => void song.addNoteAt(6, 0, idOf(6), 2),
    },
    {
        name: 'removeNoteAt',
        label: 'the note is there',
        publishes: ['structure'],
        //the span the note HAD decides the range: its tail was drawn on columns 1 and 2
        touches: [0, 1, 2],
        run: song => song.removeNoteAt(0, 0, idOf(0)),
    },
    {
        name: 'removeNoteAt',
        label: 'no such note',
        publishes: [],
        touches: 'none',
        run: song => song.removeNoteAt(6, 0, idOf(9)),
    },
    {
        name: 'setNoteSpan',
        label: 'grows',
        publishes: ['structure'],
        touches: [0, 1, 2, 3, 4],
        run: song => void song.setNoteSpan(0, 0, idOf(0), 5),
    },
    {
        name: 'setNoteSpan',
        label: 'shrinks - the abandoned columns still repaint',
        publishes: ['structure'],
        touches: [0, 1, 2],
        run: song => void song.setNoteSpan(0, 0, idOf(0), 1),
    },
    {
        name: 'setNoteSpan',
        label: 'no such note',
        publishes: [],
        touches: 'none',
        run: song => void song.setNoteSpan(6, 0, idOf(9), 4),
    },
    {
        name: 'setTempoChangerAt',
        label: 'one column',
        publishes: ['structure'],
        touches: [5],
        run: song => song.setTempoChangerAt(5, TEMPO_CHANGERS[2]),
    },
    {
        name: 'setTempoChangerAt',
        label: 'a tools selection',
        publishes: ['structure'],
        touches: [7, 8],
        run: song => song.setTempoChangerAt([7, 8], TEMPO_CHANGERS[2]),
    },
    {
        name: 'setTempoChangerAt',
        label: 'already that changer',
        publishes: [],
        touches: 'none',
        run: song => song.setTempoChangerAt(1, TEMPO_CHANGERS[1]),
    },
    // ---- column-array installs -------------------------------------------------------------
    {
        name: 'initColumnsForConstruction',
        //pins the construction-only contract: it is for songs NOBODY is watching yet, so it must
        //stay silent. A future caller reaching for it on the live song gets a frozen canvas, and
        //this row is the reminder that restoreColumns is the one that publishes.
        publishes: [],
        touches: 'none',
        run: song => song.initColumnsForConstruction(snapshotColumns(song, 10)),
    },
    {
        name: 'appendColumnsForConstruction',
        //same construction-only contract as initColumnsForConstruction, and silent for the same
        //reason. Its caller (RecordedSong.toComposedSong's span pass) grows the timeline from
        //inside a triple-nested loop, which is why it exists instead of addColumns(1, 'end'):
        //that one ends in a touch-every-column pass, i.e. O(columns) per appended column.
        publishes: [],
        touches: 'none',
        run: song => song.appendColumnsForConstruction(2),
    },
    {
        name: 'restoreColumns',
        label: 'same length - selected still fits',
        publishes: ['structure'],
        touches: 'all',
        run: song => song.restoreColumns(snapshotColumns(song, song.columns.length)),
    },
    {
        name: 'restoreColumns',
        label: 'shorter - selected re-clamps',
        publishes: ['structure', 'selected'],
        touches: 'all',
        setup: song => {
            song.selected = 50
        },
        run: song => song.restoreColumns(snapshotColumns(song, 10)),
    },
    {
        name: 'restoreColumns',
        //undo is a column-array SHRINK, so it owes the same breakpoint pass removeColumns does -
        //without it, undoing past the column a breakpoint sits on leaves that breakpoint in the
        //array and serialize() writes it to IndexedDB
        label: 'shorter - a breakpoint falls off the end',
        publishes: ['structure', 'breakpoints'],
        touches: 'all',
        setup: song => {
            song.breakpoints = [0, 50]
        },
        run: song => song.restoreColumns(snapshotColumns(song, 10)),
    },
    // ---- bulk / structural -----------------------------------------------------------------
    {
        name: 'normalizeSpans',
        publishes: ['structure'],
        touches: 'all',
        run: song => song.normalizeSpans(),
    },
    {
        name: 'addColumns',
        label: 'at the end',
        publishes: ['structure'],
        touches: 'all',
        run: song => song.addColumns(3, 'end'),
    },
    {
        name: 'addColumns',
        label: 'mid-song - spans across the insertion point stretch',
        publishes: ['structure'],
        touches: 'all',
        run: song => song.addColumns(3, 1),
    },
    {
        name: 'removeColumns',
        label: 'a breakpoint falls off the end',
        publishes: ['structure', 'breakpoints'],
        touches: 'all',
        run: song => song.removeColumns(98, 2),
    },
    {
        name: 'removeColumns',
        label: 'every breakpoint still addresses a column',
        //validateBreakpoints() assigns nothing when it filtered nothing, so `breakpoints` must
        //stay silent here - a reassignment of an identical array is a wasted invalidation
        publishes: ['structure'],
        touches: 'all',
        run: song => song.removeColumns(2, 90),
    },
    {
        name: 'deleteColumns',
        label: 'every breakpoint still addresses a column',
        publishes: ['structure', 'selected'],
        touches: 'all',
        run: song => void song.deleteColumns([5, 6]),
    },
    {
        name: 'deleteColumns',
        //it validates on its own now; Composer.svelte used to chain validateBreakpoints() onto its
        //one call site, which left the invariant one new caller away from breaking
        label: 'a breakpoint falls off the end',
        publishes: ['structure', 'selected', 'breakpoints'],
        touches: 'all',
        setup: song => {
            song.breakpoints = [0, 99]
        },
        run: song => void song.deleteColumns([5, 6]),
    },
    {
        name: 'eraseColumns',
        publishes: ['structure'],
        //erased notes may have had spans reaching well past the selection, so the whole song
        touches: 'all',
        run: song => void song.eraseColumns([0, 1], 'all'),
    },
    {
        name: 'pasteColumns',
        label: 'roster already covers the pasted tracks',
        publishes: ['structure'],
        touches: 'all',
        run: song => song.pasteColumns(snapshotColumns(song, 2), false),
    },
    {
        name: 'pasteColumns',
        label: 'pasted notes need new layers',
        publishes: ['structure', 'instruments'],
        touches: 'all',
        run: song => {
            const columns = snapshotColumns(song, 2)
            columns[0].addNote(3, idOf(6))
            return song.pasteColumns(columns, false)
        },
    },
    {
        name: 'pasteLayer',
        publishes: ['structure', 'instruments'],
        touches: 'all',
        run: song => song.pasteLayer(snapshotColumns(song, 2), false, 2),
    },
    {
        name: 'moveNotesBy',
        publishes: ['structure'],
        touches: 'all',
        run: song => song.moveNotesBy([0], 1, 'all'),
    },
    {
        name: 'switchLayer',
        publishes: ['structure'],
        touches: 'all',
        run: song => song.switchLayer(5, 0, 1, 0),
    },
    {
        name: 'swapLayer',
        publishes: ['structure'],
        touches: 'all',
        run: song => song.swapLayer(5, 0, 0, 1),
    },
    // ---- roster ----------------------------------------------------------------------------
    {
        name: 'addInstrument',
        publishes: ['instruments'],
        touches: 'none',
        run: song => song.addInstrument(INSTRUMENTS[0]),
    },
    {
        name: 'setInstrument',
        //name and Basepoint both unchanged: a pure presentation edit (colour, alias, mute), which
        //is the roster signal alone. Every OTHER shape of this call rewrites notes - see below
        label: 'existing layer, same instrument and Basepoint',
        publishes: ['instruments'],
        touches: 'none',
        run: song => song.setInstrument(1, new InstrumentData({name: INSTRUMENTS[1], icon: 'line'})),
    },
    {
        //ADR-0007: a swap is a NOTE edit (button-preserving rewrite through nominal
        //correspondence), so it moves the graph as well as the roster
        name: 'setInstrument',
        label: 'existing layer, swapped instrument',
        publishes: ['instruments', 'structure'],
        touches: 'all',
        run: song => song.setInstrument(1, new InstrumentData({name: INSTRUMENTS[0]})),
    },
    {
        //...and so is a per-layer Basepoint override, by the interval
        name: 'setInstrument',
        label: 'existing layer, Basepoint override',
        publishes: ['instruments', 'structure'],
        touches: 'all',
        run: song => song.setInstrument(1, new InstrumentData({name: INSTRUMENTS[1], pitch: 'D'})),
    },
    {
        //a swap on a layer with no notes moves the roster and nothing else: there is no graph edit
        //behind it, and a bump with no edit re-runs every consumer for nothing
        name: 'setInstrument',
        label: 'swapped instrument on an empty layer',
        publishes: ['instruments'],
        touches: 'none',
        setup: song => song.eraseColumns(song.columns.map((_, i) => i), 1),
        run: song => song.setInstrument(1, new InstrumentData({name: INSTRUMENTS[0]})),
    },
    {
        name: 'setInstrument',
        label: 'no such layer',
        publishes: [],
        touches: 'none',
        run: song => song.setInstrument(9, new InstrumentData({name: INSTRUMENTS[0]})),
    },
    {
        //ADR-0007: the song's Basepoint moving is a real edit of every note that follows it
        name: 'applyBasepointChange',
        label: 'song scope',
        publishes: ['structure'],
        touches: 'all',
        run: song => song.applyBasepointChange('song', 'C', 'D'),
    },
    {
        name: 'applyBasepointChange',
        label: 'one track',
        publishes: ['structure'],
        touches: 'all',
        run: song => song.applyBasepointChange(1, 'C', 'D'),
    },
    {
        name: 'applyBasepointChange',
        label: 'no interval',
        publishes: [],
        touches: 'none',
        run: song => song.applyBasepointChange('song', 'D', 'D'),
    },
    {
        //every track of makeSong() follows the song, so scoping to a track index that owns no
        //notes leaves the graph untouched - and an untouched graph publishes nothing
        name: 'applyBasepointChange',
        label: 'a scope with no notes in it',
        publishes: [],
        touches: 'none',
        run: song => song.applyBasepointChange(5, 'C', 'D'),
    },
    {
        name: 'swapInstruments',
        label: 'existing layers',
        publishes: ['instruments'],
        touches: 'none',
        run: song => song.swapInstruments(0, 1),
    },
    {
        name: 'swapInstruments',
        label: 'no such layer',
        publishes: [],
        touches: 'none',
        run: song => song.swapInstruments(0, 9),
    },
    {
        name: 'ensureInstruments',
        label: 'a note needs a layer the roster does not have',
        publishes: ['instruments'],
        touches: 'none',
        setup: song => song.addNoteAt(0, 3, idOf(8)),
        run: song => song.ensureInstruments(),
    },
    {
        name: 'ensureInstruments',
        label: 'roster already big enough',
        publishes: [],
        touches: 'none',
        run: song => song.ensureInstruments(),
    },
    {
        name: 'removeInstrument',
        //ONE logical edit = ONE bump per column. It used to call eraseColumns (which ends in its
        //own touch-all + bump) and then touch and bump again, advancing every counter by 2 - a
        //`touches` delta of 2 here means that regression is back, and phase 4 would repaint twice.
        publishes: ['structure', 'instruments'],
        touches: 'all',
        run: song => song.removeInstrument(0),
    },
    // ---- breakpoints -----------------------------------------------------------------------
    {
        name: 'toggleBreakpoint',
        label: 'adds one',
        //the FIELD signal, not the array contents: it used to splice/push in place, which under a
        //deep proxy notified index/length sources only and left every field reader (the canvas
        //prop, ComposerRendererState.breakpoints) stale - and under $state.raw notifies nothing
        publishes: ['breakpoints'],
        touches: 'none',
        run: song => song.toggleBreakpoint(5),
    },
    {
        name: 'toggleBreakpoint',
        label: 'removes one',
        publishes: ['breakpoints'],
        touches: 'none',
        run: song => song.toggleBreakpoint(3),
    },
    {
        name: 'toggleBreakpoint',
        label: 'past the end of the song',
        publishes: [],
        touches: 'none',
        run: song => song.toggleBreakpoint(500),
    },
    {
        name: 'toggleBreakpoint',
        //the guard tested the upper end only until this round, so this used to put -1 into the
        //array - which validateBreakpoints then had no reason to remove either
        label: 'not a column index at all',
        publishes: [],
        touches: 'none',
        run: song => song.toggleBreakpoint(-1),
    },
    {
        name: 'validateBreakpoints',
        label: 'drops a stale one',
        publishes: ['breakpoints'],
        touches: 'none',
        setup: song => {
            song.breakpoints = [0, 500]
        },
        run: song => song.validateBreakpoints(),
    },
    {
        name: 'validateBreakpoints',
        label: 'nothing to drop',
        publishes: [],
        touches: 'none',
        run: song => song.validateBreakpoints(),
    },
]

/** Same driver, empty expectations: these must not publish or touch anything at all. */
const READERS: PublishCase[] = [
    {name: 'serialize', publishes: [], touches: 'none', run: song => void song.serialize()},
    {name: 'toOldFormat', publishes: [], touches: 'none', run: song => void song.toOldFormat()},
    {name: 'toRecordedSong', publishes: [], touches: 'none', run: song => void song.toRecordedSong()},
    {name: 'toComposedSong', publishes: [], touches: 'none', run: song => void song.toComposedSong()},
    {name: 'toMidi', publishes: [], touches: 'none', run: song => void song.toMidi()},
    {name: 'clone', publishes: [], touches: 'none', run: song => void song.clone()},
    {name: 'copyColumns', publishes: [], touches: 'none', run: song => void song.copyColumns([0, 1], 'all')},
    {
        name: 'toOtherGame',
        //genuinely worth pinning: it normalizes spans and rewrites ids, but only on the clone it
        //returns. The source song must come out untouched, counters included.
        publishes: [],
        touches: 'none',
        setup: song => {
            song.data.appName = APP_NAME === 'Genshin' ? 'Sky' : 'Genshin'
        },
        run: song => void song.toOtherGame(APP_NAME === 'Genshin' ? 'Genshin' : 'Sky'),
    },
    {name: 'getSpanCovering', publishes: [], touches: 'none', run: song => void song.getSpanCovering(2, 0, idOf(0))},
    {name: 'maxSpanAt', publishes: [], touches: 'none', run: song => void song.maxSpanAt(0, 1, idOf(4))},
    {
        name: 'countOldFormatDroppedNotes',
        publishes: [],
        touches: 'none',
        run: song => void song.countOldFormatDroppedNotes(),
    },
]

/**
 * TS-`private` steps, reachable only through a public mutator and covered through it. Listed by
 * name rather than filtered out by a heuristic ("names starting with get/to are readers", etc.):
 * a heuristic silently absorbs a new mutator that happens to fit the pattern, while this list
 * forces adding a private helper to be a moment of thought.
 */
const INTERNAL: string[] = [
    'adjustSpansForInsertedColumns',
    'adjustSpansForRemovedColumns',
    'groupColumnNotesById',
    'legacyColumnsView',
    'nominalOf',
]

function caseName(testCase: {name: string, label?: string}): string {
    return testCase.label ? `${testCase.name} (${testCase.label})` : testCase.name
}

/**
 * Shared driver for both sections: observe every signal of `song`, take the baseline, run `body`,
 * and return which signals fired IN `signals` ORDER (so the caller can compare against a filtered
 * copy of the same list and get a set comparison that is also order-insensitive).
 *
 * `body` runs between the baseline and the final flush, which is where a caller that needs to
 * capture something else at that exact moment (the column counters) does it.
 */
async function firedSignals<TSong, TSignal extends string>(
    song: TSong,
    signals: TSignal[],
    readers: Record<TSignal, (song: TSong) => unknown>,
    body: () => void | Promise<void>
): Promise<TSignal[]> {
    const observers = signals.map(name => ({
        name,
        observer: observeSignal(() => readers[name](song)),
    }))
    try {
        await flushEffects()
        //every effect has run exactly once by now; that is the baseline
        const baseline = observers.map(({observer}) => observer.runs())
        await body()
        await flushEffects()
        return observers.filter(({observer}, i) => observer.runs() > baseline[i]).map(({name}) => name)
    } finally {
        //load-bearing, not tidiness: without it a failed assertion leaves a live effect root per
        //signal for the rest of the file, still counting mutations on a song nobody is testing
        //any more
        observers.forEach(({observer}) => observer.dispose())
    }
}

async function drive(testCase: PublishCase) {
    const song = makeSong()
    testCase.setup?.(song)
    //keyed by the NoteColumn OBJECT, not by index: addColumns/removeColumns/deleteColumns shift
    //indexes, while instance identity is stable across them
    let versionBefore = new Map<NoteColumn, number>()
    let columnAtIndex = new Map<number, NoteColumn>()
    const fired = await firedSignals(song, SIGNALS, SIGNAL_READERS, async () => {
        versionBefore = new Map(song.columns.map(column => [column, column.version]))
        columnAtIndex = new Map(song.columns.map((column, i) => [i, column]))
        await testCase.run(song)
    })
    expect(fired).toEqual(SIGNALS.filter(name => testCase.publishes.includes(name)))

    //columns CREATED by the call are absent from versionBefore, so `?? 0` gives them the same
    //expected delta of 1: constructed at 0, touched once
    const delta = (column: NoteColumn) => column.version - (versionBefore.get(column) ?? 0)
    if (testCase.touches === 'none') {
        song.columns.forEach(column => expect(delta(column)).toBe(0))
    } else if (testCase.touches === 'all') {
        song.columns.forEach(column => expect(delta(column)).toBe(1))
    } else {
        const expected = new Set(testCase.touches.map(i => columnAtIndex.get(i)))
        song.columns.forEach(column => expect(delta(column)).toBe(expected.has(column) ? 1 : 0))
    }
}

describe('ComposedSong mutators publish exactly what they claim', () => {
    for (const testCase of CASES) {
        it(caseName(testCase), () => drive(testCase))
    }
})

describe('ComposedSong readers publish nothing', () => {
    for (const testCase of READERS) {
        it(caseName(testCase), () => drive(testCase))
    }
})

/**
 * `$state` and `$state.raw` class fields both compile to a get/set accessor PAIR on the prototype;
 * plain fields stay own data properties and getter-only accessors (`columns`, `selectedColumn`,
 * `tracks`, `structureVersion`) have no setter. So this is exactly the reactive surface. The
 * private structure signal of each class is invisible by design - its getter is the observation
 * point.
 *
 * Walks the class's own prototype plus Song's, which is where the five inherited scalars and
 * `instruments` live.
 */
function reactiveFieldNames(klass: {prototype: object}): string[] {
    const names: string[] = []
    for (const target of [klass.prototype, Object.getPrototypeOf(klass.prototype)]) {
        for (const name of Object.getOwnPropertyNames(target)) {
            const descriptor = Object.getOwnPropertyDescriptor(target, name)
            if (descriptor && descriptor.get && descriptor.set) names.push(name)
        }
    }
    return names.sort()
}

describe('the table cannot be escaped', () => {
    it('classifies every callable on ComposedSong', () => {
        const classified = new Set([...CASES, ...READERS].map(c => c.name).concat(INTERNAL))
        //instanceCallables, not the statics: this table is about what MUTATING a live song
        //publishes, and a static has no song to publish for. test/reflect.ts's header has the
        //rules the walk follows (test/serializePlain.test.ts uses the same one)
        const surface = instanceCallables(new ComposedSong('surface'))
        //a NEW mutator lands here until someone gives it a row
        expect(surface.filter(name => !classified.has(name))).toEqual([])
        //a renamed or deleted method leaves a stale row, which lands here
        expect([...classified].filter(name => !surface.includes(name)).sort()).toEqual([])
    })

    it('keeps the composer draw path free of deep proxies', () => {
        //`instruments` and `breakpoints` are `$state.raw` so ComposerRendererState gets PLAIN
        //arrays: the draw loops index them per column and per note, and a Proxy trap there costs
        //~20x a plain element read. Switching either back to plain `$state` would reintroduce that
        //silently - nothing else in the suite, and nothing in the type system, would notice.
        //
        //The discriminator: assigning a plain array to a deep `$state` field stores a PROXY of it
        //(structuredClone then refuses the array itself), while `$state.raw` stores the array
        //as-is. Verified both ways against this tree.
        const song = new ComposedSong('draw path')
        song.instruments = []
        song.breakpoints = [0, 1]
        expect(() => structuredClone(song.instruments)).not.toThrow()
        expect(() => structuredClone(song.breakpoints)).not.toThrow()
        //`columns` is plain for a different reason - it is a private array behind a getter, never
        //passed through a `$state` container without restoreColumns laundering it
        expect(() => structuredClone(song.columns.map(column => column.tempoChanger))).not.toThrow()
        //Composer.svelte's `selectedColumns` is the third array on that draw path and is
        //component-local, so it cannot be reached from here - its rule lives at its declaration.
    })

    it('names a signal, and an observer, for every reactive field ComposedSong exposes', () => {
        //compared against the OBSERVED set, not a hardcoded list: SIGNALS is what drive() builds
        //its observers from, so a `$state` field added in a later phase genuinely does fail here
        //until it gets a SignalName (and, through the Record, a reader). While four of the eight
        //sat in a hardcoded literal that nothing observed, this test asserted nothing of the kind.
        //'structure' is the one signal with no field of its own - #structure is private and is
        //observed through the `columns` getter.
        const observed = SIGNALS.filter(name => name !== 'structure').sort()
        expect(observed).toEqual(
            ['bpm', 'breakpoints', 'folderId', 'id', 'instruments', 'name', 'pitch', 'selected']
        )
        expect(reactiveFieldNames(ComposedSong)).toEqual(observed)
    })

    it('keeps SIGNALS and SIGNAL_READERS in step', () => {
        //TypeScript forces a reader per SignalName, but not a SIGNALS entry - and a name missing
        //from SIGNALS is a signal nothing observes, which is the exact hole this file just closed
        expect([...SIGNALS].sort()).toEqual(Object.keys(SIGNAL_READERS).sort())
    })
})

// ============================================================================================
// VsrgSong (2026-08-06 reactive-model plan, phase 2)
// ============================================================================================

/**
 * VsrgSong's reactive surface. `structure` is the private #structure signal, observed the only way
 * it can be - through the `tracks` getter, which is exactly what every real consumer does.
 *
 * Every OTHER name here is a real `$state`/`$state.raw` field, and the test at the bottom of this
 * file proves the list is the whole set: without that, `publishes: [...]` would be "exactly these
 * of the ones I happened to observe", which is not an exact set at all. The six inherited from
 * Song earn their place that way alone - only `set` touches any of them.
 */
type VsrgSignalName =
    'structure' | 'keys' | 'duration' | 'difficulty' | 'snapPoint' | 'audioSongId'
    | 'trackModifiers' | 'breakpoints'
    | 'name' | 'bpm' | 'pitch' | 'id' | 'folderId' | 'instruments'

const VSRG_SIGNAL_READERS: Record<VsrgSignalName, (song: VsrgSong) => unknown> = {
    structure: song => song.tracks,
    keys: song => song.keys,
    duration: song => song.duration,
    difficulty: song => song.difficulty,
    snapPoint: song => song.snapPoint,
    audioSongId: song => song.audioSongId,
    //the FIELDS, not their contents: both are `$state.raw`, so the whole-array signal is the only
    //thing there is to observe - and VsrgComposerMenu/VsrgComposerRendererState both take the array
    trackModifiers: song => song.trackModifiers,
    breakpoints: song => song.breakpoints,
    name: song => song.name,
    bpm: song => song.bpm,
    pitch: song => song.pitch,
    id: song => song.id,
    folderId: song => song.folderId,
    instruments: song => song.instruments,
}

/** Observation (and reporting) order. Kept in step with VSRG_SIGNAL_READERS by a test below. */
const VSRG_SIGNALS: VsrgSignalName[] = [
    'structure', 'keys', 'duration', 'difficulty', 'snapPoint', 'audioSongId',
    'trackModifiers', 'breakpoints', 'name', 'bpm', 'pitch', 'id', 'folderId', 'instruments',
]

interface VsrgPublishCase {
    /** a real method name on VsrgSong - cross-checked against the reflected surface below */
    name: string
    label?: string
    /** the signals this call must invalidate - EXACTLY these, no more */
    publishes: VsrgSignalName[]
    setup?: (song: VsrgSong) => void
    run: (song: VsrgSong) => void | Promise<void>
}

/**
 * Two tracks, three hit objects, two modifiers, two breakpoints, and a duration well past every
 * timestamp - so a case can create a hit object WITHOUT widening the song, which is its own row.
 */
function makeVsrgSong(): VsrgSong {
    const song = new VsrgSong('publish table')
    song.duration = 10000
    song.addTrack(INSTRUMENTS[0])
    song.addTrack(INSTRUMENTS[0])
    song.createHitObjectInTrack(0, 1000, 0)
    song.createHeldHitObject(0, 2000, 1)
    song.createHitObjectInTrack(1, 3000, 2)
    song.trackModifiers = [new VsrgTrackModifier(), new VsrgTrackModifier()]
    song.breakpoints = [0, 4000]
    return song
}

/** The background song setAudioSong is handed. It needs an id - a null one matches audioSongId. */
function audioSong() {
    const song = buildRecordedSong()
    song.id = 'audio-song-1'
    return song
}

const VSRG_CASES: VsrgPublishCase[] = [
    // ---- tracks ----------------------------------------------------------------------------
    {
        name: 'addTrack',
        publishes: ['structure'],
        run: song => void song.addTrack(INSTRUMENTS[0]),
    },
    {
        name: 'setTrack',
        //the SAME object back, mutated in place - which is all VsrgTrackSettings ever hands over.
        //An identity early return here is the single most tempting "optimization" in this class and
        //it would freeze the canvas's texture cache and the sidebar on every colour edit.
        label: 'the track it is given is already at that index',
        publishes: ['structure'],
        run: song => song.setTrack(0, song.tracks[0].set({color: '#123456'})),
    },
    {
        name: 'setTrack',
        label: 'no such track',
        publishes: [],
        run: song => song.setTrack(9, new VsrgTrack(INSTRUMENTS[0])),
    },
    {
        name: 'deleteTrack',
        publishes: ['structure'],
        run: song => song.deleteTrack(1),
    },
    {
        name: 'deleteTrack',
        label: 'no such track',
        publishes: [],
        run: song => song.deleteTrack(9),
    },
    {
        name: 'deleteTrack',
        //the deliberate behaviour change, pinned on the publish side too: the pre-phase-2 body was a
        //bare splice(), which counts a negative index from the END - this deleted the last track and
        //published. test/vsrgSong.test.ts asserts the track survives; this asserts nobody is told
        //anything happened.
        label: 'a negative index',
        publishes: [],
        run: song => song.deleteTrack(-1),
    },
    {
        name: 'initTracksForConstruction',
        //pins the construction-only contract: it is for songs NOBODY is watching yet, so it must
        //stay silent. A future caller reaching for it on the live song gets a frozen canvas.
        publishes: [],
        run: song => song.initTracksForConstruction([new VsrgTrack(INSTRUMENTS[0])]),
    },
    // ---- hit objects -----------------------------------------------------------------------
    {
        name: 'createHitObjectInTrack',
        label: 'a new one, inside the existing duration',
        publishes: ['structure'],
        run: song => void song.createHitObjectInTrack(0, 5000, 3),
    },
    {
        name: 'createHitObjectInTrack',
        label: 'one is already there',
        publishes: [],
        run: song => void song.createHitObjectInTrack(0, 1000, 0),
    },
    {
        name: 'createHitObjectInTrack',
        label: 'past the end of the song',
        publishes: ['structure', 'duration'],
        run: song => void song.createHitObjectInTrack(0, 20000, 0),
    },
    {
        name: 'createHeldHitObject',
        label: 'a new one',
        publishes: ['structure'],
        run: song => void song.createHeldHitObject(0, 5000, 3),
    },
    {
        name: 'createHeldHitObject',
        //ONE bump for one logical edit: an existing tap becoming held is a single change, not
        //"create (publish) then set isHeld (publish again)"
        label: 'an existing tap becomes held',
        publishes: ['structure'],
        run: song => void song.createHeldHitObject(0, 1000, 0),
    },
    {
        name: 'createHeldHitObject',
        label: 'already held',
        publishes: [],
        run: song => void song.createHeldHitObject(0, 2000, 1),
    },
    {
        name: 'addHitObjectInTrack',
        publishes: ['structure'],
        run: song => song.addHitObjectInTrack(1, new VsrgHitObject(0, 6000)),
    },
    {
        name: 'setHeldHitObjectTail',
        publishes: ['structure'],
        run: song => song.setHeldHitObjectTail(0, song.tracks[0].hitObjects[1], 500),
    },
    {
        name: 'moveHitObject',
        publishes: ['structure'],
        run: song => song.moveHitObject(song.tracks[0].hitObjects[0], 1500, 2),
    },
    {
        name: 'moveHitObject',
        label: 'already there',
        publishes: [],
        run: song => song.moveHitObject(song.tracks[0].hitObjects[0], 1000, 0),
    },
    {
        name: 'extendHeldHitObject',
        //A DELIBERATE non-publisher, pinned here so it is not "fixed" by accident. It runs once per
        //frame while a key is held during playback, and what shows the growing tail - the canvas -
        //is already redrawing on its own tick. See its comment in VsrgSong.svelte.ts, and
        //#bumpStructure there for the other methods that reach the graph without publishing.
        publishes: [],
        run: song => song.extendHeldHitObject(song.tracks[0].hitObjects[1], 900),
    },
    {
        name: 'toggleNoteInHitObject',
        publishes: ['structure'],
        run: song => song.toggleNoteInHitObject(song.tracks[0].hitObjects[0], 60),
    },
    {
        //ADR-0007's vsrg twin: hit-object numbers move with the Basepoint
        name: 'applyBasepointChange',
        label: 'song scope',
        publishes: ['structure'],
        setup: song => song.toggleNoteInHitObject(song.tracks[0].hitObjects[0], 60),
        run: song => song.applyBasepointChange('song', 'C', 'D'),
    },
    {
        name: 'applyBasepointChange',
        label: 'no interval',
        publishes: [],
        setup: song => song.toggleNoteInHitObject(song.tracks[0].hitObjects[0], 60),
        run: song => song.applyBasepointChange('song', 'D', 'D'),
    },
    {
        //makeVsrgSong's hit objects carry no notes, so there is nothing to move and nothing to say
        name: 'applyBasepointChange',
        label: 'no notes to move',
        publishes: [],
        run: song => song.applyBasepointChange('song', 'C', 'D'),
    },
    {
        name: 'removeHitObjectInTrack',
        publishes: ['structure'],
        run: song => song.removeHitObjectInTrack(0, song.tracks[0].hitObjects[0]),
    },
    {
        name: 'removeHitObjectInTrack',
        label: 'not in that track',
        publishes: [],
        run: song => song.removeHitObjectInTrack(1, song.tracks[0].hitObjects[0]),
    },
    {
        name: 'removeHitObjectInTrackAtTimestamp',
        publishes: ['structure'],
        run: song => song.removeHitObjectInTrackAtTimestamp(0, 1000, 0),
    },
    {
        name: 'removeHitObjectInTrackAtTimestamp',
        label: 'nothing there',
        publishes: [],
        run: song => song.removeHitObjectInTrackAtTimestamp(0, 9999, 0),
    },
    {
        name: 'removeHitObjectsBetween',
        publishes: ['structure'],
        run: song => song.removeHitObjectsBetween(0, 5000),
    },
    {
        name: 'removeHitObjectsBetween',
        label: 'nothing in range',
        publishes: [],
        run: song => song.removeHitObjectsBetween(7000, 8000),
    },
    // ---- track modifiers -------------------------------------------------------------------
    {
        name: 'setTrackModifier',
        publishes: ['trackModifiers'],
        run: song => song.setTrackModifier(0, {muted: true}),
    },
    {
        name: 'setTrackModifier',
        label: 'already that value',
        publishes: [],
        run: song => song.setTrackModifier(0, {muted: false, hidden: false}),
    },
    {
        name: 'setTrackModifier',
        label: 'no such modifier',
        publishes: [],
        run: song => song.setTrackModifier(9, {muted: true}),
    },
    // ---- breakpoints -----------------------------------------------------------------------
    {
        name: 'setBreakpoint',
        label: 'adds one',
        //the FIELD signal: `breakpoints` is `$state.raw`, so the push/splice this used to do
        //published nothing at all on its own and only worked because the validateBreakpoints() call
        //chained after it happened to reassign
        publishes: ['breakpoints'],
        run: song => song.setBreakpoint(2000, true),
    },
    {
        name: 'setBreakpoint',
        label: 'already there',
        publishes: [],
        run: song => song.setBreakpoint(4000, true),
    },
    {
        name: 'setBreakpoint',
        label: 'removes one',
        publishes: ['breakpoints'],
        run: song => song.setBreakpoint(4000, false),
    },
    {
        name: 'setBreakpoint',
        label: 'nothing to remove',
        publishes: [],
        run: song => song.setBreakpoint(2000, false),
    },
    {
        name: 'setBreakpoint',
        //refused for the same reason validateBreakpoints would drop it - one definition of a valid
        //breakpoint, not two
        label: 'at or past the end of the song',
        publishes: [],
        run: song => song.setBreakpoint(10000, true),
    },
    {
        name: 'validateBreakpoints',
        label: 'drops a stale one',
        publishes: ['breakpoints'],
        setup: song => {
            song.breakpoints = [0, 99999]
        },
        run: song => song.validateBreakpoints(),
    },
    {
        name: 'validateBreakpoints',
        label: 'nothing to drop',
        publishes: [],
        run: song => song.validateBreakpoints(),
    },
    // ---- scalars ---------------------------------------------------------------------------
    {
        name: 'changeKeys',
        publishes: ['keys'],
        run: song => song.changeKeys(6),
    },
    {
        name: 'changeKeys',
        //`$state` compares with === before notifying, so writing the value a field already holds is
        //free. Several mutators above lean on that rather than guarding by hand; this is the row
        //that says so out loud.
        label: 'already that value',
        publishes: [],
        run: song => song.changeKeys(4),
    },
    {
        name: 'setAudioSong',
        publishes: ['audioSongId', 'trackModifiers'],
        run: song => song.setAudioSong(audioSong()),
    },
    {
        name: 'setAudioSong',
        label: 'the same song again',
        publishes: [],
        setup: song => song.setAudioSong(audioSong()),
        run: song => song.setAudioSong(audioSong()),
    },
    {
        name: 'setAudioSong',
        //QUIRK preserved: clearing the background song clears the id but leaves the modifiers it
        //created, so the panel keeps showing that song's track list until another one is picked
        label: 'cleared',
        publishes: ['audioSongId'],
        setup: song => song.setAudioSong(audioSong()),
        run: song => song.setAudioSong(null),
    },
    {
        name: 'setAudioSong',
        label: 'cleared when there was none',
        publishes: [],
        run: song => song.setAudioSong(null),
    },
    {
        name: 'setDurationFromNotes',
        label: 'the background song is longer',
        publishes: ['duration'],
        run: song => void song.setDurationFromNotes([new RecordedNote(60, 20000, 0, 0)]),
    },
    {
        name: 'setDurationFromNotes',
        label: 'the background song is shorter',
        publishes: [],
        run: song => void song.setDurationFromNotes([new RecordedNote(60, 500, 0, 0)]),
    },
    {
        name: 'set',
        label: 'one scalar',
        publishes: ['bpm'],
        run: song => void song.set({bpm: 180}),
    },
    {
        name: 'set',
        //Object.assign invokes the accessor pair a `$state` field compiles to, so every key
        //published. `tracks` is deliberately not in VsrgSongPatch: it is a getter with no setter,
        //and Object.assign onto one throws at runtime where TypeScript sees nothing.
        label: 'several at once',
        publishes: ['keys', 'difficulty', 'snapPoint'],
        run: song => void song.set({keys: 6, difficulty: 9, snapPoint: 4}),
    },
    // ---- playback --------------------------------------------------------------------------
    {
        name: 'startPlayback',
        //advances each track's private playback cursor and nothing else. Publishing here would
        //invalidate every reader of `tracks` at frame rate for something no consumer can see.
        publishes: [],
        run: song => song.startPlayback(0),
    },
    {
        name: 'tickPlayback',
        publishes: [],
        run: song => void song.tickPlayback(5000),
    },
]

/** Same driver, empty expectations: these must not publish anything at all. */
const VSRG_READERS: VsrgPublishCase[] = [
    {name: 'serialize', publishes: [], run: song => void song.serialize()},
    {name: 'clone', publishes: [], run: song => void song.clone()},
    {
        name: 'toOtherGame',
        //worth pinning: it rewrites instruments and note ids, but only on the clone it returns
        publishes: [],
        setup: song => {
            song.data.appName = APP_NAME === 'Genshin' ? 'Sky' : 'Genshin'
        },
        run: song => void song.toOtherGame(APP_NAME === 'Genshin' ? 'Genshin' : 'Sky'),
    },
    {name: 'getHighestNoteTime', publishes: [], run: song => void song.getHighestNoteTime()},
    {name: 'getClosestBreakpoint', publishes: [], run: song => void song.getClosestBreakpoint(1000, 1)},
    {name: 'getRenderableNotes', publishes: [], run: song => void song.getRenderableNotes(buildRecordedSong())},
    {
        name: 'containsHitObject',
        publishes: [],
        run: song => void song.containsHitObject(song.tracks[0].hitObjects[0]),
    },
    {name: 'getHitObjectsAt', publishes: [], run: song => void song.getHitObjectsAt(1000, 0)},
    {name: 'getHitObjectsBetween', publishes: [], run: song => void song.getHitObjectsBetween(0, 5000)},
    {name: 'getHitObjectInTrack', publishes: [], run: song => void song.getHitObjectInTrack(0, 1000, 0)},
    {name: 'getAccuracyBounds', publishes: [], run: song => void song.getAccuracyBounds()},
]

/**
 * TS-`private` steps, reachable only through a public mutator and covered through it. `private` is
 * erased at runtime, so these are ordinary prototype methods the reflection below still sees;
 * `#`-private members (#bumpStructure, #createHitObject, #installBreakpoints) are genuinely
 * invisible and need no entry.
 */
const VSRG_INTERNAL: string[] = ['nextTrackColor']

async function driveVsrg(testCase: VsrgPublishCase) {
    const song = makeVsrgSong()
    testCase.setup?.(song)
    const fired = await firedSignals(song, VSRG_SIGNALS, VSRG_SIGNAL_READERS, () => testCase.run(song))
    expect(fired).toEqual(VSRG_SIGNALS.filter(name => testCase.publishes.includes(name)))
}

describe('VsrgSong mutators publish exactly what they claim', () => {
    for (const testCase of VSRG_CASES) {
        it(caseName(testCase), () => driveVsrg(testCase))
    }
})

describe('VsrgSong readers publish nothing', () => {
    for (const testCase of VSRG_READERS) {
        it(caseName(testCase), () => driveVsrg(testCase))
    }
})

describe('the VsrgSong table cannot be escaped', () => {
    it('classifies every callable on VsrgSong', () => {
        const classified = new Set([...VSRG_CASES, ...VSRG_READERS].map(c => c.name).concat(VSRG_INTERNAL))
        const surface = instanceCallables(new VsrgSong('surface'))
        //a NEW mutator lands here until someone gives it a row
        expect(surface.filter(name => !classified.has(name))).toEqual([])
        //a renamed or deleted method leaves a stale row, which lands here
        expect([...classified].filter(name => !surface.includes(name)).sort()).toEqual([])
    })

    it('names a signal, and an observer, for every reactive field VsrgSong exposes', () => {
        //'structure' is the one signal with no field of its own - #structure is private and is
        //observed through the `tracks` getter
        const observed = VSRG_SIGNALS.filter(name => name !== 'structure').sort()
        expect(observed).toEqual([
            'audioSongId', 'bpm', 'breakpoints', 'difficulty', 'duration', 'folderId', 'id',
            'instruments', 'keys', 'name', 'pitch', 'snapPoint', 'trackModifiers',
        ])
        expect(reactiveFieldNames(VsrgSong)).toEqual(observed)
    })

    it('keeps VSRG_SIGNALS and VSRG_SIGNAL_READERS in step', () => {
        expect([...VSRG_SIGNALS].sort()).toEqual(Object.keys(VSRG_SIGNAL_READERS).sort())
    })

    it('keeps the vsrg playback and draw paths free of deep proxies', () => {
        //`trackModifiers` and `breakpoints` are `$state.raw` so both stay PLAIN arrays: the composer
        //looks up trackModifiers[note.trackIndex] per audio note per playback tick, and the renderer
        //walks breakpoints on every timeline draw. Switching either to plain `$state` would put a
        //Proxy trap on those reads silently.
        //
        //The discriminator: assigning a plain array to a deep `$state` field stores a PROXY of it
        //(structuredClone then refuses the array itself), while `$state.raw` stores it as-is.
        const song = new VsrgSong('draw path')
        song.trackModifiers = [new VsrgTrackModifier()]
        song.breakpoints = [0, 1]
        expect(() => structuredClone(song.trackModifiers.map(modifier => modifier.serialize()))).not.toThrow()
        expect(() => structuredClone(song.breakpoints)).not.toThrow()
        //`tracks` is plain for a different reason - a private array behind a getter
        expect(() => structuredClone(song.tracks.map(track => track.color))).not.toThrow()
        //vsrg-composer/+page.svelte's `snapPoints` and `renderableNotes` are the other two arrays on
        //that draw path (the renderer walks both per draw) and are `$state.raw` for the same reason.
        //They are component-local, so they cannot be reached from here - their rule lives at their
        //declarations, as Composer.svelte's `selectedColumns` does.
    })
})

/**
 * The identity trap, as a test rather than as a comment.
 *
 * Every signal in the tables above is a whole-value signal, so a consumer only learns that
 * SOMETHING changed - it has to re-read to find out what. An `$effect` does that by construction.
 * A `$derived` does not: Svelte skips downstream updates when a derived's recomputed value is
 * referentially identical to the previous one, and `{@const}` and `{#each}` item bindings behave
 * the same way (both are identity-compared values). So a derived holding a VsrgTrack read out of
 * the song swallows every structure bump, silently, while the song updates underneath it.
 *
 * That is what VsrgTop.svelte's `currentTrack` was until phase 2, and what Composer.svelte's
 * `popoverNote` was until phase 1's step 4. Both worked only because the clone-to-notify they were
 * written against handed back a new object every time.
 */
describe('a derived only propagates when its VALUE changes', () => {
    it('an object read out of the song does not, a primitive read out of it does', async () => {
        const song = makeVsrgSong()
        const trackObject = observeDerived(() => song.tracks[0])
        const trackColor = observeDerived(() => song.tracks[0].color)
        const trackList = observeDerived(() => song.tracks.map(track => track.color))
        try {
            await flushEffects()
            const baseline = [trackObject.runs(), trackColor.runs(), trackList.runs()]
            //exactly what VsrgTrackSettings + onTrackChange do: mutate the track in place, then
            //hand the same reference back to the song
            song.setTrack(0, song.tracks[0].set({color: '#123456'}))
            await flushEffects()
            expect(trackObject.runs()).toBe(baseline[0])
            expect(trackColor.runs()).toBe(baseline[1] + 1)
            expect(trackList.runs()).toBe(baseline[2] + 1)
        } finally {
            trackObject.dispose()
            trackColor.dispose()
            trackList.dispose()
        }
    })
})

/**
 * `structureVersion`, on both classes, hand-written because NOTHING ELSE IN THIS FILE CAN SEE IT.
 * It is a getter with no setter, so `reactiveFieldNames` (which keeps get+set pairs) skips it, and
 * its descriptor's `value` is undefined rather than a function, so `instanceCallables` skips it too
 * - it would ship through both reflective completeness gates untouched. The rows below are what a
 * row in CASES/READERS would have been.
 *
 * What it is for: the two renderers DIFF the graph version rather than merely subscribing to it
 * (`previous.structureVersion !== next.structureVersion`). The `columns`/`tracks` getter cannot
 * serve that - phases 1 and 2 made the array identity STABLE within a song, which is what the last
 * case here pins from the other side.
 */
describe('structureVersion is the graph version as a value, on both classes', () => {
    it('ComposedSong: reading it publishes nothing and touches no column counters', async () => {
        const song = makeSong()
        const versions = new Map(song.columns.map(column => [column, column.version]))
        const fired = await firedSignals(song, SIGNALS, SIGNAL_READERS, () => {
            void song.structureVersion
        })
        expect(fired).toEqual([])
        song.columns.forEach(column => expect(column.version).toBe(versions.get(column)))
    })

    it('ComposedSong: it moves on a graph mutation and stands still on a scalar one', async () => {
        const song = makeSong()
        const before = song.structureVersion
        song.selected = 3
        song.bpm = 90
        expect(song.structureVersion).toBe(before)
        song.addNoteAt(7, 0, idOf(2))
        expect(song.structureVersion).not.toBe(before)
    })

    it('ComposedSong: reading it is a subscription, exactly like reading `columns`', async () => {
        const song = makeSong()
        const observer = observeSignal(() => song.structureVersion)
        try {
            await flushEffects()
            const baseline = observer.runs()
            song.addNoteAt(8, 0, idOf(3))
            await flushEffects()
            expect(observer.runs()).toBe(baseline + 1)
        } finally {
            observer.dispose()
        }
    })

    it('VsrgSong: the twin behaves the same - it moves on a graph mutation, not on a scalar one', () => {
        const song = makeVsrgSong()
        const before = song.structureVersion
        song.set({bpm: 90})
        expect(song.structureVersion).toBe(before)
        song.createHitObjectInTrack(0, 4000, 0)
        expect(song.structureVersion).not.toBe(before)
    })

    it('it is only comparable WITHIN one song - two instances both start at 0', () => {
        //the reason ComposerRenderer pairs the version with the `columns` ARRAY
        //IDENTITY: a song swap (load, new song, MIDI import) installs a graph whose version is 0,
        //so a version-only diff of an untouched song replacing an untouched song reports "nothing
        //changed". VsrgSong's version is captured by VsrgSongRenderState too, but nothing over
        //there diffs it - see that file's `structure` docstring.
        const a = new ComposedSong('a')
        const b = new ComposedSong('b')
        expect(a.structureVersion).toBe(0)
        expect(b.structureVersion).toBe(0)
        expect(a.columns).not.toBe(b.columns)
        //...and the array identity is what does not see an edit made IN PLACE, which is what the
        //version is there for. (Other mutators install a new array - restoreColumns, deleteColumns -
        //so the identity moving is not evidence of a swap either; each half covers what the other
        //cannot.)
        const columns = a.columns
        a.addNoteAt(0, 0, idOf(0))
        expect(a.columns).toBe(columns)
        expect(a.structureVersion).not.toBe(0)
        a.deleteColumns([1])
        expect(a.columns).not.toBe(columns)
    })
})
