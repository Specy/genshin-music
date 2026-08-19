import {describe, expect, it} from 'vitest'
import {
    ApproachingNote,
    Chunk,
    ComposedSong,
    Folder,
    InstrumentData,
    INSTRUMENTS,
    MidiNote,
    NoteColumn,
    NoteLayer,
    RecordedNote,
    RecordedSong,
    Recording,
    Song,
    TempoChunk,
    VisualChunk,
    VisualSong,
    VsrgHitObject,
    VsrgSong,
    VsrgTrack,
    VsrgTrackModifier,
} from './imports'
import {buildComposedSong, buildRecordedSong} from './builders'
import {assertNoReactiveProxies} from './noProxies'
import {assertNoLiveAliasing, assertNoSharedState} from './noAliasing'
import {instanceCallables, staticCallables} from './reflect'
import {reactiveArray} from './signals.svelte'

/**
 * The plain-data boundary of the model (2026-08-06 reactive-model plan), in every direction it has.
 *
 * OUT: everything a persistence path returns must be structured-cloneable (no `$state` proxy can
 * reach IndexedDB - test/noProxies.ts) AND unaliased from the live song (a payload is a snapshot -
 * test/noAliasing.ts). The two catch different bugs and neither implies the other; the aliasing
 * half had no gate at all until now, and a reviewer proved it by making ComposedSong.serialize()
 * return the live `breakpoints` array and watching the entire suite - every golden fixture
 * included - stay green.
 *
 * ACROSS: clone() must share nothing mutable with the song it copied - same failure mode, and
 * equally unwatched until now, because a payload walk cannot see inside a class instance.
 *
 * IN: a method that installs a column array as the live graph must install a PLAIN array.
 * restoreColumns is the one that is handed a Svelte deep proxy (the composer's undo history is a
 * `$state` array); initColumnsForConstruction copies for ownership rather than laundering - see its
 * header.
 *
 * One describe block below per direction, then the reflection that keeps the OUT table complete.
 */

/** A composed song in the state a live editing session leaves it in, not construction defaults. */
function liveComposedSong(): ComposedSong {
    const song = buildComposedSong()
    //through the mutators on purpose: they are what assign the `$state.raw` arrays
    song.addInstrument(INSTRUMENTS[0])
    song.toggleBreakpoint(2)
    song.addNoteAt(2, 0, song.columns[0].notes[0].id, 2)
    return song
}

/** A vsrg song in the state a live editing session leaves it in, not construction defaults. */
function liveVsrgSong(): VsrgSong {
    const song = new VsrgSong('plain vsrg')
    song.addTrack(INSTRUMENTS[0])
    song.createHitObjectInTrack(0, 500, 0)
    //so that VsrgTrackModifier.serialize() is on the exercised path rather than skipped by an
    //empty array. Through the field, which is the `$state.raw` setter - setTrackModifier only
    //PATCHES an existing entry
    song.trackModifiers = [new VsrgTrackModifier()]
    song.setBreakpoint(0, true)
    return song
}

interface PersistencePath {
    label: string
    /**
     * Qualified `Class.method` names this row actually exercises - cross-checked against the
     * reflected surface below, which is what stops a phase from adding a serialize path that
     * nothing checks.
     */
    covers: string[]
    /** The payload, plus the model instance it must not be a view onto. */
    run: () => { model: object, payload: unknown }
}

