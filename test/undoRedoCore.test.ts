import {describe, expect, it} from 'vitest'
import {
    ComposedSong,
    InstrumentData,
    INSTRUMENTS,
    INSTRUMENTS_DATA,
    TEMPO_CHANGERS,
} from './imports'

/**
 * SMOKE COVER for the delta undo recorded inside ComposedSong (ADR-0013, spec §4). Deliberately
 * NOT the exhaustive per-mutator table spec §8.1 asks for - that one enumerates the class's
 * callable surface and fails when a mutator lacks a row, and it lives in its own file. This one
 * pins the SHAPE of the guarantee across a representative mutator from each delta family, so a
 * regression in the machinery (an unrecorded write site, a single-use delta, a Step that did not
 * fold) is caught here rather than in a fuzz seed nobody can read.
 *
 * The assertion is always the same four-beat walk: do → undo (= pre) → redo (= post) → undo (=
 * pre), compared through serialize(). The SECOND undo is the one that earns its place: a delta
 * holding a by-reference object that redo mutated instead of restoring passes the first three
 * beats and fails the fourth.
 */

/** Note Number of a button on the game's default instrument, at the fixture's Basepoint of C. */
function idOf(button: number): number {
    return INSTRUMENTS_DATA[INSTRUMENTS[0]].notes[button].midi
}

/**
 * A song with something of every kind in it: two tracks, one of them overriding the song's
 * Basepoint (so a song-level change has notes that must NOT follow it), spans crossing columns,
 * two tempo changers and two breakpoints. Built BEFORE any history is attached, which is also the
 * "no history ⇒ no recording" path every construction site takes.
 */
function makeSong(): ComposedSong {
    const song = new ComposedSong('undo core', [INSTRUMENTS[0], INSTRUMENTS[1]])
    song.bpm = 160
    song.reverb = true
    const overriding = new InstrumentData({name: INSTRUMENTS[1], pitch: 'D'})
    song.setInstrument(1, overriding)
    song.addNoteAt(0, 0, idOf(0), 3)
    song.addNoteAt(0, 1, idOf(4))
    song.addNoteAt(2, 0, idOf(2))
    song.addNoteAt(4, 1, idOf(6), 2)
    song.addNoteAt(7, 0, idOf(1))
    song.setTempoChangerAt(1, TEMPO_CHANGERS[1])
    song.setTempoChangerAt(3, TEMPO_CHANGERS[2])
    song.breakpoints = [0, 3]
    song.selected = 2
    return song
}

interface RoundTrip {
    name: string
    /** state the case needs that must not itself be recorded - runs before the history is attached */
    setup?: (song: ComposedSong) => void
    run: (song: ComposedSong) => void | Promise<void>
}

async function roundTrip(testCase: RoundTrip) {
    const song = makeSong()
    testCase.setup?.(song)
    song.attachHistory()
    const before = song.serialize()
    await testCase.run(song)
    const after = song.serialize()
    //a row whose op changes nothing would pass every assertion below vacuously
    expect(after).not.toEqual(before)
    expect(song.undo()).not.toBeNull()
    expect(song.serialize()).toEqual(before)
    expect(song.redo()).not.toBeNull()
    expect(song.serialize()).toEqual(after)
    expect(song.undo()).not.toBeNull()
    expect(song.serialize()).toEqual(before)
    //one public mutator is ONE Step: everything it did internally folded into the Step just undone
    expect(song.undo()).toBeNull()
}

