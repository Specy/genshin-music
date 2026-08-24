// Export a ComposedSong to MIDI, read it back, and check you get the same song. The brief was
// "emphasis on how the timing is and notes played", so that is what these assert: column
// positions, and per-column (trackIndex, id, span).
//
// Everything here goes through REAL serialization — midi.toArray() and re-parse — because the
// defects this suite pins only appear once times have been through midi's tick grid. Nothing
// is asserted against a golden blob; the oracle is the source song.
//
// bpm 220 is the app default and the important case: 60000/220 = 272.727..., and every timing
// bug found in this pipeline was invisible at the integer-ms tempos (120, 240) and only bit
// where the column length is fractional.
import {describe, expect, it} from 'vitest'
import {CANONICAL_NOTE_IDS, INSTRUMENTS, PITCHES} from './imports'
import {ComposedSong} from '../src/lib/core/Songs/ComposedSong.svelte'
import {NoteColumn} from '../src/lib/core/Songs/SongClasses'
import {Midi} from '../src/lib/core/Songs/midiConstructor'
import {basepointOffset, isAccidentalMidi, numberToButton} from '../src/lib/core/Songs/noteIds'
import type {Pitch} from '../src/lib/core/legacyConfig'
import {
    importMidiTracks,
    playableIdsOf,
    suggestOffset,
    type MidiImportLayer,
    type MidiImportTrack,
} from '../src/lib/core/Songs/midiImport'
import {buildMidiTrackRoster} from '../src/lib/components/pages/Composer/MidiParser/midiTrackRoster'

const TEMPOS = [60, 120, 220, 400]

/**
 * A layer roster for the importer: every layer on the default instrument, holding where the case
 * says so. Capability is stated rather than read off the roster because neither shipped game is
 * guaranteed to ship a sustaining instrument (genshin ships none), and span layout has to be
 * exercised in both.
 */
const layersOf = (sustains: readonly boolean[]): MidiImportLayer[] =>
    sustains.map(holds => ({name: INSTRUMENTS[0], pitch: '', sustains: holds}))

/** A song of `layout` columns; each entry is the notes in that column, `null` for an empty one. */
function buildSong(
    bpm: number,
    layout: (null | {id: number; span?: number; track?: number}[])[],
    tempoChangers: number[] = [],
    pitch: Pitch = 'C'
): ComposedSong {
    //a fresh ComposedSong has NO instruments, and toMidi() iterates them to build tracks — so
    //the song needs a layer for every trackIndex used or it exports nothing at all
    const highestTrack = Math.max(
        0,
        ...layout.flatMap(entry => (entry ?? []).map(n => n.track ?? 0))
    )
    const song = new ComposedSong(
        'roundtrip',
        new Array(highestTrack + 1).fill(INSTRUMENTS[0])
    )
    song.bpm = bpm
    song.pitch = pitch
    const columns = layout.map((entry, index) => {
        const column = new NoteColumn()
        column.tempoChanger = tempoChangers[index] ?? 0
        column.notes = (entry ?? []).map(n => ({
            trackIndex: n.track ?? 0,
            id: n.id,
            span: n.span ?? 1,
        }))
        return column
    })
    song.initColumnsForConstruction(columns)
    return song
}

/**
 * The tracks of a song's own exported bytes, ready to hand back to the importer.
 *
 * Track selection and layer mapping are the importer screen's, not a shortcut: MidiParser drops
 * every noteless track, seeds each survivor's metadata from its ORIGINAL index, then builds a
 * compact file-order roster from the selected set.
 */
function exportedTracks(song: ComposedSong): {
    bpm: number
    tracks: MidiImportTrack[]
    layers: MidiImportLayer[]
} {
    const encoded = new Uint8Array(song.toMidi().toArray()).buffer as ArrayBuffer
    const midi = new Midi(encoded)
    const candidates = buildMidiTrackRoster(midi.tracks, song.instruments)
    return {
        bpm: Math.round((midi.header.tempos[0]?.bpm ?? 55) * 4) || 220,
        tracks: candidates.map(({track, localOffset, maxScaling}, layer) => ({
            notes: track.notes.map(n => ({midi: n.midi, time: n.time, duration: n.duration})),
            layer,
            localOffset,
            maxScaling,
        })),
        layers: candidates.map(({instrument}) => ({
            name: instrument.name,
            pitch: instrument.pitch,
        })),
    }
}

