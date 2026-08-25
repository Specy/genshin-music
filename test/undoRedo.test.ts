import {describe, expect, it} from 'vitest'
import {
    ComposedSong,
    InstrumentData,
    INSTRUMENTS,
    INSTRUMENTS_DATA,
    NoteColumn,
    TEMPO_CHANGERS,
} from './imports'
import {instanceCallables} from './reflect'

/**
 * THE NO-DATA-LOSS GATE for the delta undo recorded inside ComposedSong (ADR-0013, design §8.1-2).
 * One row per recorded mutator, driven through the same four beats:
 *
 *      do → undo (= pre) → redo (= post) → undo (= pre)
 *
 * compared through serialize() deep-equality. The FOURTH beat is the one that earns the table its
 * length: a delta holding a detached object BY REFERENCE (ADR-0013's rule) that redo mutated
 * instead of re-installing passes the first three and fails this one, and nothing else in the suite
 * would see it. The `not.toEqual` on the first beat is the other half - a row whose op quietly
 * changed nothing would otherwise pass all four vacuously and count as coverage.
 *
 * Structural, not anecdotal: the bottom of this file enumerates the class's callable surface the
 * way test/reactivePublish.test.ts does, subtracts four DECLARED lists (readers, the writers that
 * deliberately record nothing, the undo machinery itself, TS-private steps) and FAILS when what is
 * left has no row here. That is the answer to "no accidental data loss in any kind of action": a
 * new mutator cannot ship un-undoable, and no heuristic decides which is which.
 *
 * The no-op table below it is the mirror image and just as load-bearing. A call that changed
 * nothing must record NOTHING - not an empty Step, not a Step of null-writes - because UndoHistory
 * clears the redo branch on a Step's FIRST DELTA, so one stray record turns a settings slider
 * re-emitting its own value into a lost redo branch and a Ctrl+Z that eats a press. Publishing
 * coarsely is allowed on those paths (several of them still touch every column); recording is not.
 *
 * Companions: test/undoHistory.test.ts (the container's own lifecycle - groups, cap, savepoint),
 * test/undoRedoCore.test.ts (smoke cover per delta family), and reactivePublish.test.ts's undo/redo
 * rows (what a Step's application publishes).
 */

/** Note Number of a button on the game's default instrument, at the fixture's Basepoint of C. */
function idOf(button: number): number {
    return INSTRUMENTS_DATA[INSTRUMENTS[0]].notes[button].midi
}

/**
 * A Note Number no instrument in either game has a button for - two octaves below the lowest one
 * of the default instrument. That makes the note that carries it a STRANDED NOTE: audible to
 * nothing, drawn dimmed, and skipped by every rewrite that works in Button space. It is in the
 * fixture because the rewrites treat it as an EXCEPTION (rewriteForSwap passes it through
 * untouched, moveNotesBy drops it off the grid instead of moving it), and an exception with no
 * fixture coverage is where an un-undoable write hides.
 */
const STRANDED_ID = idOf(0) - 24

/** A column nothing in the table edits - where the no-op driver's seed edit goes. */
const SEED_COLUMN = 90

/**
 * The rich fixture the whole table runs against: three tracks (one overriding the song's
 * Basepoint, one presentation-only), spans that cross columns, two tempo changers, three
 * breakpoints, a stranded note, a non-default bpm/reverb/name and a cursor away from 0.
 *
 * Built BEFORE attachHistory(), which is both convenient and the point: construction is the
 * "no history ⇒ no recording" path (ADR-0013), so nothing here can leave a Step for beat one to
 * mistake for the op under test.
 */