const CASES: RoundTrip[] = [
    {name: 'addNoteAt', run: song => void song.addNoteAt(5, 0, idOf(3), 2)},
    {name: 'removeNoteAt', run: song => song.removeNoteAt(0, 0, idOf(0))},
    {name: 'setNoteSpan (grow)', run: song => void song.setNoteSpan(2, 0, idOf(2), 4)},
    {name: 'setNoteSpan (shrink)', run: song => void song.setNoteSpan(0, 0, idOf(0), 1)},
    {name: 'setTempoChangerAt (one column)', run: song => song.setTempoChangerAt(5, TEMPO_CHANGERS[3])},
    {name: 'setTempoChangerAt (selection)', run: song => song.setTempoChangerAt([1, 3, 5], TEMPO_CHANGERS[2])},
    {name: 'toggleBreakpoint (add)', run: song => song.toggleBreakpoint(7)},
    {name: 'toggleBreakpoint (remove)', run: song => song.toggleBreakpoint(3)},
    //inserting INSIDE a span stretches it, which is a second delta family in the same Step
    {name: 'addColumns (inside a span)', run: song => song.addColumns(2, 0)},
    {name: 'addColumns (end)', run: song => song.addColumns(3, 'end')},
    //removeColumns folds normalizeSpans + validateBreakpoints into its own Step
    {name: 'removeColumns', run: song => song.removeColumns(3, 1)},
    {name: 'deleteColumns (scattered)', run: song => void song.deleteColumns([0, 2, 5, 7])},
    //the emptying branch: the recast splice-out plus the nested addColumns(12, 0) that refills it
    {
        name: 'deleteColumns (empties the song)',
        run: song => void song.deleteColumns(song.columns.map((_, i) => i)),
    },
    {name: 'eraseColumns (all layers)', run: song => void song.eraseColumns([0, 2, 4], 'all')},
    {name: 'eraseColumns (one layer)', run: song => void song.eraseColumns([0, 4], 1)},
    {
        name: 'pasteColumns (inserting columns)',
        run: async song => {
            const copied = song.copyColumns([0, 1, 2], 'all')
            song.selected = 6
            await song.pasteColumns(copied, false, song.trackPitches())
        },
    },
    {
        name: 'pasteColumns (merging into the columns already there)',
        run: async song => {
            const copied = song.copyColumns([0, 4], 'all')
            song.selected = 8
            await song.pasteColumns(copied, true, song.trackPitches())
        },
    },
    {
        name: 'pasteLayer',
        run: song => {
            const copied = song.copyColumns([0, 4], 'all')
            song.selected = 10
            song.pasteLayer(copied, false, 0, song.trackPitches())
        },
    },
    {name: 'moveNotesBy (all layers)', run: song => song.moveNotesBy([0, 2, 4], -1, 'all')},
    {name: 'moveNotesBy (one layer)', run: song => song.moveNotesBy([0, 4], -1, 1)},
    {name: 'switchLayer', run: song => song.switchLayer(100, 0, 1, 0)},
    {name: 'swapLayer', run: song => song.swapLayer(100, 0, 0, 1)},
    //notes AND roster in one Step - the two halves the composer used to call separately
    {name: 'swapTracks', run: song => song.swapTracks(0, 1)},
    {name: 'mergeTrackInto', run: song => song.mergeTrackInto(1, 0)},
    {name: 'addInstrument', run: song => song.addInstrument(INSTRUMENTS[0])},
    {name: 'removeInstrument', run: song => song.removeInstrument(1)},
    {
        name: 'setInstrument (instrument swap rewrites the track)',
        run: song => song.setInstrument(0, new InstrumentData({name: INSTRUMENTS[1]})),
    },
    {
        name: 'setInstrument (Basepoint override moves the track)',
        run: song => song.setInstrument(0, new InstrumentData({name: INSTRUMENTS[0], pitch: 'G'})),
    },
    {name: 'changeBasepoint (song)', run: song => song.changeBasepoint('song', 'E')},
    {name: 'changeBasepoint (one track)', run: song => song.changeBasepoint(1, 'F')},
    {name: 'setBpm', run: song => song.setBpm(90)},
    {name: 'setReverb', run: song => song.setReverb(false)},
    {name: 'rename', run: song => song.rename('renamed')},
    {
        name: 'normalizeSpans',
        //a span overhanging the end of the song, which only this pass clamps
        setup: song => song.addNoteAt(95, 0, idOf(5), 40),
        run: song => song.normalizeSpans(),
    },
    {
        name: 'validateBreakpoints',
        setup: song => {
            song.breakpoints = [0, 3, 4000]
        },
        run: song => song.validateBreakpoints(),
    },
    {
        name: 'ensureInstruments',
        //a note on a track with no roster slot - written straight into the graph, so the fixture
        //itself records nothing
        setup: song => void song.columns[1].addNote(4, idOf(3)),
        run: song => song.ensureInstruments(),
    },
]