/** The full trip: song -> midi -> bytes -> midi -> columns, exactly as the app does it. */
function roundTrip(song: ComposedSong, layerSustains: boolean[] = [true, true, true]) {
    const {bpm, tracks, layers} = exportedTracks(song)
    return {
        bpm,
        ...importMidiTracks(tracks, {
            bpm,
            offset: 0,
            includeAccidentals: true,
            //re-imported at the Basepoint the export carries, which is what MidiParser does with
            //our own files (the key signature and our metadata both say it). The importer takes
            //that Basepoint off before snapping and puts it back after, so the comparison below
            //is against the source song's own numbers at ANY Basepoint, not a shifted copy.
            pitch: song.pitch,
            layers: layers.map((layer, index) => ({
                ...layer,
                sustains: layerSustains[index] ?? true,
            })),
        }),
    }
}

/** Column index -> sorted "id:span" list, skipping empties, for readable comparisons. */
function shape(columns: {notes: {trackIndex: number; id: number; span: number}[]}[]) {
    const out: Record<number, string[]> = {}
    columns.forEach((column, index) => {
        if (column.notes.length === 0) return
        out[index] = column.notes.map(n => `${n.trackIndex}:${n.id}:${n.span}`).sort()
    })
    return out
}

describe('midi round trip', () => {
    it('round-trips the tempo itself', () => {
        for (const bpm of TEMPOS) {
            const song = buildSong(bpm, [[{id: 60}]])
            expect(roundTrip(song).bpm, `bpm ${bpm}`).toBe(bpm)
        }
    })

    it('brings taps back as taps, not sustains', () => {
        //the defect this whole change exists for: taps were exported as a hard-coded 1 second,
        //which at bpm 220 re-imported as span 4 (and span 2 at 120, span 7 at 400)
        for (const bpm of TEMPOS) {
            const song = buildSong(bpm, [[{id: 60}], [{id: 62}], [{id: 64}]])
            const result = roundTrip(song)
            for (const column of result.columns) {
                for (const note of column.notes) {
                    expect(note.span, `bpm ${bpm}: tap came back as span ${note.span}`).toBe(1)
                }
            }
        }
    })

    it('preserves the spacing between notes', () => {
        //the compression bug: gaps were sized with Math.floor over whole-ms times, so at any
        //tempo whose column length is fractional an exact multi-column gap lost a column and
        //the song came back playing too fast
        for (const bpm of TEMPOS) {
            for (const gap of [1, 2, 3, 4]) {
                const layout: (null | {id: number}[])[] = []
                for (let i = 0; i < 8; i++) {
                    layout.push([{id: 60}])
                    for (let g = 1; g < gap; g++) layout.push(null)
                }
                const song = buildSong(bpm, layout)
                const positions = Object.keys(shape(roundTrip(song).columns)).map(Number)
                const expected = Array.from({length: 8}, (_, i) => i * gap)
                expect(positions, `bpm ${bpm}, gap ${gap}`).toEqual(expected)
            }
        }
    })

    it('preserves notes, chords and layers', () => {
        const song = buildSong(220, [
            [{id: 60, track: 0}, {id: 64, track: 0}, {id: 67, track: 0}],
            null,
            [{id: 62, track: 1}],
            [{id: 65, track: 0}, {id: 69, track: 2}],
        ])
        const result = roundTrip(song)
        expect(shape(result.columns)).toEqual({
            0: ['0:60:1', '0:64:1', '0:67:1'],
            2: ['1:62:1'],
            3: ['0:65:1', '2:69:1'],
        })
    })

    it('compacts a song whose middle layer is silent into the selected-track roster', () => {
        //toMidi writes one track per layer, silent layers included. The importer reads metadata
        //using those original indexes, then removes the silent track from the generated roster.
        const song = buildSong(220, [
            [{id: 60, track: 0}],
            null,
            [{id: 67, track: 2}],
        ])
        expect(song.instruments.length).toBe(3)
        expect(song.toMidi().tracks.length).toBe(3)
        const {tracks} = exportedTracks(song)
        expect(tracks.map(t => t.layer)).toEqual([0, 1])
        expect(shape(roundTrip(song).columns)).toEqual({0: ['0:60:1'], 2: ['1:67:1']})
    })

    it('keeps a sustain on a layer that can hold, at every tempo', () => {
        for (const bpm of TEMPOS) {
            const song = buildSong(bpm, [[{id: 60, span: 3}], null, null, [{id: 62}]])
            const result = roundTrip(song, [true])
            expect(shape(result.columns), `bpm ${bpm}`).toEqual({0: ['0:60:3'], 3: ['0:62:1']})
        }
    })

    it('drops the sustain when the layer cannot hold it', () => {
        //A: capability comes from instrument config; the composer already refuses to author a
        //hold on such a layer, so import was the only path producing unplayable spans
        const song = buildSong(220, [[{id: 60, span: 3}], null, null, [{id: 62}]])
        const result = roundTrip(song, [false])
        expect(shape(result.columns)).toEqual({0: ['0:60:1'], 3: ['0:62:1']})
    })

    it('gates each layer independently', () => {
        const song = buildSong(220, [[{id: 60, track: 0, span: 2}, {id: 67, track: 1, span: 2}], null])
        const result = roundTrip(song, [true, false])
        expect(shape(result.columns)).toEqual({0: ['0:60:2', '1:67:1']})
    })

    it('reconstructs sub-beat columns instead of stretching them to whole beats', () => {
        //tempo changers are consumed into ms on export and were never rebuilt, so a song of
        //1/4-length columns used to return uniform — i.e. four times too slow
        const song = buildSong(220, [[{id: 60}], [{id: 62}], [{id: 64}], [{id: 65}]], [2, 2, 2, 2])
        const result = roundTrip(song)
        expect(Object.keys(shape(result.columns)).map(Number)).toEqual([0, 1, 2, 3])
        //every column should be a quarter-length one, i.e. the timing is preserved, not just the count
        const durations = result.columns.map(c => c.tempoChanger)
        expect(durations.slice(0, 3)).toEqual([2, 2, 2])
    })

    it('does not drift over a long song', () => {
        //THE regression this suite exists to hold. The exporter used to accumulate ROUNDED
        //column lengths, gaining 0.273ms per column at bpm 220 — by column 63 that is a whole
        //1/8 of a beat, so every later note landed one column late and the song came back
        //peppered with sub-beat columns it never had. Short songs cannot see it: the earlier
        //spacing test tops out around column 28, and integer-ms tempos never drift at all.
        for (const bpm of [220, 333, 137, 999]) {
            const song = buildSong(bpm, Array.from({length: 200}, () => [{id: 60}]))
            const result = roundTrip(song)
            const occupied = result.columns
                .map((column, index) => (column.notes.length > 0 ? index : -1))
                .filter(index => index >= 0)
            expect(occupied, `bpm ${bpm} misplaced a note`).toEqual(
                Array.from({length: 200}, (_, i) => i)
            )
            expect(
                result.columns.filter(c => c.tempoChanger !== 0).length,
                `bpm ${bpm} invented sub-beat columns`
            ).toBe(0)
        }
    })

    it('keeps a tap inside a sub-beat column from swallowing the columns after it', () => {
        //a tap carries no duration of its own, so export substitutes one. Substituting a whole
        //BEAT overflows a 1/8 column and re-imports as a multi-column sustain on a layer that
        //can hold — the tap length has to respect the shortest column in the song.
        const song = buildSong(
            220,
            [[{id: 60}], [{id: 62}], [{id: 64}], [{id: 65}]],
            [3, 3, 3, 3]
        )
        const result = roundTrip(song, [true])
        for (const column of result.columns) {
            for (const note of column.notes) {
                expect(note.span, `tap in a 1/8 column came back as span ${note.span}`).toBe(1)
            }
        }
    })

    it('leaves a whole-column song using only whole columns', () => {
        //the gap filler is greedy over the changer table, so clean input must stay clean —
        //a uniform song must not come back peppered with sub-beat columns
        const song = buildSong(220, [[{id: 60}], [{id: 62}], null, [{id: 64}]])
        const result = roundTrip(song)
        expect(result.columns.every(c => c.tempoChanger === 0)).toBe(true)
    })

    it('reports the notes it could not place instead of silently dropping them', () => {
        const tracks: MidiImportTrack[] = [
            {
                //0 and 127 are outside every game's playable map
                notes: [
                    {midi: 0, time: 0, duration: 0.1},
                    {midi: 127, time: 1, duration: 0.1},
                    {midi: 60, time: 2, duration: 0.1},
                ],
                layer: 0,
                localOffset: null,
                maxScaling: 0,
            },
        ]
        const result = importMidiTracks(tracks, {
            bpm: 220,
            offset: 0,
            includeAccidentals: true,
            pitch: 'C',
            layers: layersOf([false]),
        })
        expect(result.totalNotes).toBe(3)
        expect(result.outOfRange).toBe(2)
        expect(result.perTrack[0].outOfRangeLower).toBe(1)
        expect(result.perTrack[0].outOfRangeUpper).toBe(1)
    })

    it('survives a bpm that midi cannot represent', () => {
        //the composer permits a bpm below midi's 3-byte tempo floor; export clamps rather than
        //writing a value that decodes as something else
        const song = buildSong(1, [[{id: 60}], null, [{id: 62}]])
        expect(() => roundTrip(song)).not.toThrow()
    })

    it('refuses to build columns from a nonsense bpm rather than hanging', () => {
        //the greedy fill walks a unit count derived from bpm; a zero or NaN bpm would make that
        //count non-finite and the loop would never terminate
        for (const bpm of [0, -10, NaN, Infinity]) {
            const result = importMidiTracks(
                [{notes: [{midi: 60, time: 0, duration: 1}], layer: 0, localOffset: null, maxScaling: 0}],
                {bpm, offset: 0, includeAccidentals: true, pitch: 'C', layers: layersOf([true])}
            )
            expect(result.columns, `bpm ${bpm}`).toEqual([])
        }
    })
})