function makeSong(): ComposedSong {
    const song = new ComposedSong('undo table', [INSTRUMENTS[0], INSTRUMENTS[1], INSTRUMENTS[0]])
    song.bpm = 140
    song.reverb = true
    //a per-track Basepoint OVERRIDE: a song-scope change must leave this track's notes where they
    //are, so undoing one has to put back an interval that was applied to some notes and not others
    song.setInstrument(1, new InstrumentData({name: INSTRUMENTS[1], pitch: 'D', alias: 'over', volume: 80}))
    //roster fields that are not the instrument name: they ride the roster array refs, so a row that
    //replaces the roster must bring them back too
    song.setInstrument(2, new InstrumentData({name: INSTRUMENTS[0], icon: 'line', muted: true, solo: true}))
    song.addNoteAt(0, 0, idOf(0), 3)
    song.addNoteAt(0, 1, idOf(4))
    song.addNoteAt(2, 2, idOf(2), 2)
    song.addNoteAt(4, 1, idOf(6), 2)
    song.addNoteAt(7, 0, idOf(1))
    song.addNoteAt(9, 0, STRANDED_ID)
    song.setTempoChangerAt(1, TEMPO_CHANGERS[1])
    song.setTempoChangerAt(3, TEMPO_CHANGERS[2])
    song.breakpoints = [0, 3, 8]
    song.selected = 2
    return song
}

/**
 * The three invariants every row re-checks at EVERY beat, because a serialize-equality that
 * compares two equally-broken songs proves nothing. They are the ones a history walk can plausibly
 * break: undo re-inserts columns (so `selected` and the breakpoints' column addresses can go
 * stale) and re-installs notes and spans (so the no-overlap rule the whole span model rests on can
 * come back violated).
 */
function assertInvariants(song: ComposedSong) {
    //`selected` is never part of a Step - it is cursor state - so #applyStep re-clamps it instead
    expect(song.columns.length).toBeGreaterThan(0)
    expect(song.selected).toBeGreaterThanOrEqual(0)
    expect(song.selected).toBeLessThan(song.columns.length)
    //a breakpoint is a column INDEX: one past the end reaches serialize() and then IndexedDB
    song.breakpoints.forEach(breakpoint => {
        expect(Number.isInteger(breakpoint)).toBe(true)
        expect(breakpoint).toBeGreaterThanOrEqual(0)
        expect(breakpoint).toBeLessThan(song.columns.length)
    })
    //no two notes of one (track, id) may overlap in time: the second would be unreachable through
    //findNote and would double-trigger at playback. Spans are the axis, so the scan is per key.
    const openUntil = new Map<string, number>()
    song.columns.forEach((column, columnIndex) => {
        column.notes.forEach(note => {
            expect(Number.isInteger(note.span)).toBe(true)
            expect(note.span).toBeGreaterThanOrEqual(1)
            const key = `${note.trackIndex}-${note.id}`
            const previousEnd = openUntil.get(key)
            if (previousEnd !== undefined) expect(previousEnd).toBeLessThanOrEqual(columnIndex)
            openUntil.set(key, columnIndex + note.span)
        })
    })
}

/**
 * The live ARRAY ORDER of every column's notes, which serialize() cannot see: it re-groups per
 * track and sorts by id, so a note re-inserted at the end of its column instead of where it was
 * serializes identically. That is what noteRemoved's `indexInColumn` is for, and this is the only
 * thing in the suite that can tell whether it was honoured.
 */
function noteOrder(song: ComposedSong): string[][] {
    return song.columns.map(column => column.notes.map(note => `${note.trackIndex}:${note.id}:${note.span}`))
}

interface Row {
    /** a real method name on ComposedSong - cross-checked against the reflected surface below */
    name: string
    /** disambiguator when one mutator needs several rows (a branch each, a no-op path) */
    label?: string
    /** state the row needs that is not the op under test - runs BEFORE the history is attached, so
     *  it can never be mistaken for the Step being walked */
    setup?: (song: ComposedSong) => void
    run: (song: ComposedSong) => void | Promise<void>
    /**
     * The op REPAIRS an invalid graph (validateBreakpoints, normalizeSpans), so its setup has to
     * build one - and undo's whole job is to put that invalid state back. The invariants are
     * therefore asserted on the post-op beats only for these rows, which is stated per row rather
     * than softened for the table: everywhere else, an undo landing on a broken graph is a bug.
     */
    repairsAnInvalidGraph?: boolean
}