const PATHS: PersistencePath[] = [
    {
        label: 'ComposedSong.serialize()',
        covers: ['ComposedSong.serialize'],
        run: () => {
            const song = liveComposedSong()
            return {model: song, payload: song.serialize()}
        },
    },
    //The ComposedSong.toOldFormat() row lived here until ADR-0007 phase E retired that export
    //(kept commented in the model). It carried NoteLayer.serializeHex with it, which is why that
    //member now sits in NOT_PERSISTED below rather than under a `covers`.
    {
        label: 'ComposedSong.clone().serialize()',
        //the clone is what the library's "duplicate song" and the undo history persist
        covers: [],
        run: () => {
            const clone = liveComposedSong().clone()
            return {model: clone, payload: clone.serialize()}
        },
    },
    {
        label: 'ComposedSong.toRecordedSong().serialize()',
        covers: ['RecordedSong.serialize', 'RecordedNote.serialize'],
        run: () => {
            const recorded = liveComposedSong().toRecordedSong()
            return {model: recorded, payload: recorded.serialize()}
        },
    },
    {
        label: 'RecordedSong.serialize()',
        covers: [],
        run: () => {
            const song = buildRecordedSong()
            return {model: song, payload: song.serialize()}
        },
    },
    //RecordedSong.toOldFormat() was retired alongside the composed one (ADR-0007 phase E).
    {
        label: 'RecordedSong.clone().serialize()',
        covers: [],
        run: () => {
            const clone = buildRecordedSong().clone()
            return {model: clone, payload: clone.serialize()}
        },
    },
    {
        label: 'RecordedSong.toComposedSong().serialize()',
        covers: [],
        run: () => {
            const composed = buildRecordedSong().toComposedSong()
            return {model: composed, payload: composed.serialize()}
        },
    },
    {
        //VsrgSong became reactive in phase 2: seven scalars are `$state`, `breakpoints` and
        //`trackModifiers` are `$state.raw`, and the track graph is a private array behind a getter.
        //None of that is a proxy (see test/noProxies.ts's header), so what these two rows really
        //gate is the ALIASING half: serialize() and clone() must copy every array and object out,
        //and the clone() gate further down is what catches a copy that shares one.
        label: 'VsrgSong.serialize()',
        covers: [
            'VsrgSong.serialize',
            'VsrgTrack.serialize',
            'VsrgHitObject.serialize',
            'VsrgTrackModifier.serialize',
        ],
        run: () => {
            const song = liveVsrgSong()
            return {model: song, payload: song.serialize()}
        },
    },
    {
        label: 'VsrgSong.clone().serialize()',
        covers: [],
        run: () => {
            const clone = liveVsrgSong().clone()
            return {model: clone, payload: clone.serialize()}
        },
    },
    {
        label: 'Folder.serialize()',
        covers: ['Folder.serialize'],
        run: () => {
            const folder = new Folder('golden folder')
            folder.addSong({id: 'a', folderId: null, name: 'a', type: 'composed', _thisIsNotASerializedSong: null})
            return {model: folder, payload: folder.serialize()}
        },
    },
    {
        label: 'InstrumentData.serialize()',
        covers: ['InstrumentData.serialize'],
        run: () => {
            const instrument = new InstrumentData({name: INSTRUMENTS[0]})
            return {model: instrument, payload: instrument.serialize()}
        },
    },
]

/**
 * The serialize-shaped callables that produce NO persisted payload, each with the reason. Listed
 * by name rather than filtered out by a heuristic ("statics are deserializers", "is* returns a
 * boolean"), for the same reason reactivePublish.test.ts lists its private helpers: a heuristic
 * silently absorbs the next thing that happens to fit it.
 */