describe('every recorded mutator survives do → undo → redo → undo', () => {
    for (const testCase of CASES) {
        it(testCase.name, () => roundTrip(testCase))
    }
})

describe('recording is scoped to an attached history', () => {
    it('records nothing when no history is attached', () => {
        const song = makeSong()
        expect(song.history).toBeNull()
        song.addNoteAt(9, 0, idOf(3))
        song.setBpm(200)
        expect(song.undo()).toBeNull()
        expect(song.redo()).toBeNull()
    })

    it('does not hand a history to a clone', () => {
        const song = makeSong()
        song.attachHistory()
        expect(song.clone().history).toBeNull()
    })

    it('gives a freshly attached history nothing to undo', () => {
        const song = makeSong()
        const history = song.attachHistory()
        expect(history.canUndo).toBe(false)
        expect(history.canRedo).toBe(false)
        expect(history.isDirty).toBe(false)
    })

    it('lands no Step for a mutator that changed nothing', () => {
        const song = makeSong()
        const history = song.attachHistory()
        //every one of these hits a documented no-op path
        song.setBpm(song.bpm)
        song.rename(song.name)
        song.removeNoteAt(9, 0, idOf(0))
        song.setTempoChangerAt(1, TEMPO_CHANGERS[1])
        song.toggleBreakpoint(-1)
        song.setInstrument(99, new InstrumentData({name: INSTRUMENTS[0]}))
        song.mergeTrackInto(0, 0)
        expect(history.canUndo).toBe(false)
        expect(song.undo()).toBeNull()
    })

    it('never records the application of a Step', () => {
        const song = makeSong()
        const history = song.attachHistory()
        song.addNoteAt(9, 0, idOf(3))
        song.undo()
        //undo pushed the Step onto the redo stack and recorded no new one of its own
        expect(history.canUndo).toBe(false)
        expect(history.canRedo).toBe(true)
        song.redo()
        expect(history.canUndo).toBe(true)
        expect(history.canRedo).toBe(false)
    })
})

describe('Step scoping', () => {
    it('folds a whole explicit group into one Step', () => {
        const song = makeSong()
        const history = song.attachHistory()
        const before = song.serialize()
        history.beginGroup()
        //the Duration Hold: many setNoteSpan calls, one Undo Step
        song.setNoteSpan(0, 0, idOf(0), 4)
        song.setNoteSpan(0, 0, idOf(0), 5)
        song.setNoteSpan(0, 0, idOf(0), 2)
        history.endGroup()
        expect(song.serialize()).not.toEqual(before)
        expect(song.undo()).not.toBeNull()
        expect(song.serialize()).toEqual(before)
        expect(song.undo()).toBeNull()
    })

    it('remembers the cursor as it was when the edit was made', () => {
        const song = makeSong()
        song.attachHistory()
        song.selected = 5
        song.deleteColumns([5, 6, 7])
        //deleteColumns clamps `selected` itself; the memo is the column the edit was MADE at
        const undone = song.undo()
        expect(undone?.selected).toBe(5)
        expect(song.redo()?.selected).toBe(5)
    })

    it('restores a removed note at the position it held in its column', () => {
        const song = makeSong()
        song.attachHistory()
        //serialize() sorts each track's notes by id, so only the live array can show this
        const order = () => song.columns[0].notes.map(note => [note.trackIndex, note.id])
        const before = order()
        song.removeNoteAt(0, 0, idOf(0))
        song.undo()
        expect(order()).toEqual(before)
    })
})

describe('savepoint', () => {
    it('goes clean again when the edits are undone back to it', () => {
        const song = makeSong()
        const history = song.attachHistory()
        history.markSavepoint()
        song.addNoteAt(9, 0, idOf(3))
        expect(history.isDirty).toBe(true)
        song.undo()
        expect(history.isDirty).toBe(false)
        song.redo()
        expect(history.isDirty).toBe(true)
    })
})