function rowName(row: Row): string {
    return row.label ? `${row.name} (${row.label})` : row.name
}

async function roundTrip(row: Row) {
    const song = makeSong()
    row.setup?.(song)
    const history = song.attachHistory()
    const before = song.serialize()
    const orderBefore = noteOrder(song)
    await row.run(song)
    const after = song.serialize()
    const orderAfter = noteOrder(song)
    //a row that changed nothing would satisfy every assertion below without testing anything
    expect(after).not.toEqual(before)
    expect(history.canUndo).toBe(true)
    assertInvariants(song)
    //see the flag: an undone repair pass is expected to land back on the graph it repaired
    const assertUndone = row.repairsAnInvalidGraph ? () => {} : assertInvariants

    expect(song.undo()).not.toBeNull()
    expect(song.serialize()).toEqual(before)
    expect(noteOrder(song)).toEqual(orderBefore)
    assertUndone(song)

    expect(song.redo()).not.toBeNull()
    expect(song.serialize()).toEqual(after)
    expect(noteOrder(song)).toEqual(orderAfter)
    assertInvariants(song)

    //the beat that catches a SINGLE-USE delta: one whose by-reference payload redo consumed
    expect(song.undo()).not.toBeNull()
    expect(song.serialize()).toEqual(before)
    expect(noteOrder(song)).toEqual(orderBefore)
    assertUndone(song)

    //ONE public mutator = ONE Undo Step: everything it did internally (nested mutators included)
    //folded into the Step just undone, so there is nothing behind it
    expect(song.undo()).toBeNull()
}

/**
 * The no-op driver. Seeds a landed Step and then undoes it, so the history sits at "nothing to
 * undo, one thing to redo" - a state in which BOTH failure modes are visible: a Step recorded by
 * the call flips canUndo, and a single stray delta kills the redo branch (UndoHistory clears it on
 * a Step's first delta) even if the Step itself is later discarded as empty.
 */
async function noOp(row: Row) {
    const song = makeSong()
    row.setup?.(song)
    const history = song.attachHistory()
    song.addNoteAt(SEED_COLUMN, 0, idOf(3))
    song.undo()
    const before = song.serialize()
    const orderBefore = noteOrder(song)
    await row.run(song)
    expect(song.serialize()).toEqual(before)
    expect(noteOrder(song)).toEqual(orderBefore)
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(true)
    expect(song.undo()).toBeNull()
    assertInvariants(song)
}

/** Clipboard content, as copyColumns hands it over - clones, never the live columns. */
function copied(song: ComposedSong, columns: number[]): NoteColumn[] {
    return song.copyColumns(columns, 'all')
}

