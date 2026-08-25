import {describe, expect, it} from 'vitest'
import {
    type ColumnNote,
    ComposedSong,
    InstrumentData,
    INSTRUMENTS,
    INSTRUMENTS_DATA,
    NoteColumn,
    PITCHES,
    TEMPO_CHANGERS,
    UNDO_HISTORY_CAP,
} from './imports'

/**
 * RANDOMIZED HISTORY WALKS over the delta undo recorded inside ComposedSong (ADR-0013, design
 * §8.3). The per-mutator table in test/undoRedo.test.ts proves each mutator inverts ALONE, on a
 * fixture chosen to make its own branches reachable; this file is the other half of the
 * no-data-loss guarantee, and it exists because the delta scheme's real claim is about SEQUENCES:
 * a Step inverts by replaying its primitives reversed, through the same intermediate graphs the
 * forward pass produced, holding detached notes/columns/arrays BY REFERENCE. What that can break
 * is an ordering or an aliasing between ops nobody wrote a row for - a column removed under a note
 * whose span another Step clamped, a roster array a later paste re-grew, a note re-inserted into a
 * `notes` array a merge had since replaced.
 *
 * The method: build a random song, apply ~50 random ops (some grouped into one Step, some
 * documented no-ops), remember the song's fingerprint at every history POSITION, then walk undo/
 * redo at random and demand the fingerprint of every position visited - each way, repeatedly. Then
 * do it again from INSIDE the history (undo partway, edit, which kills the redo branch), because a
 * Ctrl+Z-then-type session is where a stacked delta and the live graph are most likely to disagree.
 *
 * Everything is driven by a SEEDED PRNG and one seed per `it`, so a failure names the run that
 * produced it in its own title and re-running reproduces it exactly - no `Math.random`, ever.
 *
 * The fingerprint is serialize() PLUS the live per-column note array order, which serialize()
 * cannot see (it re-groups per track and sorts by id). That order is what noteRemoved's
 * `indexInColumn` exists for, so without it a whole primitive would be untested here.
 */

// ---------------------------------------------------------------------------------------------
// the PRNG
// ---------------------------------------------------------------------------------------------

/** mulberry32: 32 bits of state, no dependency, same stream on every machine and every run. */
function mulberry32(seed: number): () => number {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) | 0
        let t = Math.imul(state ^ (state >>> 15), 1 | state)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

class Rng {
    #next: () => number

    constructor(seed: number) {
        this.#next = mulberry32(seed)
    }