const NOT_PERSISTED: Record<string, string> = {
    'ComposedSong.deserialize': 'reads a payload, returns a song',
    'ComposedSong.deserializeLegacy': 'reads a payload, returns a song',
    'ComposedSong.deserializeTo': 'Song static: reads a payload into a song',
    'ComposedSong.isSerializedType': 'type predicate, returns a boolean',
    'ComposedSong.isOldFormatSerializedType': 'type predicate, returns a boolean',
    'RecordedSong.deserialize': 'reads a payload, returns a song',
    'RecordedSong.deserializeTo': 'Song static: reads a payload into a song',
    'RecordedSong.fromOldFormat': 'reads a legacy payload, returns a song',
    'RecordedSong.isSerializedType': 'type predicate, returns a boolean',
    'RecordedSong.isOldFormatSerializedType': 'type predicate, returns a boolean',
    'VsrgSong.deserialize': 'reads a payload, returns a song',
    'VsrgSong.isSerializedType': 'type predicate, returns a boolean',
    'VsrgSong.deserializeTo': 'Song static: reads a payload into a song',
    'VsrgTrack.deserialize': 'reads a payload, returns a track',
    'VsrgHitObject.deserialize': 'reads a payload, returns a hit object',
    'VsrgTrackModifier.deserialize': 'reads a payload, returns a modifier',
    'InstrumentData.deserialize': 'reads a payload, returns an instrument',
    'Folder.deserialize': 'reads a payload, returns a folder',
    'Folder.isSerializedType': 'type predicate, returns a boolean',
    //NoteLayer is squarely on the persistence path - the pre-v4 formats stored notes as (index,
    //layer bitmask) pairs - which is why it has to be reflected. Since ADR-0007 phase E it is a
    //READ-ONLY path: the only writers of a bitmask were the two toOldFormat exports, so no
    //NoteLayer member reaches a payload any more.
    'NoteLayer.serializeHex': 'returns a hex bitmask, and no writer emits it since the old-format ' +
        'exports were retired (ADR-0007 phase E); the hex form is now an INPUT only (deserializeHex)',
    'NoteLayer.serializeBin': 'returns a string, and no writer emits it: the binary form is a v1 ' +
        'INPUT (deserializeBin), and the only caller is NoteLayer.toArray()',
    'NoteLayer.deserializeHex': 'reads a hex bitmask, returns a NoteLayer (composed v2/v3, recorded v2)',
    'NoteLayer.deserializeBin': 'reads a binary bitmask, returns a NoteLayer (composed v1)',
    'NoteLayer.deserializeDec': 'reads a decimal bitmask, returns a NoteLayer; no format uses it',
}

function check(path: PersistencePath) {
    const {model, payload} = path.run()
    assertNoReactiveProxies(path.label, payload)
    assertNoLiveAliasing(path.label, model, payload)
}

describe('persistence entry points return plain, unaliased snapshots', () => {
    for (const path of PATHS) {
        it(path.label, () => check(path))
    }
})

describe('the guards fire', () => {
    //a guard nobody has seen fail is indistinguishable from one that never fires
    it('the proxy guard rejects a deep $state array, and names where it is', () => {
        expect(() => assertNoReactiveProxies('probe', {tracks: [{notes: reactiveArray([1, 2])}]}))
            .toThrow(/tracks\.0\.notes/)
    })

    it('the aliasing guard rejects a live array handed straight back', () => {
        const song = liveComposedSong()
        //exactly the regression a reviewer proved invisible: `breakpoints: this.breakpoints`
        const aliased = {...song.serialize(), breakpoints: song.breakpoints}
        expect(() => assertNoLiveAliasing('probe', song, aliased)).toThrow(/breakpoints/)
    })

    it('the aliasing guard reaches through the payload, and past a $state.raw field', () => {
        const song = liveComposedSong()
        //nested rather than top-level, and a live NOTE object rather than a field of the song: it
        //is reachable only by walking #columns through the `columns` getter
        const aliased = {tracks: [{notes: [song.columns[0].notes[0]]}]}
        expect(() => assertNoLiveAliasing('probe', song, aliased)).toThrow(/tracks\[0]\.notes\[0]/)
    })

    it('the aliasing guard passes a payload built out of copies', () => {
        const song = liveComposedSong()
        expect(() => assertNoLiveAliasing('probe', song, {
            breakpoints: [...song.breakpoints],
            notes: song.columns[0].notes.map(note => ({...note})),
        })).not.toThrow()
    })

    it('the aliasing guard exempts a shared FROZEN value, and only a frozen one', () => {
        //nothing can be written through an immutable value, from either side, so sharing one is
        //not aliasing in any sense that matters. Nothing in the model is frozen today - this pins
        //the exemption so that sharing a frozen constant stays legal, and the contrast below
        //proves the exemption is the freeze and not the shape.
        const frozen = Object.freeze([1, 2, 3])
        expect(() => assertNoLiveAliasing('probe', {constants: frozen}, {constants: frozen}))
            .not.toThrow()
        const mutable = [1, 2, 3]
        expect(() => assertNoLiveAliasing('probe', {constants: mutable}, {constants: mutable}))
            .toThrow(/constants/)
    })
})

