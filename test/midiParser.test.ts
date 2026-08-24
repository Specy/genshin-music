import {describe, expect, it} from 'vitest'
import {INSTRUMENTS, INSTRUMENTS_DATA} from './imports'
import {
    basepointOffset,
    getNoteIdTable,
    getSoundingTable,
    nominalToNumber,
    numberToButton,
    snapMidiToGridPeriodically,
} from '$core/Songs/noteIds'
import {importMidiTracks, type MidiImportLayer} from '$core/Songs/midiImport'
import type {Pitch} from '$core/legacyConfig'


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
        //The only notes it refuses are those the chosen instrument cannot voice after the same
        //Basepoint-aware periodic snap. Song Grid display bounds are deliberately not the oracle.
        const transformed = nominals.map(nominal => nominalToNumber(
            UNTUNED,
            override,
            snapMidiToGridPeriodically(nominal - basepointOffset(override)).id
        ))
        const unvoiceable = transformed.filter(
            number => numberToButton(UNTUNED, override, number) === -1
        ).length
        expect(result.outOfRange).toBe(unvoiceable)
        expect(numbers.length).toBe(nominals.length - unvoiceable)
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
