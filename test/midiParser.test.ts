import {describe, expect, it} from 'vitest'
import {Midi} from '@tonejs/midi'
import {CANONICAL_NOTE_IDS, INSTRUMENTS, INSTRUMENTS_DATA, MIDI_BOUNDS, MidiNote} from './imports'
import {
    basepointOffset,
    getNoteIdTable,
    getSoundingTable,
    isAccidentalMidi,
    numberToButton,
    snapMidiToGrid,
} from '$core/Songs/noteIds'
import {importMidiTracks, type MidiImportLayer} from '$core/Songs/midiImport'
import type {Pitch} from '$core/legacyConfig'

// Old MidiParser/index.tsx's `convertMidi()` (a bound class-instance method reading/writing
// `this.state`) is the one place the accidental-counting / out-of-range-bounds / offset math
// lives, and it is NOT standalone in the old blob (nor is its Svelte-ported equivalent, which reads
///writes reactive `$state` locals instead - same shape, same coupling). Per this task's brief,
// that method is NOT restructured into a pure helper just to make it testable - parity first.
// What IS already standalone, in both the old blob and this port, is the one static call that
// method makes for every note: `MidiNote.fromMidi(layer, time, midiNote.midi - (track.localOffset
// ?? offset), track.maxScaling)` (src/lib/core/Songs/SongClasses.ts - a plain static method with
// zero component coupling, ported long before this task and, until now, with zero consumers and
// zero test coverage). This suite calls that exact function the exact same way `convertMidi()`
// does, replicating its surrounding arithmetic inline (not importing anything from the component),
// against a small hand-built `@tonejs/midi` `Midi`/`Track` (via `midi.addTrack()` +
// `track.addNote(...)`, real library objects, not a hand-rolled fake shape).
//
// Game-dependent: `MIDI_BOUNDS` and the Song Grid differ between Genshin and Sky (see
// src/lib/games/{genshin,sky}/game.json), so every fixture number below is DERIVED from the real
// per-game data (via `findMidiInRange`/`MIDI_BOUNDS`) rather than hardcoded - this file runs green
// under both `npm run test:genshin` and `npm run test:sky`.
//
// ADR-0007 phase E: the per-game `midi.mapToNote` table this file used to read is gone, replaced
// by arithmetic over the Song Grid (noteIds.snapMidiToGrid / isAccidentalMidi). Its byte-parity
// against the shipped tables lives in test/configSurface.test.ts, which rebuilds the frozen v1
// surface's copy of them out of that arithmetic; what is checked here is the RULE.

function buildMidiNote(midiNumber: number): number {
    const midi = new Midi()
    const track = midi.addTrack()
    track.addNote({midi: midiNumber, time: 0, duration: 1, velocity: 1})
    return track.notes[0].midi
}

// Finds a real in-range midi number with the given accidental-ness - dynamic, not hardcoded, so
// this works against either game's own distinct grid.
function findMidiInRange(isAccidental: boolean): number {
    for (let midi = MIDI_BOUNDS.lower; midi <= MIDI_BOUNDS.upper; midi++) {
        if (isAccidentalMidi(midi) === isAccidental) return midi
    }
    throw new Error(`No ${isAccidental ? 'accidental' : 'non-accidental'} midi number in range`)
}