describe('the column install paths launder reactive input', () => {
    //Composer.svelte's undoHistory is a deep `$state` array, so an entry read back out of it is a
    //Svelte PROXY of a column array. Installing one as #columns would leave the live graph proxied
    //for the rest of the session - every columns[i] read on the canvas draw path paying a trap -
    //and refreshSong()'s clone is what used to launder it away.
    //
    //That is restoreColumns' story: undo() hands it an array read back out of a `$state` container.
    //initColumnsForConstruction's callers build a fresh plain array, so its copy is about OWNERSHIP
    //of the installed array rather than laundering - it is tested here anyway, because "a public
    //method that installs #columns installs a plain array it owns" is the contract, and deleting
    //either copy leaves the whole suite green without these tests.
    function proxiedColumns(song: ComposedSong): NoteColumn[] {
        const history: NoteColumn[][] = reactiveArray([song.clone().columns])
        const restored = history[0]
        //the premise: what comes back out is a proxy, not the plain array that went in
        expect(() => structuredClone(restored)).toThrow()
        return restored
    }

    it('restoreColumns copies the array it is given', () => {
        const song = liveComposedSong()
        const columns = proxiedColumns(song)
        song.restoreColumns(columns)
        expect(song.columns).not.toBe(columns)
        expect(() => structuredClone(song.columns)).not.toThrow()
    })

    it('initColumnsForConstruction copies the array it is given', () => {
        const song = liveComposedSong()
        const columns = proxiedColumns(song)
        song.initColumnsForConstruction(columns)
        expect(song.columns).not.toBe(columns)
        expect(() => structuredClone(song.columns)).not.toThrow()
    })
})

describe('clone() shares nothing with the song it copied', () => {
    //The model -> model direction, which nothing gated before: assertNoLiveAliasing walks a PAYLOAD,
    //and a payload walk cannot see into a class instance at all (`#columns` is private, `breakpoints`
    //and `instruments` are prototype accessors). So a clone that aliased its source passed every
    //gate - a reviewer proved it by replacing ComposedSong.clone()'s `[...this.breakpoints]` with
    //`this.breakpoints`. Re-measured this round with that change in place: the ComposedSong case
    //below is the ONLY red test in the sky suite; every other test, golden fixtures included, passes.
    //
    //What clone() is load-bearing for: the composer's undo history (which keeps
    //`song.clone().columns`, so what that caller depends on is the deep COLUMN copy), the library
    //row's "duplicate song", toOtherGame()'s conversion and the download path. Anything shared
    //means editing the song rewrites its copy, in whichever of those the copy is being held.
    it('ComposedSong.clone()', () => {
        const song = liveComposedSong()
        assertNoSharedState('ComposedSong.clone()', song, song.clone())
    })

    it('RecordedSong.clone()', () => {
        const song = buildRecordedSong()
        assertNoSharedState('RecordedSong.clone()', song, song.clone())
    })

    it('VsrgSong.clone()', () => {
        const song = liveVsrgSong()
        assertNoSharedState('VsrgSong.clone()', song, song.clone())
    })

    //Folder.clone() is deliberately absent: it shares its `songs` entries with the folder it came
    //from (`[...this.songs]` copies the array, not the song objects in it), which is the intent -
    //those entries are library rows owned elsewhere, not the folder's own state.

    it('the gate fires on a clone that hands back a live array', () => {
        const song = liveComposedSong()
        const clone = song.clone()
        //exactly the regression a reviewer proved invisible
        clone.breakpoints = song.breakpoints
        expect(() => assertNoSharedState('probe', song, clone)).toThrow(/breakpoints/)
    })

    it('the gate reaches a shared NOTE, several levels inside two private column arrays', () => {
        const song = liveComposedSong()
        const clone = song.clone()
        //a deep copy that forgot one leaf: reachable from both only through the `columns` getter
        clone.columns[0].notes[0] = song.columns[0].notes[0]
        expect(() => assertNoSharedState('probe', song, clone)).toThrow(/notes/)
    })
})

