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
import {Midi as MidiConstructor} from '$core/Songs/midiConstructor'
import {canonicalMidiPitch} from '$cmp/pages/Composer/MidiParser/midiPitch'


/** A format-0 MIDI assembled as bytes so the key-signature byte is unquestionably valid input. */
function rawMajorKeyMidi(sharpsOrFlats: number, tonic: number): ArrayBuffer {
    const track = [
        0x00, 0xff, 0x59, 0x02, sharpsOrFlats & 0xff, 0x00,
        0x00, 0x90, tonic, 0x40,
        0x60, 0x80, tonic, 0x00,
        0x00, 0xff, 0x2f, 0x00,
    ]
    const bytes = new Uint8Array([
        0x4d, 0x54, 0x68, 0x64,
        0x00, 0x00, 0x00, 0x06,
        0x00, 0x00,
        0x00, 0x01,
        0x00, 0x60,
        0x4d, 0x54, 0x72, 0x6b,
        0x00, 0x00, 0x00, track.length,
        ...track,
    ])
    return bytes.buffer as ArrayBuffer
}

describe('MIDI key-signature Basepoints', () => {
    it.each([
        [-7, 'Cb', 'B', 59],
        [0, 'C', 'C', 60],
        [6, 'F#', 'Gb', 66],
        [7, 'C#', 'Db', 61],
    ] as const)(
        'normalizes raw major-key event %i (%s) to %s',
        (keyByte, spelling, expected, tonic) => {
            const midi = new MidiConstructor(rawMajorKeyMidi(keyByte, tonic))
            expect(midi.header.keySignatures[0]?.key).toBe(spelling)
            expect(midi.tracks[0].notes[0].midi).toBe(tonic)
            expect(canonicalMidiPitch(midi.header.keySignatures[0]?.key)).toBe(expected)
        }
    )

    it('leaves absent or unknown keys to metadata and default fallback', () => {
        expect(canonicalMidiPitch(undefined)).toBeUndefined()
        expect(canonicalMidiPitch('not-a-key')).toBeUndefined()
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
    notesOf(name).some(note => note.pitched && note.sounding !== note.nominal))
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