const ROUND_TRIPS: Row[] = [
    // ---- leaf note edits -------------------------------------------------------------------
    {name: 'addNoteAt', run: song => void song.addNoteAt(5, 0, idOf(3), 2)},
    {name: 'removeNoteAt', run: song => song.removeNoteAt(0, 0, idOf(0))},
    {
        name: 'removeNoteAt',
        //the note the class's own passes cannot see in Button space, removed by identity anyway
        label: 'a stranded note',
        run: song => song.removeNoteAt(9, 0, STRANDED_ID),
    },
    {name: 'setNoteSpan', label: 'grows', run: song => void song.setNoteSpan(7, 0, idOf(1), 4)},
    {name: 'setNoteSpan', label: 'shrinks', run: song => void song.setNoteSpan(0, 0, idOf(0), 1)},
    {
        name: 'setNoteSpan',
        //the request is clamped to maxSpanAt, so what undo has to restore is the CLAMPED span
        label: 'clamped to the next same-(track, id) note',
        setup: song => void song.addNoteAt(3, 0, idOf(1)),
        run: song => void song.setNoteSpan(7, 0, idOf(1), 99),
    },
    {name: 'setTempoChangerAt', label: 'one column', run: song => song.setTempoChangerAt(5, TEMPO_CHANGERS[3])},
    {
        name: 'setTempoChangerAt',
        //a tools selection, part of which is already on that changer: the skipped columns must not
        //come back with a tempo they never had
        label: 'a selection, partly already there',
        run: song => song.setTempoChangerAt([1, 3, 5, 500], TEMPO_CHANGERS[2]),
    },
    // ---- bulk / structural -----------------------------------------------------------------
    {
        name: 'normalizeSpans',
        //a span overhanging the end of the song - only this pass clamps it, and only from a
        //fixture that construction wrote directly
        setup: song => void song.addNoteAt(95, 0, idOf(5), 40),
        run: song => song.normalizeSpans(),
        repairsAnInvalidGraph: true,
    },
    {name: 'addColumns', label: 'at the end', run: song => song.addColumns(3, 'end')},
    {
        name: 'addColumns',
        //the insertion point falls INSIDE the span at column 0, which stretches by the amount:
        //two delta families (columnsInserted + noteFieldChanged) in one Step
        label: 'mid-span - the crossed note stretches',
        run: song => song.addColumns(2, 0),
    },
    {
        name: 'removeColumns',
        //folds validateBreakpoints + normalizeSpans into its own Step, and takes a breakpoint with it
        run: song => song.removeColumns(3, 1),
    },
    {name: 'deleteColumns', label: 'a scattered selection', run: song => void song.deleteColumns([0, 2, 5, 8])},
    {
        name: 'deleteColumns',
        //the emptying branch: the whole-array filter's recast record, plus the nested
        //addColumns(12, 0) that refills the song, both folded into one Step
        label: 'empties the song',
        run: song => void song.deleteColumns(song.columns.map((_, i) => i)),
    },
    {name: 'eraseColumns', label: 'all layers', run: song => void song.eraseColumns([0, 2, 4], 'all')},
    {name: 'eraseColumns', label: 'one layer', run: song => void song.eraseColumns([0, 4], 1)},
    {
        name: 'pasteColumns',
        label: 'inserting new columns',
        run: async song => {
            const clipboard = copied(song, [0, 1, 2])
            song.selected = 6
            await song.pasteColumns(clipboard, false, song.trackPitches())
        },
    },
    {
        name: 'pasteColumns',
        //the merge branch: notes land in columns that already exist, some colliding (span kept as
        //the longest) and some added
        label: 'merging into the columns already there',
        run: async song => {
            const clipboard = copied(song, [0, 4])
            song.selected = 0
            await song.pasteColumns(clipboard, true, song.trackPitches())
        },
    },
    {
        name: 'pasteLayer',
        //every note of the clipboard lands on ONE layer, restated at that layer's Basepoint
        run: song => {
            const clipboard = copied(song, [0, 4])
            song.selected = 10
            song.pasteLayer(clipboard, false, 1, song.trackPitches())
        },
    },
    {name: 'moveNotesBy', label: 'all layers', run: song => song.moveNotesBy([0, 2], -1, 'all')},
    {
        name: 'moveNotesBy',
        //column 9 holds the stranded note: on one layer it is REMOVED (pushed off the grid) rather
        //than rewritten, so the Step carries a noteRemoved whose object undo must put back
        label: 'one layer, a note pushed off the grid',
        run: song => song.moveNotesBy([0, 9], 1, 0),
    },
    {name: 'switchLayer', run: song => song.switchLayer(100, 0, 1, 0)},
    {
        //the collision branch: the destination already holds that (track, id), so the longest span
        //wins and the SOURCE note is deleted. A merge is where a delta scheme loses data if the
        //deleted note is not carried by reference, and it is order-sensitive - the span write and
        //the removal have to come back out in the mirror order
        name: 'switchLayer',
        label: 'colliding notes merge, longest span wins',
        setup: song => void song.addNoteAt(0, 1, idOf(0)),
        run: song => song.switchLayer(100, 0, 1, 0),
    },
    {name: 'swapLayer', run: song => song.swapLayer(100, 0, 0, 1)},
    {
        name: 'swapTracks',
        //notes AND roster in ONE Step - the pair the composer used to call as two
        run: song => song.swapTracks(0, 1),
    },
    // ---- roster ----------------------------------------------------------------------------
    {name: 'addInstrument', run: song => song.addInstrument(INSTRUMENTS[1])},
    {
        name: 'removeInstrument',
        //clears the layer's notes AND re-indexes every track above it: undo has to put both back,
        //and the re-index is what makes a per-note record the only honest form
        run: song => song.removeInstrument(1),
    },
    {
        name: 'mergeTrackInto',
        //retarget + merge + re-index + roster shrink, one Step
        run: song => song.mergeTrackInto(1, 0),
    },
    {
        name: 'mergeTrackInto',
        //...with a real collision in it, so #mergeTrackDuplicates DELETES a note (longest span
        //kept) and normalizeSpans then runs on top of the kept span. The whole interleaving has to
        //invert, which is the reverse replay's actual claim
        label: 'colliding notes merge, longest span wins',
        setup: song => void song.addNoteAt(0, 1, idOf(0)),
        run: song => song.mergeTrackInto(1, 0),
    },
    {
        name: 'setInstrument',
        //a presentation-only edit: the roster array alone, no note moves at all
        label: 'same instrument and Basepoint',
        run: song => song.setInstrument(0, new InstrumentData({name: INSTRUMENTS[0], icon: 'border', alias: 'lead'})),
    },
    {
        name: 'setInstrument',
        //ADR-0007: a swap is a NOTE edit through nominal correspondence, and it is NOT injective -
        //the merge it can trigger deletes notes, which is the data loss this whole table exists for
        label: 'swapped instrument rewrites the track',
        run: song => song.setInstrument(0, new InstrumentData({name: INSTRUMENTS[1]})),
    },
    {
        name: 'setInstrument',
        label: 'Basepoint override moves the track',
        run: song => song.setInstrument(0, new InstrumentData({name: INSTRUMENTS[0], pitch: 'G'})),
    },
    {
        name: 'setInstrument',
        //clearing an override back to the song's Basepoint is the same call, in the other direction
        label: 'the override cleared back to the song Basepoint',
        run: song => song.setInstrument(1, new InstrumentData({name: INSTRUMENTS[1], pitch: ''})),
    },
    {name: 'swapInstruments', run: song => song.swapInstruments(0, 1)},
    {
        name: 'ensureInstruments',
        //a note on a track the roster has no slot for, written straight into the graph so the
        //fixture itself records nothing
        setup: song => void song.columns[1].addNote(4, idOf(3)),
        run: song => song.ensureInstruments(),
    },
    {name: 'changeBasepoint', label: 'song scope', run: song => song.changeBasepoint('song', 'E')},
    {
        name: 'changeBasepoint',
        //the NOTE half alone (the roster entry is setInstrument's to install)
        label: 'one track',
        run: song => song.changeBasepoint(1, 'F'),
    },
    // ---- breakpoints and scalars -------------------------------------------------------------
    {name: 'toggleBreakpoint', label: 'adds one', run: song => song.toggleBreakpoint(7)},
    {name: 'toggleBreakpoint', label: 'removes one', run: song => song.toggleBreakpoint(3)},
    {
        name: 'validateBreakpoints',
        setup: song => {
            song.breakpoints = [0, 3, 8, 4000]
        },
        run: song => song.validateBreakpoints(),
        repairsAnInvalidGraph: true,
    },
    {name: 'setBpm', run: song => song.setBpm(90)},
    {name: 'setReverb', run: song => song.setReverb(false)},
    {name: 'rename', run: song => song.rename('renamed')},
]