    /** Inclusive at both ends; `max < min` collapses to `min`, so a caller need not guard an empty range. */
    int(min: number, max: number): number {
        if (max <= min) return min
        return min + Math.floor(this.#next() * (max - min + 1))
    }

    chance(probability: number): boolean {
        return this.#next() < probability
    }

    pick<T>(items: readonly T[]): T {
        return items[this.int(0, items.length - 1)]
    }

    /** Up to `count` distinct indexes below `limit`, ascending - the shape a tools selection has. */
    indexes(limit: number, count: number): number[] {
        const picked = new Set<number>()
        for (let i = 0; i < count; i++) picked.add(this.int(0, limit - 1))
        return [...picked].sort((a, b) => a - b)
    }
}

// ---------------------------------------------------------------------------------------------
// the random song
// ---------------------------------------------------------------------------------------------

/** Absolute Note Numbers of the default instrument's buttons at a Basepoint of C. */
const NOTE_POOL = INSTRUMENTS_DATA[INSTRUMENTS[0]].notes.map(note => note.midi)
/** A Note Number nothing below can produce, for the "no such note" no-op paths. */
const ABSENT_ID = -9999
/** Keeps every op's index arithmetic inside a song, and the suite's runtime inside its budget. */
const MIN_COLUMNS = 8
const MAX_COLUMNS = 140
const MAX_TRACKS = 4

/**
 * Mostly buttons of the default instrument; the rest are two octaves out, which on most tracks is
 * a STRANDED NOTE. Strands are in the pool deliberately - they are the exception path of every
 * rewrite in the class (moveNotesBy drops them off the grid instead of moving them, rewriteForSwap
 * passes them through), so an op sequence without any never reaches those branches.
 */
function randomId(rng: Rng): number {
    if (rng.chance(0.12)) return rng.pick(NOTE_POOL) + (rng.chance(0.5) ? -24 : 24)
    return rng.pick(NOTE_POOL)
}

function randomTrack(song: ComposedSong, rng: Rng): number {
    return rng.int(0, song.instruments.length - 1)
}

function randomLayer(song: ComposedSong, rng: Rng): number | 'all' {
    return rng.chance(0.4) ? 'all' : randomTrack(song, rng)
}

/** Two DISTINCT layers. `from === to` is not generated: switchLayer(t, t) deletes the layer it merges. */
function twoTracks(song: ComposedSong, rng: Rng): [number, number] {
    const a = randomTrack(song, rng)
    const b = (a + rng.int(1, song.instruments.length - 1)) % song.instruments.length
    return [a, b]
}

function randomInstrument(rng: Rng): InstrumentData {
    return new InstrumentData({
        name: rng.pick(INSTRUMENTS),
        //"" is NOT an override (noteIds.effectiveTrackPitch): both directions of setInstrument's
        //Basepoint half - taking an override and clearing one - have to be reachable
        pitch: rng.chance(0.4) ? rng.pick(PITCHES) : '',
        alias: rng.chance(0.3) ? `alias-${rng.int(0, 9)}` : '',
        volume: rng.int(1, 100),
        icon: rng.pick(['border', 'circle', 'line'] as const),
        muted: rng.chance(0.2),
        solo: rng.chance(0.15),
    })
}

/**
 * addNoteAt as the composer calls it: never on top of an existing (track, id), never overlapping
 * one, span clamped to maxSpanAt. The class does not enforce any of that itself (addNoteAt's own
 * header says callers pre-check), and a fuzz that ignored it would spend its seeds proving that a
 * graph the app cannot produce survives undo.
 */
function addNote(song: ComposedSong, rng: Rng, columnIndex: number, trackIndex: number, id: number, maxSpan = 4) {
    const column = song.columns[columnIndex]
    if (column === undefined) return
    if (column.findNote(trackIndex, id) !== null) return
    if (song.getSpanCovering(columnIndex, trackIndex, id) !== null) return
    song.addNoteAt(columnIndex, trackIndex, id, Math.min(rng.int(1, maxSpan), song.maxSpanAt(columnIndex, trackIndex, id)))
}

/** Some note that really is in the song, or null - the address every leaf-edit op needs. */
function someNote(song: ComposedSong, rng: Rng): { columnIndex: number, note: ColumnNote } | null {
    const columns = song.columns
    const start = rng.int(0, columns.length - 1)
    for (let i = 0; i < columns.length; i++) {
        const columnIndex = (start + i) % columns.length
        const notes = columns[columnIndex].notes
        if (notes.length > 0) return {columnIndex, note: rng.pick(notes)}
    }
    return null
}

/**
 * The song each seed starts from: random length, roster, Basepoint (with per-track overrides),
 * notes, spans, tempo changers, breakpoints, bpm, reverb and cursor.
 *
 * Built BEFORE attachHistory(), which is the construction path of ADR-0013 and also what makes
 * position 0 of the ledger below meaningful: nothing here can leave a Step behind.
 */
function makeSong(rng: Rng): ComposedSong {
    const trackCount = rng.int(1, 3)
    const song = new ComposedSong(
        `fuzz-${rng.int(0, 9999)}`,
        Array.from({length: trackCount}, () => rng.pick(INSTRUMENTS))
    )
    song.bpm = rng.int(40, 300)
    song.reverb = rng.chance(0.4)
    song.pitch = rng.pick(PITCHES)
    song.instruments.forEach((instrument, trackIndex) => {
        if (!rng.chance(0.35)) return
        song.setInstrument(trackIndex, new InstrumentData({...instrument, pitch: rng.pick(PITCHES)}))
    })
    //the constructor lays down 100 placeholder columns
    const columns = rng.int(14, 60)
    song.removeColumns(100 - columns, columns)
    for (let columnIndex = 0; columnIndex < columns; columnIndex++) {
        for (let i = rng.int(0, 3); i > 0; i--) addNote(song, rng, columnIndex, rng.int(0, trackCount - 1), randomId(rng))
    }
    for (let i = rng.int(0, 6); i > 0; i--) song.setTempoChangerAt(rng.int(0, columns - 1), rng.pick(TEMPO_CHANGERS))
    for (let i = rng.int(0, 4); i > 0; i--) song.toggleBreakpoint(rng.int(0, columns - 1))
    song.selected = rng.int(0, columns - 1)
    //spans above were each clamped against the notes that existed WHEN they were added, so a later
    //note can sit inside an earlier one's span. Every seed starts from a valid graph.
    song.normalizeSpans()
    return song
}

// ---------------------------------------------------------------------------------------------
// the run: a song, its history, and the ledger of positions
// ---------------------------------------------------------------------------------------------

interface Run {
    seed: number
    rng: Rng
    song: ComposedSong
    history: ReturnType<ComposedSong['attachHistory']>
    /** What a copy left behind - the composer's clipboard, outliving the paste that used it. */
    clipboard: NoteColumn[]
    /** Fingerprint at every history position; [0] is the bottom, where the song was installed. */
    positions: string[]
    /** Cursor memo of the Step that LEADS to each position (null at the bottom - no Step made it). */
    memos: (number | null)[]
    /** Which of them the history is sitting at right now. */
    at: number
    /** Deltas recorded since the current batch opened - see startRun() for why this is counted. */
    recorded: number
    /** The memo the current batch's Step opened with; null until its first mutator call. */
    memo: number | null
    log: string[]
}

/**
 * The state of the song as anything outside it can observe: serialize() - everything a save
 * writes - plus the LIVE note array order per column, which serialize() flattens away (it groups
 * per track and sorts by id). A note re-inserted at the end of its column instead of at the index
 * it held serializes identically, so without the order half, `noteRemoved.indexInColumn` would be
 * untested by every seed in this file.
 */
function fingerprint(song: ComposedSong): string {
    return JSON.stringify({
        song: song.serialize(),
        order: song.columns.map(column => column.notes.map(note => `${note.trackIndex}:${note.id}:${note.span}`)),
    })
}

/**
 * EVERY assertion in this file goes through these two, and they take their message as a THUNK.
 * Both halves are about the same thing: a passing seed must touch expect() as few times as
 * possible. Building a `where()` string costs a slice and a join; constructing a vitest assertion
 * costs far more, and the walks below make one per position, per breakpoint and per note - some
 * hundred thousand per run. Calling expect() only on the failing branch is what keeps the suite
 * inside its runtime budget with 120 seeds in it rather than a dozen.
 */
function check(condition: boolean, message: () => string) {
    if (condition) return
    expect(condition, message()).toBe(true)
}

function checkSame<T>(actual: T, expected: T, message: () => string) {
    if (Object.is(actual, expected)) return
    expect(actual, message()).toBe(expected)
}

/**
 * STRING comparison first: this runs at every position of every walk of every seed, and a
 * serialize() deep-compare there is the difference between a five-second suite and a minute of
 * one. The parse below only ever runs on a failure, where a readable diff is worth any price.
 */
function expectFingerprint(actual: string, expected: string, message: () => string) {
    if (actual === expected) return
    expect(JSON.parse(actual), message()).toEqual(JSON.parse(expected))
    //equal objects, different text: a key ORDER difference, which serialize() cannot produce.
    //Failing here beats passing on a difference the diff above could not show.
    expect(actual, message()).toBe(expected)
}

/** Where a failure happened, in the terms the run was generated in - seed first, so it is re-runnable. */
function where(run: Run): string {
    return `seed ${run.seed} at position ${run.at}/${run.positions.length - 1} after [${run.log.slice(-8).join(' → ')}]`
}

function startRun(seed: number): Run {
    const rng = new Rng(seed)
    const song = makeSong(rng)
    const run: Run = {
        seed,
        rng,
        song,
        history: song.attachHistory(),
        clipboard: [],
        positions: [fingerprint(song)],
        memos: [null],
        at: 0,
        recorded: 0,
        memo: null,
        log: [],
    }
    //COUNTING THE DELTAS is the only way from outside to tell a Step that LANDED from a call that
    //changed nothing: UndoHistory discards an empty Step, and its stacks are private precisely so
    //that nothing reads them. Comparing fingerprints instead would misjudge the ops that record
    //without changing serialize() (swapping two identical tracks, swapping two equal roster
    //entries). The wrapper is an own property shadowing the prototype method, so the song's
    //`this.history.record(delta)` finds it, and it forwards to the real one untouched.
    const record = run.history.record.bind(run.history)
    run.history.record = delta => {
        run.recorded++
        record(delta)
    }
    //The CURSOR MEMO, taken from the same side. It is `selected` as the edit is made (CONTEXT.md
    //§ Undo Step) and the OUTERMOST scope owns it, so what a Step must carry is the cursor at the
    //batch's first mutator call - not at its last, and not the one deleteColumns clamped to on its
    //way through. Nothing else in the suite can see the value the song hands over.
    const beginStep = run.history.beginStep.bind(run.history)
    run.history.beginStep = (selected, label) => {
        checkSame(selected, run.song.selected, () => `${where(run)}: a Step opened at a cursor the song was not on`)
        run.memo ??= selected
        beginStep(selected, label)
    }
    return run
}

// ---------------------------------------------------------------------------------------------
// the ops
// ---------------------------------------------------------------------------------------------

interface Op {
    name: string
    /** How often it comes up, relative to the other applicable ops. */
    weight?: number
    /** False when the current song cannot host it (an empty roster to merge, a song too short to cut). */
    when?: (run: Run) => boolean
    /**
     * UNCONDITIONALLY a no-op: whatever the song looks like, this call must record nothing. Only
     * ops that return before touching the graph carry the flag - the ones that end in
     * normalizeSpans()/validateBreakpoints() can legitimately record on a graph an earlier op left
     * denormalized, and they run below as ordinary ops instead.
     */
    recordsNothing?: boolean
    run: (run: Run) => unknown
}

const OPS: Op[] = [
    // ---- leaf edits ------------------------------------------------------------------------
    {
        name: 'addNoteAt',
        weight: 6,
        run: ({song, rng}) => addNote(song, rng, rng.int(0, song.columns.length - 1), randomTrack(song, rng), randomId(rng)),
    },
    {
        name: 'addNoteAt (the same id on another track)',
        //Deliberate collision-seeding, not variety. #mergeTrackDuplicates (and switchLayer's own
        //merge, and pasteColumns') only DOES anything when two notes of one column claim the same
        //(track, id) once a rewrite has retargeted one of them - and its "longest span wins" write
        //is only observable when the note it keeps is the SHORTER one. Random ids off a 21-button
        //pool reach that state far too rarely to test it: with this op, an unrecorded merge-span
        //write fails within a handful of seeds; without it, it survived the whole suite.
        weight: 4,
        when: ({song}) => song.instruments.length > 1,
        run: ({song, rng}) => {
            const target = someNote(song, rng)
            if (!target) return
            const track = (target.note.trackIndex + rng.int(1, song.instruments.length - 1)) % song.instruments.length
            addNote(song, rng, target.columnIndex, track, target.note.id, 6)
        },
    },
    {
        name: 'removeNoteAt',
        weight: 3,
        run: ({song, rng}) => {
            const target = someNote(song, rng)
            if (target) song.removeNoteAt(target.columnIndex, target.note.trackIndex, target.note.id)
        },
    },
    {
        name: 'setNoteSpan',
        weight: 4,
        run: ({song, rng}) => {
            const target = someNote(song, rng)
            if (target) song.setNoteSpan(target.columnIndex, target.note.trackIndex, target.note.id, rng.int(1, 6))
        },
    },
    {
        name: 'setTempoChangerAt (one column)',
        weight: 2,
        run: ({song, rng}) => song.setTempoChangerAt(rng.int(0, song.columns.length - 1), rng.pick(TEMPO_CHANGERS)),
    },
    {
        name: 'setTempoChangerAt (a selection)',
        weight: 2,
        run: ({song, rng}) => song.setTempoChangerAt(rng.indexes(song.columns.length, rng.int(1, 6)), rng.pick(TEMPO_CHANGERS)),
    },
    {name: 'toggleBreakpoint', weight: 2, run: ({song, rng}) => song.toggleBreakpoint(rng.int(0, song.columns.length - 1))},
    // ---- structural ------------------------------------------------------------------------
    {
        name: 'addColumns',
        weight: 3,
        when: ({song}) => song.columns.length < MAX_COLUMNS,
        run: ({song, rng}) => song.addColumns(rng.int(1, 8), rng.chance(0.4) ? 'end' : rng.int(0, song.columns.length - 1)),
    },
    {
        name: 'removeColumns',
        weight: 3,
        when: ({song}) => song.columns.length > MIN_COLUMNS,
        run: ({song, rng}) => {
            const amount = rng.int(1, Math.min(6, song.columns.length - MIN_COLUMNS))
            song.removeColumns(amount, rng.int(0, song.columns.length - amount))
        },
    },
    {
        name: 'deleteColumns',
        weight: 3,
        when: ({song}) => song.columns.length > MIN_COLUMNS,
        run: ({song, rng}) => song.deleteColumns(rng.indexes(song.columns.length, rng.int(1, 6))),
    },
    {
        name: 'deleteColumns (empties the song)',
        //rare: it takes the whole song with it, and a seed that hits it early spends the rest of
        //its ops on the 12 columns the emptying branch refills with
        weight: 1,
        when: ({song}) => song.columns.length <= 24,
        run: ({song}) => song.deleteColumns(song.columns.map((_, i) => i)),
    },
    {
        name: 'eraseColumns',
        weight: 2,
        run: ({song, rng}) => song.eraseColumns(rng.indexes(song.columns.length, rng.int(1, 5)), randomLayer(song, rng)),
    },
    {
        name: 'moveNotesBy',
        weight: 3,
        run: ({song, rng}) => song.moveNotesBy(
            rng.indexes(song.columns.length, rng.int(1, 6)),
            rng.int(1, 2) * (rng.chance(0.5) ? 1 : -1),
            randomLayer(song, rng)
        ),
    },
    {name: 'normalizeSpans', weight: 1, run: ({song}) => song.normalizeSpans()},
    {name: 'validateBreakpoints', weight: 1, run: ({song}) => song.validateBreakpoints()},
    // ---- clipboard -------------------------------------------------------------------------
    {
        name: 'copyColumns',
        //a READ: it must leave the history alone however much it copies
        weight: 3,
        recordsNothing: true,
        run: run => {
            run.clipboard = run.song.copyColumns(
                run.rng.indexes(run.song.columns.length, run.rng.int(1, 5)),
                randomLayer(run.song, run.rng)
            )
        },
    },
    {
        name: 'pasteColumns',
        weight: 3,
        when: ({clipboard, song}) => clipboard.length > 0 && song.columns.length < MAX_COLUMNS,
        run: ({song, rng, clipboard}) => {
            song.selected = rng.int(0, song.columns.length - 1)
            //both branches: `insert` false SPLICES the clipboard in as new columns, true merges it
            //into the columns already there. And both source-Basepoint forms - a paste inside one
            //song carries trackPitches(), a paste from nowhere carries none.
            return song.pasteColumns(clipboard, rng.chance(0.5), rng.chance(0.5) ? song.trackPitches() : [])
        },
    },
    {
        name: 'pasteLayer',
        weight: 2,
        when: ({clipboard, song}) => clipboard.length > 0 && song.columns.length < MAX_COLUMNS,
        run: ({song, rng, clipboard}) => {
            song.selected = rng.int(0, song.columns.length - 1)
            song.pasteLayer(clipboard, rng.chance(0.5), randomTrack(song, rng), rng.chance(0.5) ? song.trackPitches() : [])
        },
    },
    // ---- layers and roster -----------------------------------------------------------------
    {
        name: 'switchLayer',
        weight: 2,
        when: ({song}) => song.instruments.length > 1,
        run: ({song, rng}) => {
            const [from, to] = twoTracks(song, rng)
            song.switchLayer(rng.int(1, song.columns.length), rng.int(0, song.columns.length - 1), from, to)
        },
    },
    {
        name: 'swapLayer',
        weight: 1,
        when: ({song}) => song.instruments.length > 1,
        run: ({song, rng}) => {
            const [a, b] = twoTracks(song, rng)
            song.swapLayer(rng.int(1, song.columns.length), rng.int(0, song.columns.length - 1), a, b)
        },
    },
    {
        name: 'swapTracks',
        weight: 2,
        when: ({song}) => song.instruments.length > 1,
        run: ({song, rng}) => {
            const [a, b] = twoTracks(song, rng)
            song.swapTracks(a, b)
        },
    },
    {
        name: 'addInstrument',
        weight: 2,
        when: ({song}) => song.instruments.length < MAX_TRACKS,
        run: ({song, rng}) => song.addInstrument(rng.pick(INSTRUMENTS)),
    },
    {
        name: 'removeInstrument',
        weight: 2,
        //a roster of zero would make serialize() write no tracks at all, which hides the graph from
        //the fingerprint - the composer keeps the last layer for the same reason
        when: ({song}) => song.instruments.length > 1,
        run: ({song, rng}) => song.removeInstrument(randomTrack(song, rng)),
    },
    {
        name: 'mergeTrackInto',
        weight: 2,
        when: ({song}) => song.instruments.length > 1,
        run: ({song, rng}) => {
            const [from, into] = twoTracks(song, rng)
            song.mergeTrackInto(from, into)
        },
    },
    {
        name: 'setInstrument',
        weight: 4,
        run: ({song, rng}) => song.setInstrument(randomTrack(song, rng), randomInstrument(rng)),
    },
    {
        name: 'swapInstruments',
        weight: 1,
        when: ({song}) => song.instruments.length > 1,
        run: ({song, rng}) => {
            const [a, b] = twoTracks(song, rng)
            song.swapInstruments(a, b)
        },
    },
    {name: 'ensureInstruments', weight: 1, run: ({song}) => song.ensureInstruments()},
    // ---- scalars ---------------------------------------------------------------------------
    {
        name: 'changeBasepoint',
        weight: 3,
        run: ({song, rng}) => song.changeBasepoint(rng.chance(0.5) ? 'song' : randomTrack(song, rng), rng.pick(PITCHES)),
    },
    {name: 'setBpm', weight: 1, run: ({song, rng}) => song.setBpm(rng.int(40, 300))},
    {name: 'setReverb', weight: 1, run: ({song, rng}) => song.setReverb(rng.chance(0.5))},
    {name: 'rename', weight: 1, run: ({song, rng}) => song.rename(`name-${rng.int(0, 99)}`)},
    // ---- documented no-ops -----------------------------------------------------------------
    // Their value here is not the mutator (test/undoRedo.test.ts has a row per no-op path) but the
    // HISTORY: a call that changed nothing must not land a Step for Ctrl+Z to eat, and - because
    // UndoHistory kills the redo branch at a Step's FIRST delta - must not cost a redo branch
    // either. The walks below would see both.
    {
        name: 'removeNoteAt (no such note)',
        recordsNothing: true,
        run: ({song, rng}) => song.removeNoteAt(rng.int(0, song.columns.length - 1), 0, ABSENT_ID),
    },
    {
        name: 'setNoteSpan (no such note)',
        recordsNothing: true,
        run: ({song, rng}) => song.setNoteSpan(rng.int(0, song.columns.length - 1), 0, ABSENT_ID, 3),
    },
    {name: 'setTempoChangerAt (an empty selection)', recordsNothing: true, run: ({song}) => song.setTempoChangerAt([], TEMPO_CHANGERS[0])},
    {name: 'addColumns (none to add)', recordsNothing: true, run: ({song}) => song.addColumns(0, 'end')},
    {name: 'eraseColumns (an empty selection)', recordsNothing: true, run: ({song, rng}) => song.eraseColumns([], randomLayer(song, rng))},
    {name: 'toggleBreakpoint (not a column index)', recordsNothing: true, run: ({song}) => song.toggleBreakpoint(-1)},
    {name: 'setInstrument (no such layer)', recordsNothing: true, run: ({song, rng}) => song.setInstrument(999, randomInstrument(rng))},
    {name: 'swapInstruments (no such layer)', recordsNothing: true, run: ({song}) => song.swapInstruments(0, 999)},
    {
        name: 'mergeTrackInto (a layer into itself)',
        recordsNothing: true,
        run: ({song, rng}) => {
            const track = randomTrack(song, rng)
            song.mergeTrackInto(track, track)
        },
    },
    {name: 'changeBasepoint (no interval)', recordsNothing: true, run: ({song}) => song.changeBasepoint('song', song.pitch)},
    {name: 'setBpm (the bpm it already has)', recordsNothing: true, run: ({song}) => song.setBpm(song.bpm)},
    {name: 'setReverb (the value it already has)', recordsNothing: true, run: ({song}) => song.setReverb(song.reverb)},
    {name: 'rename (the name it already has)', recordsNothing: true, run: ({song}) => song.rename(song.name)},
    // ...and the no-op paths that are only conditionally silent - they end in normalizeSpans() or
    // validateBreakpoints(), which record when an earlier op left the graph denormalized. Run for
    // the path, not flagged: an assertion that is wrong on a legal state is worse than no assertion.
    {name: 'removeColumns (none to remove)', run: ({song, rng}) => song.removeColumns(0, rng.int(0, song.columns.length - 1))},
    {name: 'deleteColumns (no such column)', run: ({song}) => song.deleteColumns([])},
    {name: 'moveNotesBy (an empty selection)', run: ({song, rng}) => song.moveNotesBy([], 1, randomLayer(song, rng))},
    {name: 'pasteColumns (an empty clipboard)', run: ({song}) => song.pasteColumns([], false)},
    {name: 'pasteLayer (an empty clipboard)', run: ({song}) => song.pasteLayer([], false, 0)},
]

function pickOp(run: Run): Op {
    const applicable = OPS.filter(op => op.when === undefined || op.when(run))
    const total = applicable.reduce((sum, op) => sum + (op.weight ?? 1), 0)
    let roll = run.rng.int(1, total)
    for (const op of applicable) {
        roll -= op.weight ?? 1
        if (roll <= 0) return op
    }
    return applicable[applicable.length - 1]
}

// ---------------------------------------------------------------------------------------------
// the driver
// ---------------------------------------------------------------------------------------------

/**
 * The invariants a history walk can plausibly break, re-checked at every position visited: undo
 * re-inserts columns (so a breakpoint's column address can go stale) and re-installs notes and
 * spans (so a span can come back as something the span model forbids).
 *
 * Deliberately NOT here: `selected` inside the column count (removeColumns does not clamp it, by
 * design - it is cursor state and the composer owns it) and the no-overlap rule (setInstrument's
 * non-injective swap can leave two same-(track, id) notes overlapping across columns without a
 * merge, which is a pre-existing property of the mutator, not of the undo). Asserting either would
 * fail on a state the app can really produce.
 */
function assertInvariants(run: Run) {
    const song = run.song
    const columns = song.columns
    check(columns.length > 0, () => `${where(run)}: the song lost every column`)
    const breakpoints = song.breakpoints
    checkSame(new Set(breakpoints).size, breakpoints.length, () => `${where(run)}: a breakpoint is in the array twice`)
    for (const breakpoint of breakpoints) {
        //a breakpoint is a column INDEX: one past the end reaches serialize() and then IndexedDB
        check(
            Number.isInteger(breakpoint) && breakpoint >= 0 && breakpoint < columns.length,
            () => `${where(run)}: breakpoint ${breakpoint} addresses no column`
        )
    }
    for (const column of columns) {
        for (const note of column.notes) {
            check(Number.isInteger(note.span) && note.span >= 1, () => `${where(run)}: span ${note.span} is not a Duration`)
        }
    }
}

/** The song must be exactly what it was when the history last stood here. */
function assertAt(run: Run) {
    expectFingerprint(fingerprint(run.song), run.positions[run.at], () => where(run))
    assertInvariants(run)
}

/**
 * One batch of ops = one history position, or none at all. A batch is either a single mutator call
 * (its own implicit Step) or a whole GROUP of them - the Duration Hold's shape, where the composer
 * opens a group and several calls fold into one Step.
 */
async function applyBatch(run: Run, size: number, grouped: boolean) {
    run.recorded = 0
    run.memo = null
    //nested groups now and then: the container is reentrant, and a Step closed at the INNER
    //endGroup would land two Steps where the ledger expects one - which the very next walk sees
    const depth = grouped ? (run.rng.chance(0.2) ? 2 : 1) : 0
    for (let i = 0; i < depth; i++) run.history.beginGroup()
    for (let i = 0; i < size; i++) await runOneOp(run)
    for (let i = 0; i < depth; i++) run.history.endGroup()
    if (run.recorded === 0) {
        //NOTHING RECORDED MUST MEAN NOTHING CHANGED. The converse is the data loss this whole
        //suite exists for: a write the mutators make without recording it is a change no Ctrl+Z
        //can reach, and it would show up here as a song that moved while the ledger stood still.
        expectFingerprint(fingerprint(run.song), run.positions[run.at], () => `${where(run)}: recorded nothing but changed the song`)
        return
    }
    //a delta with no Step scope around it means the song recorded outside #asStep - UndoHistory
    //lands it in a Step carrying a stale memo rather than dropping it, so the walk below would
    //otherwise only see a cursor jump to the wrong column
    check(run.memo !== null, () => `${where(run)}: deltas were recorded with no Step open`)
    //a landed Step clears the redo branch, and the ledger loses those positions with it
    run.positions.length = run.at + 1
    run.memos.length = run.at + 1
    run.positions.push(fingerprint(run.song))
    run.memos.push(run.memo)
    run.at = run.positions.length - 1
    check(run.history.canUndo, () => `${where(run)}: a Step landed but canUndo is false`)
    check(!run.history.canRedo, () => `${where(run)}: a new Step must clear the redo branch`)
    //the ledger claims the bottom of the history is the song as installed, which stops being true
    //the moment oldest-eviction starts. Keeping every run under the cap is what makes it true.
    check(run.positions.length - 1 < UNDO_HISTORY_CAP, () => `${where(run)}: the run outgrew the history cap`)
}

async function runOneOp(run: Run) {
    const op = pickOp(run)
    const recordedBefore = run.recorded
    run.log.push(op.name)
    await op.run(run)
    if (op.recordsNothing) {
        checkSame(run.recorded, recordedBefore, () => `${where(run)}: ${op.name} recorded a delta`)
    }
}

/** `ops` ops, some of them collapsed into groups. */
async function edit(run: Run, ops: number) {
    for (let done = 0; done < ops;) {
        const grouped = run.rng.chance(0.25)
        const size = grouped ? Math.min(run.rng.int(2, 5), ops - done) : 1
        await applyBatch(run, size, grouped)
        done += size
    }
}

function undoOnce(run: Run) {
    const bottom = run.at === 0
    //the Step between this position and the one below it - the one undo is about to pop
    const memo = run.memos[run.at]
    const step = run.song.undo()
    if (bottom) {
        check(step === null, () => `${where(run)}: undo returned a Step below the bottom of the ledger`)
    } else {
        check(step !== null, () => `${where(run)}: undo returned nothing with ${run.at} Steps behind it`)
        //the cursor memo rides the Step (CONTEXT.md § Undo Step); applying it is the composer's job
        checkSame(step!.selected, memo, () => `${where(run)}: the undone Step came back with another Step's memo`)
        run.at--
    }
    assertAt(run)
}

function redoOnce(run: Run) {
    const top = run.at === run.positions.length - 1
    const memo = run.memos[run.at + 1]
    const step = run.song.redo()
    if (top) {
        check(step === null, () => `${where(run)}: redo returned a Step above the top of the ledger`)
    } else {
        check(step !== null, () => `${where(run)}: redo returned nothing with ${run.positions.length - 1 - run.at} Steps ahead of it`)
        checkSame(step!.selected, memo, () => `${where(run)}: the redone Step came back with another Step's memo`)
        run.at++
    }
    assertAt(run)
}

/**
 * The walk the file is named for: undo or redo at random, `moves` times, demanding the recorded
 * fingerprint at every position it lands on. Positions are visited repeatedly and from both
 * directions on purpose - a delta whose by-reference payload was consumed rather than re-installed
 * survives one pass and dies on the second (the four-beat table's fourth beat, generalized).
 */
function walk(run: Run, moves: number) {
    for (let i = 0; i < moves; i++) {
        if (run.rng.chance(0.5)) undoOnce(run)
        else redoOnce(run)
    }
}

function undoToBottom(run: Run) {
    while (run.at > 0) undoOnce(run)
    //one more: a Step down here is a Step the ledger never saw land
    undoOnce(run)
    expectFingerprint(fingerprint(run.song), run.positions[0], () => `${where(run)}: undone to the bottom, but not to the song that was installed`)
}

function redoToTop(run: Run) {
    while (run.at < run.positions.length - 1) redoOnce(run)
    redoOnce(run)
    expectFingerprint(fingerprint(run.song), run.positions.at(-1)!, () => `${where(run)}: redone to the top, but not to the last edited song`)
}

/**
 * One seed, end to end. Phase two is the part no round-trip row covers: EDITING FROM INSIDE the
 * history, where the new Step kills a redo branch whose deltas still hold detached notes and
 * columns by reference. If any of those objects were still reachable from the live graph, the
 * walks after it read the difference.
 */
async function runSeed(seed: number) {
    const run = startRun(seed)
    await edit(run, 50)
    walk(run, run.rng.int(20, 40))
    undoToBottom(run)
    redoToTop(run)
    if (run.positions.length > 1) {
        for (let i = run.rng.int(1, run.positions.length - 1); i > 0; i--) undoOnce(run)
    }
    await edit(run, 12)
    walk(run, run.rng.int(15, 30))
    undoToBottom(run)
    redoToTop(run)
}

/**
 * Fixed seeds, not a seed drawn per run: a failing seed is then in the test's own NAME, reproduces
 * on every machine, and stays in the suite as the regression it found. Adding seeds is how this
 * file gets stronger; the count is bounded by the whole suite's runtime, which both games pay.
 */
const SEEDS = Array.from({length: 250}, (_, i) => i + 1)

describe('random op sequences survive random undo/redo walks', () => {
    for (const seed of SEEDS) {
        it(`seed ${seed}`, () => runSeed(seed))
    }
})

describe('the fuzz is not vacuous', () => {
    it('reaches every op it declares, over the seeds it runs', async () => {
        //an op with a `when` nothing satisfies, or a weight that never wins, is coverage this file
        //only appears to have - and it would go unnoticed forever, since a fuzz never says what it
        //did not do
        const seen = new Set<string>()
        //a prefix of the seeds, not all of them: this re-runs the edit half of every seed it
        //takes, and the rarest op (the emptying deleteColumns, weight 1 behind a `when`) already
        //turns up inside the first few dozen
        for (const seed of SEEDS.slice(0, 64)) {
            const run = startRun(seed)
            await edit(run, 50)
            run.log.forEach(name => seen.add(name))
        }
        expect(OPS.map(op => op.name).filter(name => !seen.has(name))).toEqual([])
    })

    it('records a Step for the ops that change the song, and none for the ops that do not', async () => {
        const run = startRun(1)
        await edit(run, 50)
        //the ledger grew, so the walks above really did walk something
        expect(run.positions.length).toBeGreaterThan(10)
        //...and the no-op ops in the table are still no-ops on a song 50 random ops have mangled
        const before = fingerprint(run.song)
        const recordedBefore = run.recorded
        for (const op of OPS.filter(op => op.recordsNothing)) {
            run.recorded = recordedBefore
            await op.run(run)
            expect(run.recorded, `${op.name} recorded a delta`).toBe(recordedBefore)
        }
        expect(fingerprint(run.song)).toBe(before)
    })
})