/**
 * Every class the model exports, each with a LIVE INSTANCE.
 *
 * The instance is not a convenience: ComposedSong.serialize and RecordedSong.serialize are
 * arrow-function INSTANCE fields, which exist on the object and on no prototype - reflecting the
 * classes alone would leave the two most important paths in this file out of the surface entirely
 * (verified against this tree: `ComposedSong.serialize` disappears).
 *
 * Hand-written, but not hand-limited: the first test below derives the class list from the model
 * folder and goes red on any class it exports that is missing from here. That is the difference
 * between this and the flat list of ten classes it replaced, which could only ever check the
 * classes someone had thought of.
 *
 * Song is the only entry without an instance, and it needs no exemption machinery beyond its
 * reason: it is abstract, and every member it has is reflected through the concrete subclasses
 * (statics through the constructor chain, methods through the prototype chain).
 */
type ModelClass =
    { label: string, klass: object, instance: object }
    | { label: string, klass: object, noInstance: string }

function modelClasses(): ModelClass[] {
    const composed = liveComposedSong()
    const recorded = buildRecordedSong()
    const vsrg = liveVsrgSong()
    return [
        {label: 'Song', klass: Song, noInstance: 'abstract; reflected through the three concrete songs below'},
        {label: 'ComposedSong', klass: ComposedSong, instance: composed},
        {label: 'RecordedSong', klass: RecordedSong, instance: recorded},
        {label: 'VsrgSong', klass: VsrgSong, instance: vsrg},
        {label: 'VsrgTrack', klass: VsrgTrack, instance: vsrg.tracks[0]},
        {label: 'VsrgHitObject', klass: VsrgHitObject, instance: vsrg.tracks[0].hitObjects[0]},
        {label: 'VsrgTrackModifier', klass: VsrgTrackModifier, instance: vsrg.trackModifiers[0]},
        {label: 'NoteColumn', klass: NoteColumn, instance: composed.columns[0]},
        {label: 'RecordedNote', klass: RecordedNote, instance: recorded.notes[0]},
        {label: 'InstrumentData', klass: InstrumentData, instance: composed.instruments[0]},
        {label: 'NoteLayer', klass: NoteLayer, instance: new NoteLayer(3)},
        {label: 'MidiNote', klass: MidiNote, instance: new MidiNote(0, 0)},
        {label: 'Recording', klass: Recording, instance: new Recording()},
        {label: 'ApproachingNote', klass: ApproachingNote, instance: new ApproachingNote({time: 0, index: 0})},
        {label: 'VisualSong', klass: VisualSong, instance: new VisualSong(220)},
        {label: 'TempoChunk', klass: TempoChunk, instance: new TempoChunk(0, [])},
        //two different classes genuinely called `Chunk`, in two files (see VisualSong.ts's header)
        {label: 'Chunk (RecordedSong)', klass: Chunk, instance: new Chunk([], 0)},
        {label: 'Chunk (VisualSong)', klass: VisualChunk, instance: new VisualChunk()},
        {label: 'Folder', klass: Folder, instance: new Folder('surface')},
    ]
}

/**
 * Persistence classes registered above that do NOT live in the model folder, so the derivation
 * cannot be expected to produce them. Folder is the only one: it is the library's other stored
 * entity (Database's `folders` collection, beside `songs`) and it has the same
 * serialize/deserialize/isSerializedType shape as a song.
 *
 * The theme layer serializes too and is deliberately out of scope here - test/noProxies.ts's
 * header covers why it cannot leak through these paths. This file's claims stop at the song model.
 */
const EXTERNAL_CLASSES: object[] = [Folder]

/**
 * The model folder, read as MODULES rather than as a list of imports - the whole point of this
 * section. Its previous form reflected a hardcoded list of ten classes while claiming to catch
 * "the whole family": a reviewer added serializeBrandNewPersistencePath() to NoteLayer - which is
 * on the persistence path, carries five serialize-shaped callables and fed the composed
 * old-format export (retired at ADR-0007 phase E) - and the entire sky suite stayed green.
 */
const SONG_MODULES: Record<string, unknown> = import.meta.glob('../src/lib/core/Songs/*.ts', {eager: true})

/**
 * A class, not just any function: a class's `prototype` property is non-writable, an ordinary
 * function's is writable, and arrow functions and methods have none. Read through the descriptor
 * so nothing is invoked. (This is a spec-level distinction, not a syntax sniff on toString.)
 */