/**
 * Documented no-op paths - "a call that changed nothing publishes nothing", extended to recording.
 * Most are the `publishes: []` rows of test/reactivePublish.test.ts read from the other side; the
 * rest (an amount of 0, an empty selection, a re-write of the value already there) publish coarsely
 * and still must not record.
 */
const NO_OPS: Row[] = [
    {name: 'removeNoteAt', label: 'no such note', run: song => song.removeNoteAt(50, 0, idOf(0))},
    {name: 'setNoteSpan', label: 'no such note', run: song => void song.setNoteSpan(50, 0, idOf(0), 3)},
    {
        name: 'setNoteSpan',
        //the Duration slider re-emitting the span the note already has
        label: 'the span it already has',
        run: song => void song.setNoteSpan(0, 0, idOf(0), 3),
    },
    {name: 'setTempoChangerAt', label: 'already that changer', run: song => song.setTempoChangerAt(1, TEMPO_CHANGERS[1])},
    {name: 'setTempoChangerAt', label: 'no such column', run: song => song.setTempoChangerAt([500], TEMPO_CHANGERS[2])},
    {name: 'normalizeSpans', label: 'the graph is already valid', run: song => song.normalizeSpans()},
    {name: 'addColumns', label: 'none to add', run: song => song.addColumns(0, 'end')},
    {name: 'removeColumns', label: 'none to remove', run: song => song.removeColumns(0, 5)},
    {
        name: 'deleteColumns',
        //it still clamps the cursor, which is deliberately not a Step - so serialize() (which does
        //not carry `selected`) is unchanged and nothing is recorded
        label: 'no such column',
        run: song => void song.deleteColumns([500]),
    },
    {name: 'eraseColumns', label: 'a selection with no notes in it', run: song => void song.eraseColumns([50, 51], 'all')},
    {name: 'eraseColumns', label: 'a layer with no notes in the selection', run: song => void song.eraseColumns([0, 2], 4)},
    {name: 'pasteColumns', label: 'an empty clipboard', run: song => song.pasteColumns([], false)},
    {name: 'pasteLayer', label: 'an empty clipboard', run: song => song.pasteLayer([], false, 0)},
    {name: 'moveNotesBy', label: 'an empty selection', run: song => song.moveNotesBy([], 1, 'all')},
    {name: 'switchLayer', label: 'a layer with no notes', run: song => song.switchLayer(100, 0, 5, 0)},
    {name: 'swapLayer', label: 'two layers with no notes', run: song => song.swapLayer(100, 0, 4, 5)},
    {name: 'swapInstruments', label: 'no such layer', run: song => song.swapInstruments(0, 9)},
    {
        name: 'setInstrument',
        label: 'no such layer',
        run: song => song.setInstrument(99, new InstrumentData({name: INSTRUMENTS[0]})),
    },
    {name: 'ensureInstruments', label: 'the roster is already big enough', run: song => song.ensureInstruments()},
    {name: 'mergeTrackInto', label: 'a layer into itself', run: song => song.mergeTrackInto(1, 1)},
    {name: 'mergeTrackInto', label: 'no such layer', run: song => song.mergeTrackInto(0, 9)},
    {name: 'changeBasepoint', label: 'no interval', run: song => song.changeBasepoint('song', 'C')},
    {name: 'changeBasepoint', label: 'a scope with no notes in it', run: song => song.changeBasepoint(5, 'D')},
    {name: 'toggleBreakpoint', label: 'past the end of the song', run: song => song.toggleBreakpoint(500)},
    {name: 'toggleBreakpoint', label: 'not a column index at all', run: song => song.toggleBreakpoint(-1)},
    {name: 'validateBreakpoints', label: 'nothing to drop', run: song => song.validateBreakpoints()},
    {name: 'setBpm', label: 'the bpm it already has', run: song => song.setBpm(140)},
    {name: 'setReverb', label: 'the value it already has', run: song => song.setReverb(true)},
    {name: 'rename', label: 'the name it already has', run: song => song.rename('undo table')},
]