describe('MidiParser conversion math (MidiNote.fromMidi)', () => {
    it('snaps every in-range midi number to a nominal Note Id, never to a layout button', () => {
        const grid = new Set<number>(CANONICAL_NOTE_IDS)
        for (let midi = MIDI_BOUNDS.lower; midi <= MIDI_BOUNDS.upper; midi++) {
            const {id, isAccidental} = snapMidiToGrid(midi)
            //a grid ROW, not a position in one: the ids are the game's own canonical Note Ids
            expect(grid.has(id)).toBe(true)
            //an accidental snaps DOWN to the row below it, a natural stays where it is - which
            //for both shipped games' white-key grids is exactly `midi - (isAccidental ? 1 : 0)`
            expect(id).toBe(isAccidental ? midi - 1 : midi)
            expect(isAccidental).toBe(!grid.has(midi))
        }
    })

    it('counts accidentals via the game grid', () => {
        const accidentalMidi = buildMidiNote(findMidiInRange(true))
        const naturalMidi = buildMidiNote(findMidiInRange(false))

        const accidentalNote = MidiNote.fromMidi(0, 0, accidentalMidi, 0)
        const naturalNote = MidiNote.fromMidi(0, 0, naturalMidi, 0)

        expect(accidentalNote.data.isAccidental).toBe(true)
        expect(naturalNote.data.isAccidental).toBe(false)
    })

    it('flags notes outside MIDI_BOUNDS with the correct upper/lower direction', () => {
        const belowMidi = buildMidiNote(MIDI_BOUNDS.lower - 5)
        const aboveMidi = buildMidiNote(MIDI_BOUNDS.upper + 5)

        const belowNote = MidiNote.fromMidi(0, 0, belowMidi, 0)
        const aboveNote = MidiNote.fromMidi(0, 0, aboveMidi, 0)

        expect(belowNote.data.id).toBe(-1)
        expect(belowNote.data.outOfRangeBound).toBe(-1)
        expect(aboveNote.data.id).toBe(-1)
        expect(aboveNote.data.outOfRangeBound).toBe(1)
    })

    it('the maxScaling octave-shift loop transposes by REAL octaves (±12 — the pre-v4 ±8 was a deliberate fix, spec 2026-08-03 §7)', () => {
        // MIDI_BOUNDS.lower snaps to a real grid row in both games (it is the bottom row itself).
        const belowRangeMidi = buildMidiNote(MIDI_BOUNDS.lower - 12)
        const expectedNote = snapMidiToGrid(MIDI_BOUNDS.lower).id

        const unscaled = MidiNote.fromMidi(0, 0, belowRangeMidi, 0)
        const scaled = MidiNote.fromMidi(0, 0, belowRangeMidi, 1)

        expect(unscaled.data.outOfRangeBound).toBe(-1)
        expect(unscaled.data.id).toBe(-1)
        //one octave up lands exactly on the same pitch class, in range
        expect(scaled.data.outOfRangeBound).toBe(0)
        expect(scaled.data.id).toBe(expectedNote)

        //the note's file duration is carried for span conversion
        expect(MidiNote.fromMidi(0, 0, belowRangeMidi, 0, 750).durationMs).toBe(750)
    })

    it('a per-track localOffset overrides the global offset, exactly like `track.localOffset ?? offset`', () => {
        const rawMidi = buildMidiNote(MIDI_BOUNDS.lower)
        const expectedNote = snapMidiToGrid(MIDI_BOUNDS.lower).id

        // Mirrors convertMidi()'s own per-track/per-call inputs; only the offset resolution
        // (`track.localOffset ?? offset`) itself is copied inline below, matching the component
        // exactly rather than importing anything from it.
        const trackWithNoLocalOffset = {localOffset: null as number | null}
        const trackWithLocalOffsetZero = {localOffset: 0}
        const globalOffset = 8

        const usesGlobalOffset = MidiNote.fromMidi(0, 0, rawMidi - (trackWithNoLocalOffset.localOffset ?? globalOffset), 0)
        const usesLocalOffsetOverGlobal = MidiNote.fromMidi(0, 0, rawMidi - (trackWithLocalOffsetZero.localOffset ?? globalOffset), 0)
        const usesGlobalOffsetWhenZero = MidiNote.fromMidi(0, 0, rawMidi - (trackWithNoLocalOffset.localOffset ?? 0), 0)

        // No local offset -> the (nonzero) global offset is genuinely subtracted, pushing this
        // otherwise in-range note out of range.
        expect(usesGlobalOffset.data.id).toBe(-1)
        expect(usesGlobalOffset.data.outOfRangeBound).toBe(-1)

        // A per-track localOffset of 0 overrides the nonzero global offset entirely - 0 is a
        // meaningful override, not "absent" (exactly why the component uses `??`, not `||`, here).
        expect(usesLocalOffsetOverGlobal.data.id).toBe(expectedNote)
        expect(usesLocalOffsetOverGlobal.data.outOfRangeBound).toBe(0)

        // No local offset + a zero global offset -> unchanged, still in range.
        expect(usesGlobalOffsetWhenZero.data.id).toBe(expectedNote)
        expect(usesGlobalOffsetWhenZero.data.outOfRangeBound).toBe(0)
    })
})