/**
 * WHAT THE BASEPOINT DOES TO THIS PIPELINE, pinned because ADR-0007 moved BOTH halves of it and
 * they have to move together:
 *  - EXPORT is transposition-honest: `toMidi` writes the stored Note Numbers, which ARE the pitches
 *    the listener hears (the engine resolves a number to a button at the Basepoint and plays it at
 *    that Basepoint's rate), so a song at Basepoint D really does say D in a DAW;
 *  - IMPORT reads a file's numbers as the same thing — absolute sounding pitches — so it takes the
 *    layer's Basepoint OFF before snapping onto the grid (the nominal axis) and puts it back on
 *    after, through the layer's own instrument.
 * The two used to disagree: import treated every number as a grid nominal and lifted it a second
 * time, so our own non-C export came back shifted, with distinct notes colliding onto one row.
 */
describe('the Basepoint, on both sides of the pipeline', () => {
    const numbersOf = (columns: {notes: {id: number}[]}[]) =>
        columns.flatMap(column => column.notes.map(note => note.id)).sort((a, b) => a - b)

    it('re-imports our own export unchanged at every Basepoint', () => {
        for (const pitch of PITCHES as readonly Pitch[]) {
            //two notes the default instrument really voices at this Basepoint, so every case is a
            //song the composer could have authored: the same two buttons, carried by the Basepoint
            const carried = [60, 62].map(number => number + basepointOffset(pitch))
            const song = buildSong(220, [[{id: carried[0]}], null, [{id: carried[1]}]], [], pitch)
            expect(numbersOf(roundTrip(song).columns), pitch).toEqual(carried)
        }
    })

    it('keeps two adjacent notes of a non-C song distinct instead of merging them', () => {
        //THE collision the double lift caused: at Db the buttons sounding E and F store 65 and 66,
        //and both used to snap to the nominal 65 and lift to 66 — one note absorbed by the other
        //(or dropped outright with accidentals off, since 66 read as an accidental).
        const song = buildSong(220, [[{id: 65}, {id: 66}]], [], 'Db')
        const result = roundTrip(song)
        expect(numbersOf(result.columns)).toEqual([65, 66])
        expect(result.merged).toBe(0)
        //and both are notes the layer can actually sound at that Basepoint
        for (const number of numbersOf(result.columns)) {
            expect(numberToButton(INSTRUMENTS[0], 'Db', number)).not.toBe(-1)
        }
    })

    it("honours a LAYER's own Basepoint, not just the song's", () => {
        //a track's override is part of what its numbers MEAN (ADR-0007 §4), so it has to be part
        //of what the trip through grid space takes off and puts back. The song below is the end
        //state the composer would leave after overriding layer 0 to D: the notes are already
        //carried, which is what setInstrument's rewrite does to them.
        //
        //The rows chosen are the ones that expose an import which ignores the override: carried,
        //they are accidentals in absolute space, so snapping them WITHOUT taking the override off
        //first pulls them onto a neighbouring row the track cannot voice at D.
        const rows = [...CANONICAL_NOTE_IDS]
            .sort((a, b) => a - b)
            .filter(id => isAccidentalMidi(id + basepointOffset('D')))
        expect(rows.length).toBeGreaterThanOrEqual(2)
        const carried = rows.slice(0, 2).map(id => id + basepointOffset('D'))
        const song = buildSong(220, [[{id: carried[0]}], null, [{id: carried[1]}]])
        song.instruments[0].pitch = 'D'
        const {bpm, tracks} = exportedTracks(song)
        const imported = numbersOf(importMidiTracks(tracks, {
            bpm,
            offset: 0,
            includeAccidentals: true,
            //the SONG stays at C; only the layer is at D, exactly as the metadata records it
            pitch: 'C',
            layers: [{name: INSTRUMENTS[0], pitch: 'D', sustains: true}],
        }).columns)
        expect(imported).toEqual(carried)
        for (const number of imported) expect(numberToButton(INSTRUMENTS[0], 'D', number)).not.toBe(-1)
    })

    it('snaps a foreign file onto the grid the Basepoint tunes, rather than transposing it', () => {
        //a file in C imported at Basepoint D: a note that Basepoint can voice keeps its own pitch,
        //and one it cannot snaps DOWN to the nearest it can, exactly as an accidental does at C.
        //What it must NOT do is shift the whole file UP by the Basepoint, which is what reading
        //its numbers as grid nominals did. Rows from the middle of the grid, so nothing falls off
        //the bottom once the Basepoint comes off.
        const grid = [...CANONICAL_NOTE_IDS].sort((a, b) => a - b)
        const source = [grid[3], grid[4]]
        const song = buildSong(220, [[{id: source[0]}], null, [{id: source[1]}]])
        const {tracks} = exportedTracks(song)
        const imported = numbersOf(importMidiTracks(tracks, {
            bpm: 220, offset: 0, includeAccidentals: true, pitch: 'D', layers: layersOf([true]),
        }).columns)
        expect(imported.length).toBe(2)
        imported.forEach((number, index) => {
            expect(source[index] - number).toBeGreaterThanOrEqual(0)
            expect(source[index] - number).toBeLessThanOrEqual(1)
            expect(numberToButton(INSTRUMENTS[0], 'D', number)).not.toBe(-1)
        })
    })
})