/**
 * Reads. They are subtracted from the surface below rather than given rows: a method that changes
 * nothing has nothing to undo, and listing them BY NAME (instead of by a "names starting with get
 * or to are readers" heuristic) is what makes adding one a moment of thought rather than a silent
 * exemption.
 */
const READ_ONLY: string[] = [
    'serialize',
    'toRecordedSong',
    'toComposedSong',
    'toMidi',
    'clone',
    'copyColumns',
    'trackPitches',
    'toOtherGame',
    'countStrandedNotes',
    'getSpanCovering',
    'maxSpanAt',
    //a read that fills a private cache on the way through (ADR-0008) - no song state moves
    'columnsDurationMs',
]

/**
 * Writers that record NOTHING, deliberately (ADR-0013), each for a stated reason at its own
 * declaration: both are construction paths, and they publish nothing either, so there is no song
 * anyone is watching and no history attached to record into.
 */
const NOT_RECORDED: string[] = ['initColumnsForConstruction', 'appendColumnsForConstruction']

/** The machinery itself. Every row above exercises undo/redo; attachHistory installs the container. */
const MACHINERY: string[] = ['attachHistory', 'undo', 'redo']

/**
 * TS-`private` steps, reachable only through a public mutator and covered through it. `private` is
 * erased at runtime, so the reflection below still sees them; `#`-private members are genuinely
 * invisible and need no entry.
 */