// ─── the LIFT: which Note Number a snapped nominal becomes (importMidiTracks) ───────────────
// convertMidi's arithmetic IS extractable now - it lives in $core/Songs/midiImport, which is why
// this half of the file can call the whole pipeline rather than only the static above. What is
// pinned here is the step AFTER the snap: the snapped grid nominal goes back onto the absolute
// axis THROUGH THE LAYER'S OWN INSTRUMENT at that layer's Basepoint (ADR-0007's nominalToNumber),
// which the plain `nominal + offset(songPitch)` this used to be gets wrong twice over - it strands
// the rows a tuned instrument voices off-grid, and it ignores a per-layer Basepoint override
// entirely. Instruments are chosen by CAPABILITY, never by game id.

const notesOf = (name: string) => INSTRUMENTS_DATA[name as keyof typeof INSTRUMENTS_DATA].notes
/** Instruments with at least one Pitched Button tuned away from its Nominal Id (genshin: Vintage-Lyre). */
const TUNED = INSTRUMENTS.filter((name: string) =>
    notesOf(name).some(note => note.pitched && note.sounding !== note.midi))
/** An instrument whose two axes coincide, i.e. one the old bare arithmetic could not misplace. */
const UNTUNED = INSTRUMENTS.find((name: string) =>
    getSoundingTable(name).every((sounding, button) => sounding === getNoteIdTable(name)[button]))!

/**
 * Import one note per entry of `midis` onto a single layer, one per column (bpm 120, a beat
 * apart), and return the Note Numbers that came out in file order.
 */
function importOnto(layer: MidiImportLayer, songPitch: Pitch, midis: readonly number[]) {
    const result = importMidiTracks(
        [{
            notes: midis.map((midi, index) => ({midi, time: index * 0.5, duration: 0.1})),
            layer: 0,
            localOffset: null,
            maxScaling: 0,
        }],
        {bpm: 120, offset: 0, includeAccidentals: true, pitch: songPitch, layers: [layer]}
    )
    return {result, numbers: result.columns.flatMap(column => column.notes.map(note => note.id))}
}

describe.runIf(TUNED.length > 0)('importing onto a TUNED layer', () => {
    const name = TUNED[0]

    it('gives every row the pitch that layer actually sounds, stranding none of them', () => {
        //one file note per button of the instrument, at the grid row that button prints
        const {numbers, result} = importOnto({name, pitch: ''}, 'C', getNoteIdTable(name))
        //every note lands on the button whose row it was written for, so it sounds that button
        expect(numbers).toEqual([...getSoundingTable(name)])
        for (const number of numbers) expect(numberToButton(name, 'C', number)).not.toBe(-1)
        //the rows that used to come back silent: the ones this instrument tunes off the grid
        expect(numbers.some((number, button) => number !== getNoteIdTable(name)[button])).toBe(true)
        expect(result.merged).toBe(0)
    })
})

describe("importing onto a layer with its own Basepoint", () => {
    const override: Pitch = 'D'

    it('voices every row of a foreign file instead of stranding the ones the override moves off', () => {
        //a plain white-key file dropped onto a track pitched D: at that Basepoint the instrument
        //cannot sound its own C and F rows, so those two snap DOWN a semitone (what an accidental
        //does at C) - but nothing comes back silent, which is what ignoring the override did.
        const nominals = getNoteIdTable(UNTUNED)
        const {numbers, result} = importOnto({name: UNTUNED, pitch: override}, 'C', nominals)
        //the only notes it refuses are the ones that fall off the BOTTOM of the grid once the
        //override is taken off - at this Basepoint the lowest button already sounds above them,
        //and they are reported as out of range rather than placed silently
        const belowGrid = nominals.filter(
            nominal => nominal - basepointOffset(override) < MIDI_BOUNDS.lower
        ).length
        expect(result.outOfRange).toBe(belowGrid)
        expect(numbers.length).toBe(nominals.length - belowGrid)
        for (const number of numbers) expect(numberToButton(UNTUNED, override, number)).not.toBe(-1)
    })

    it("returns that track's own pitches unchanged", () => {
        //the same notes the track would EXPORT (its buttons carried by the override): the layer's
        //Basepoint comes off before the snap and goes back on after, so the trip is the identity
        const sounded = getNoteIdTable(UNTUNED).map(nominal => nominal + basepointOffset(override))
        const {numbers, result} = importOnto({name: UNTUNED, pitch: override}, 'C', sounded)
        expect(numbers).toEqual(sounded)
        expect(result.outOfRange).toBe(0)
        expect(result.accidentals).toBe(0)
    })
})