// The transposition search — the automation adapted from the Python lyre player's
// find_best_shift. Scored two ways on purpose: accidentals (a note snapped to a neighbouring
// key, i.e. audibly wrong) and stranded notes (no sound at all).
describe('suggestOffset', () => {
    const playable = playableIdsOf(INSTRUMENTS[0])
    const at = (midis: number[]) => suggestOffset(midis.map(midi => ({midi})), playable)

    it('leaves an already-diatonic song where it is', () => {
        //the round-trip guarantee: running this over the app's own export must never move it
        const inRange = [...playable].sort((a, b) => a - b)
        expect(at(inRange).offset).toBe(0)
        expect(at(inRange).accidentals).toBe(0)
        expect(at(inRange).stranded).toBe(0)
    })

    it('finds the shift that makes a transposed song diatonic again', () => {
        //take a clean C-major run, push it up a semitone, and it should be pushed back
        const inRange = [...playable].sort((a, b) => a - b).slice(0, 12)
        const sharped = inRange.map(m => m + 1)
        const suggestion = at(sharped)
        expect(suggestion.offset).toBe(1)
        expect(suggestion.accidentals).toBe(0)
    })

    it('beats leaving the offset alone on a song in a distant key', () => {
        //F# major against a C-major instrument is the worst case: 6 sharps
        const fSharpMajor = [66, 68, 70, 71, 73, 75, 77, 78]
        const suggestion = at(fSharpMajor)
        expect(suggestion.accidentals).toBe(0)
        expect(suggestion.offset).not.toBe(0)
    })

    it('pulls an out-of-range song back into the instrument by octaves', () => {
        //two octaves above anything the instrument has: every note is silent at offset 0
        const tooHigh = [...playable].sort((a, b) => a - b).slice(0, 6).map(m => m + 24)
        const suggestion = at(tooHigh)
        expect(suggestion.stranded).toBe(0)
        expect(suggestion.offset % 12).toBe(0)
    })

    it('reports a cost rather than pretending an impossible song fits', () => {
        //a chromatic run cannot be made diatonic by any shift; the count is what the user
        //needs to see, and it must be honest
        const chromatic = Array.from({length: 12}, (_, i) => 60 + i)
        expect(at(chromatic).accidentals).toBeGreaterThan(0)
    })

    it('handles an empty selection without proposing a shift', () => {
        expect(at([])).toEqual({offset: 0, accidentals: 0, stranded: 0})
    })
})