const INTERNAL: string[] = [
    'adjustSpansForInsertedColumns',
    'adjustSpansForRemovedColumns',
]

describe('every recorded mutator survives do → undo → redo → undo', () => {
    for (const row of ROUND_TRIPS) {
        it(rowName(row), () => roundTrip(row))
    }
})

describe('a call that changed nothing records nothing', () => {
    for (const row of NO_OPS) {
        it(rowName(row), () => noOp(row))
    }
})

describe('the round-trip table cannot be escaped', () => {
    it('covers every mutator on ComposedSong', () => {
        //instanceCallables, not the statics: a static has no live song to undo. test/reflect.ts's
        //header carries the rules the walk follows (reactivePublish.test.ts uses the same one).
        const surface = instanceCallables(new ComposedSong('surface'))
        const declared = new Set([...READ_ONLY, ...NOT_RECORDED, ...MACHINERY, ...INTERNAL])
        const covered = new Set(ROUND_TRIPS.map(row => row.name))
        //a NEW mutator lands here until it has a round-trip row (or is declared un-undoable above)
        expect(surface.filter(name => !declared.has(name) && !covered.has(name))).toEqual([])
        //a renamed or deleted method leaves a stale row or a stale exemption, which lands here
        const claimed = [...new Set([...declared, ...covered, ...NO_OPS.map(row => row.name)])]
        expect(claimed.filter(name => !surface.includes(name)).sort()).toEqual([])
        //a no-op path is never the ONLY coverage a mutator gets: it asserts the absence of a Step,
        //so on its own it would pass for a mutator that records nothing at all
        expect(NO_OPS.map(row => row.name).filter(name => !covered.has(name))).toEqual([])
    })

    it('gives every declared exemption a reason to exist', () => {
        //the four lists are disjoint: a name in two of them is a rule that was written twice and
        //can be changed in one place
        const all = [...READ_ONLY, ...NOT_RECORDED, ...MACHINERY, ...INTERNAL]
        expect(all.length).toBe(new Set(all).size)
    })
})

describe('the fixture', () => {
    it('is the rich song the table claims it is', () => {
        const song = makeSong()
        //multi-track, with a per-track Basepoint override that a song-scope change must not move
        expect(song.instruments.length).toBe(3)
        expect(song.instruments[1].pitch).toBe('D')
        expect(song.trackPitches()).toEqual(['C', 'D', 'C'])
        //spans crossing columns, tempo changers, breakpoints, a cursor away from 0
        expect(song.columns[0].notes.some(note => note.span > 1)).toBe(true)
        expect(song.columns.filter(column => column.tempoChanger !== 0).length).toBe(2)
        expect(song.breakpoints).toEqual([0, 3, 8])
        expect(song.selected).toBe(2)
        //...and a stranded note, which is only a fixture of an EXCEPTION while it really is one
        expect(song.countStrandedNotes()).toBeGreaterThan(0)
        assertInvariants(song)
    })

    it('attaches no history while it is being built', () => {
        //the construction path of ADR-0013: everything makeSong() does is unrecorded by
        //construction, which is what lets beat one attribute the whole Step to the row's op
        const song = makeSong()
        expect(song.history).toBeNull()
        expect(song.undo()).toBeNull()
    })
})
