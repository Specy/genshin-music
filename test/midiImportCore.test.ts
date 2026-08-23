import {describe, expect, it} from 'vitest'
import {CANONICAL_NOTE_IDS, INSTRUMENTS, INSTRUMENTS_DATA} from './imports'
import {isAccidentalMidi} from '$core/Songs/noteIds'
import {
    importMidiTracks,
    instrumentSupportsSustain,
    type MidiImportLayer,
    type MidiImportTrack,
} from '$core/Songs/midiImport'

const layers: MidiImportLayer[] = [{name: INSTRUMENTS[0], pitch: '', sustains: false}]

const track = (midis: readonly number[]): MidiImportTrack => ({
    notes: midis.map((midi, index) => ({midi, time: index, duration: 0.1})),
    layer: 0,
    localOffset: null,
    maxScaling: 0,
})

const convert = (tracks: readonly MidiImportTrack[], includeAccidentals = true) => importMidiTracks(tracks, {
    bpm: 120,
    offset: 0,
    includeAccidentals,
    pitch: 'C',
    layers,
})

describe('MIDI import accounting', () => {
    it('counts an accidental dropped by policy even when the early return has no columns', () => {
        const min = Math.min(...CANONICAL_NOTE_IDS)
        const max = Math.max(...CANONICAL_NOTE_IDS)
        const accidental = Array.from({length: max - min + 1}, (_, index) => min + index)
            .find(isAccidentalMidi)
        expect(accidental).toBeDefined()

        const result = convert([track([accidental!])], false)
        expect(result.columns).toEqual([])
        expect(result.totalNotes).toBe(1)
        expect(result.accidentals).toBe(1)
        expect(result.droppedAccidentals).toBe(1)
        expect(result.outOfRange).toBe(0)
    })

    it('keeps an out-of-range total per input track, with NaN in the total but no direction', () => {
        const result = convert([
            track([0, NaN]),
            track([127]),
        ])

        expect(result.totalNotes).toBe(3)
        expect(result.outOfRange).toBe(3)
        expect(result.perTrack[0]).toMatchObject({
            outOfRange: 2,
            outOfRangeLower: 1,
            outOfRangeUpper: 0,
        })
        expect(result.perTrack[1]).toMatchObject({
            outOfRange: 1,
            outOfRangeLower: 0,
            outOfRangeUpper: 1,
        })
        expect(result.perTrack[0].outOfRangeLower + result.perTrack[0].outOfRangeUpper)
            .toBeLessThan(result.perTrack[0].outOfRange)
    })

    it('accounts for every input as placed, out of range, merged, or accidental-dropped', () => {
        const natural = CANONICAL_NOTE_IDS[Math.floor(CANONICAL_NOTE_IDS.length / 2)]
        const accidental = Array.from({length: 12}, (_, distance) => natural + distance)
            .find(isAccidentalMidi)
        expect(accidental).toBeDefined()
        const input: MidiImportTrack = {
            notes: [
                {midi: natural, time: 0, duration: 0.1},
                {midi: natural, time: 0, duration: 0.1},
                {midi: accidental!, time: 1, duration: 0.1},
                {midi: 0, time: 2, duration: 0.1},
            ],
            layer: 0,
            localOffset: null,
            maxScaling: 0,
        }

        const result = convert([input], false)
        const placed = result.columns.reduce((count, column) => count + column.notes.length, 0)
        expect({placed, outOfRange: result.outOfRange, merged: result.merged,
            droppedAccidentals: result.droppedAccidentals}).toEqual({
            placed: 1,
            outOfRange: 1,
            merged: 1,
            droppedAccidentals: 1,
        })
        expect(placed + result.outOfRange + result.merged + result.droppedAccidentals)
            .toBe(result.totalNotes)
    })
})

describe('instrumentSupportsSustain', () => {
    it('resolves an unknown name through the default instrument before reading capability', () => {
        const defaultData = INSTRUMENTS_DATA[INSTRUMENTS[0] as keyof typeof INSTRUMENTS_DATA]
        const sustaining = Object.values(INSTRUMENTS_DATA)
            .find(data => data.sustain !== undefined && data.sustain.loopMode !== 'one-shot')
        expect(sustaining?.sustain).toBeDefined()

        //Both live defaults happen to be tap instruments. Borrow a real sustaining config for
        //this assertion so a missing-name implementation that simply returns false cannot pass
        //by coincidence; restore the build-time config immediately afterwards.
        const hadSustain = Object.prototype.hasOwnProperty.call(defaultData, 'sustain')
        const previous = defaultData.sustain
        Reflect.set(defaultData, 'sustain', sustaining!.sustain)
        try {
            expect(instrumentSupportsSustain(INSTRUMENTS[0])).toBe(true)
            expect(instrumentSupportsSustain('__missing_midi_instrument__')).toBe(true)
        } finally {
            if (hadSustain) Reflect.set(defaultData, 'sustain', previous)
            else Reflect.deleteProperty(defaultData, 'sustain')
        }
    })
})
