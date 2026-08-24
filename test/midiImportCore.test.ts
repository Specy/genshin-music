import {describe, expect, it} from 'vitest'
import {CANONICAL_NOTE_IDS, INSTRUMENTS, INSTRUMENTS_DATA} from './imports'
import {
    addressableSpan,
    basepointOffset,
    foldNumberIntoRange,
    getSoundingTable,
    isAccidentalMidi,
    nominalToNumber,
    numberToButton,
    snapMidiToGridPeriodically,
} from '$core/Songs/noteIds'
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
            // -1 is a legitimate periodic B, not the bounded snap's old invalid sentinel.
            track([-1, NaN]),
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

    it('drops instrument-unvoiceable notes by default and keeps them only when requested', () => {
        const instrument = INSTRUMENTS[0]
        const span = addressableSpan()
        const sounding = getSoundingTable(instrument)
        const min = Math.min(...sounding)
        const max = Math.max(...sounding)
        const candidate = Array.from(
            {length: span.max - span.min + 1},
            (_, index) => span.min + index
        ).find(midi => {
            const snapped = snapMidiToGridPeriodically(midi)
            const number = nominalToNumber(instrument, 'C', snapped.id)
            return (
                !snapped.isAccidental &&
                number >= span.min &&
                number <= span.max &&
                numberToButton(instrument, 'C', number) === -1 &&
                (number < min || number > max)
            )
        })
        expect(candidate).toBeDefined()

        const input = [track([candidate!])]
        const common = {
            bpm: 120,
            offset: 0,
            includeAccidentals: true,
            pitch: 'C' as const,
            layers,
        }
        const omitted = importMidiTracks(input, common)
        const excluded = importMidiTracks(input, {...common, includeOutOfRange: false})
        const included = importMidiTracks(input, {...common, includeOutOfRange: true})

        expect(omitted.columns).toEqual([])
        expect(excluded.columns).toEqual([])
        expect(omitted.outOfRange).toBe(1)
        expect(excluded.outOfRange).toBe(1)
        expect(included.outOfRange).toBe(1)
        const includedNotes = included.columns.flatMap(column => column.notes)
        expect(includedNotes).toHaveLength(1)
        expect(numberToButton(instrument, 'C', includedNotes[0].id)).toBe(-1)
        expect(included.perTrack[0]).toMatchObject({
            outOfRange: 1,
            outOfRangeLower: includedNotes[0].id < min ? 1 : 0,
            outOfRangeUpper: includedNotes[0].id > max ? 1 : 0,
        })
    })

    it('never keeps notes outside the Addressable Span, even when strands are included', () => {
        const span = addressableSpan()
        const result = importMidiTracks([track([span.min - 12, span.max + 12])], {
            bpm: 120,
            offset: 0,
            includeAccidentals: true,
            includeOutOfRange: true,
            pitch: 'C',
            layers,
        })

        expect(result.columns).toEqual([])
        expect(result.outOfRange).toBe(2)
        expect(result.perTrack[0]).toMatchObject({
            outOfRange: 2,
            outOfRangeLower: 1,
            outOfRangeUpper: 1,
        })
    })

    it('applies the accidental gate before out-of-range accounting', () => {
        const span = addressableSpan()
        const accidentalOutside = Array.from({length: 12}, (_, distance) => span.min - 1 - distance)
            .find(isAccidentalMidi)
        expect(accidentalOutside).toBeDefined()

        const rejected = convert([track([accidentalOutside!])], false)
        const admittedToVoiceability = convert([track([accidentalOutside!])], true)

        expect(rejected).toMatchObject({
            totalNotes: 1,
            accidentals: 1,
            droppedAccidentals: 1,
            outOfRange: 0,
        })
        expect(admittedToVoiceability).toMatchObject({
            totalNotes: 1,
            accidentals: 1,
            droppedAccidentals: 0,
            outOfRange: 1,
        })
    })

    const gapped = INSTRUMENTS.flatMap(instrument => {
        const sounding = getSoundingTable(instrument)
        const min = Math.min(...sounding)
        const max = Math.max(...sounding)
        for (let midi = Math.ceil(min); midi <= Math.floor(max); midi++) {
            const snapped = snapMidiToGridPeriodically(midi)
            const number = nominalToNumber(instrument, 'C', snapped.id)
            if (
                !snapped.isAccidental &&
                number >= min &&
                number <= max &&
                numberToButton(instrument, 'C', number) === -1
            ) {
                return [{instrument, midi, number}]
            }
        }
        return []
    })[0]

    it.runIf(gapped !== undefined)('counts an internal instrument gap without inventing a direction', () => {
        const gapLayers: MidiImportLayer[] = [{name: gapped!.instrument, pitch: '', sustains: false}]
        const dropped = importMidiTracks([track([gapped!.midi])], {
            bpm: 120,
            offset: 0,
            includeAccidentals: true,
            pitch: 'C',
            layers: gapLayers,
        })
        const kept = importMidiTracks([track([gapped!.midi])], {
            bpm: 120,
            offset: 0,
            includeAccidentals: true,
            includeOutOfRange: true,
            pitch: 'C',
            layers: gapLayers,
        })

        expect(dropped.columns).toEqual([])
        expect(dropped.perTrack[0]).toMatchObject({
            outOfRange: 1,
            outOfRangeLower: 0,
            outOfRangeUpper: 0,
        })
        expect(kept.columns.flatMap(column => column.notes).map(note => note.id))
            .toEqual([gapped!.number])
        expect(kept.perTrack[0]).toMatchObject({
            outOfRange: 1,
            outOfRangeLower: 0,
            outOfRangeUpper: 0,
        })
    })

    const subOctave = INSTRUMENTS.find(instrument => {
        const sounding = getSoundingTable(instrument)
        return Math.max(...sounding) - Math.min(...sounding) < 12
    })

    it.runIf(subOctave !== undefined)('uses the stable capped fold in the production import path', () => {
        const sounding = getSoundingTable(subOctave!)
        const input = Math.max(...sounding) + 13
        const expectedFold = foldNumberIntoRange(subOctave!, 'C', input, 1)
        const expected = nominalToNumber(
            subOctave!,
            'C',
            snapMidiToGridPeriodically(expectedFold).id
        )
        const subOctaveLayers: MidiImportLayer[] = [
            {name: subOctave!, pitch: '', sustains: false},
        ]
        const imported = (maxScaling: number) => importMidiTracks(
            [{...track([input]), maxScaling}],
            {
                bpm: 120,
                offset: 0,
                includeAccidentals: true,
                includeOutOfRange: true,
                pitch: 'C',
                layers: subOctaveLayers,
            }
        ).columns.flatMap(column => column.notes.map(note => note.id))

        expect(imported(1)).toEqual([expected])
        expect(imported(4)).toEqual([expected])
    })

    it('adapts a non-C Basepoint to the fold axis exactly once', () => {
        const instrument = INSTRUMENTS[0]
        const pitch = 'D'
        const max = Math.max(...getSoundingTable(instrument))
        const input = max + basepointOffset(pitch) + 12
        const expected = input - 12
        const result = importMidiTracks(
            [{...track([input]), maxScaling: 1}],
            {
                bpm: 120,
                offset: 0,
                includeAccidentals: true,
                includeOutOfRange: true,
                pitch,
                layers: [{name: instrument, pitch: '', sustains: false}],
            }
        )

        expect(snapMidiToGridPeriodically(max)).toMatchObject({id: max, isAccidental: false})
        expect(expected).toBeLessThanOrEqual(addressableSpan().max)
        expect(result.columns.flatMap(column => column.notes.map(note => note.id)))
            .toEqual([expected])
    })

    it('treats a per-track zero offset as fixed instead of falling back to the global offset', () => {
        const instrument = INSTRUMENTS[0]
        const sounding = [...getSoundingTable(instrument)].sort((a, b) => a - b)
        const upper = sounding.find((number, index) => index > 0 && number - sounding[index - 1] === 2)
        expect(upper).toBeDefined()

        const importWith = (localOffset: number | null) => importMidiTracks(
            [{...track([upper!]), localOffset}],
            {
                bpm: 120,
                offset: 1,
                includeAccidentals: true,
                pitch: 'C',
                layers,
            }
        ).columns.flatMap(column => column.notes.map(note => note.id))

        expect(importWith(0)).toEqual([upper])
        expect(importWith(null)).not.toEqual([upper])
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