function isClass(value: unknown): value is object {
    if (typeof value !== 'function') return false
    const descriptor = Object.getOwnPropertyDescriptor(value, 'prototype')
    return descriptor !== undefined && descriptor.writable === false
}

/** Every class EXPORTED by the model folder, with where it came from (for the failure message). */
function exportedModelClasses(): { source: string, klass: object }[] {
    const found: { source: string, klass: object }[] = []
    for (const [path, module] of Object.entries(SONG_MODULES)) {
        if (typeof module !== 'object' || module === null) continue
        for (const [name, value] of Object.entries(module)) {
            if (isClass(value)) found.push({source: `${path.split('/').pop()}: ${name}`, klass: value})
        }
    }
    return found
}

/**
 * What makes something a persistence path, mechanically: its NAME. Every payload-producing method
 * in the model is `serialize`, and every reader of one is `deserialize*`/`isSerializedType`/
 * `fromOldFormat`. The `oldformat` half of the pattern still earns its place after the export's
 * retirement (ADR-0007 phase E): it is what catches the surviving old-format READERS, and what
 * would catch a `toOldFormat` someone un-comments.
 *
 * Exactly what the pair of tests below delivers, and no more:
 * - the CLASS LIST is derived from the folder, so a persistence class cannot be missed by not
 *   being thought of. Adding, renaming or deleting a class in src/lib/core/Songs fails the first
 *   test until modelClasses() is updated.
 * - WITHIN a reflected class, the trigger is the name. A payload-producing method called something
 *   else entirely - `toWireFormat()`, `dump()` - escapes, and whoever writes it has to add a row by
 *   hand. What the second test does guarantee is that no serialize-SHAPED member of any of those
 *   classes can be added, renamed or deleted without going red.
 * - a class that is not EXPORTED from its module is invisible to both (VisualSong's internal
 *   TempoChunkNote/TempoChunkColumn are the only ones today; nothing serializes them).
 * - "classified" means a row in PATHS or a documented reason in NOT_PERSISTED. Neither test runs
 *   the method, so a `covers` entry is a claim about the row's payload, not an execution trace.
 */
const SERIALIZE_SHAPED = /serial|oldformat/i

describe('no serialize path escapes the guards', () => {
    it('reflects every class the model folder exports', () => {
        const registered = new Set(modelClasses().map(entry => entry.klass))
        //a class ADDED to src/lib/core/Songs lands here until modelClasses() names it
        expect(exportedModelClasses().filter(entry => !registered.has(entry.klass)).map(entry => entry.source).sort())
            .toEqual([])
        //...and one deleted, renamed or moved out leaves a stale entry, which lands here
        const derived = new Set([...exportedModelClasses().map(entry => entry.klass), ...EXTERNAL_CLASSES])
        expect(modelClasses().filter(entry => !derived.has(entry.klass)).map(entry => entry.label).sort())
            .toEqual([])
        //`noInstance` is an escape hatch - such a class contributes NOTHING to the surface below -
        //so it is pinned to the single class that genuinely cannot be instantiated. Song gets away
        //with it because its every member is reflected through the three concrete songs anyway.
        expect(modelClasses().filter(entry => !('instance' in entry)).map(entry => entry.label)).toEqual(['Song'])
    })

    it('classifies every serialize-shaped callable in the model', () => {
        const surface = modelClasses().flatMap(entry => {
            //a class with no instance contributes nothing on purpose - see modelClasses()' header
            if (!('instance' in entry)) return []
            const names = new Set([...instanceCallables(entry.instance), ...staticCallables(entry.klass)])
            return [...names].filter(name => SERIALIZE_SHAPED.test(name)).map(name => `${entry.label}.${name}`)
        })

        const classified = new Set([...PATHS.flatMap(path => path.covers), ...Object.keys(NOT_PERSISTED)])
        //a NEW serialize path lands here until it gets a row above
        expect(surface.filter(name => !classified.has(name)).sort()).toEqual([])
        //a renamed or deleted one leaves a stale row, which lands here
        expect([...classified].filter(name => !surface.includes(name)).sort()).toEqual([])
    })
})
