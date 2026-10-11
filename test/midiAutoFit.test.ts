// Per-track fitting (suggestTrackFit) and medley section detection (detectMidiSections).
import {describe, expect, it} from 'vitest'
import {INSTRUMENTS, PITCHES} from './imports'
import {suggestTrackFit} from '../src/lib/core/Songs/midiImport'
import {detectMidiSections} from '../src/lib/core/Songs/midiSections'
import {getSoundingTable} from '../src/lib/core/Songs/noteIds'
import type {Pitch} from '../src/lib/core/legacyConfig'

const instrument = INSTRUMENTS[0]
const notes = (midis: number[]) => midis.map(midi => ({midi}))
const majorScale = (root: number, octaves = 2) => {
    const steps = [0, 2, 4, 5, 7, 9, 11]
    const out: number[] = []
    for (let o = 0; o < octaves; o++) for (const s of steps) out.push(root + o * 12 + s)
    out.push(root + octaves * 12)
    return out
}

describe('suggestTrackFit', () => {
    const lowest = Math.min(...getSoundingTable(instrument))

    it('keeps a track that already fits untouched', () => {
        const fit = suggestTrackFit(notes(majorScale(lowest)), instrument, 'C', 0, PITCHES)
        expect(fit).toMatchObject({pitch: 'C', localOffset: 0, accidentals: 0, stranded: 0})
    })

    it('moves the SCALE, not the notes, for a melody in another key', () => {
        // D major over the same span: only a D Basepoint plays it without accidentals
        const fit = suggestTrackFit(notes(majorScale(lowest + 2)), instrument, 'C', 0, PITCHES)
        expect(fit.pitch).toBe('D')
        expect(fit.accidentals).toBe(0)
        expect(fit.stranded).toBe(0)
        expect(fit.localOffset % 12).toBe(0)
    })

    it('moves whole octaves to bring a line that sits too low onto the buttons', () => {
        const fit = suggestTrackFit(notes(majorScale(lowest - 24, 1)), instrument, 'C', 0, PITCHES)
        expect(fit.stranded).toBe(0)
        expect(fit.localOffset).toBeLessThan(0)
        expect(Math.abs(fit.localOffset) % 12).toBe(0)
    })

    it('prefers the song Basepoint on a tie', () => {
        // a single note is playable at many Basepoints; the song's own one must win
        const songPitch: Pitch = 'G'
        const fit = suggestTrackFit(notes([lowest + 7]), instrument, songPitch, 0, PITCHES)
        expect(fit.pitch).toBe(songPitch)
        expect(fit.localOffset).toBe(0)
    })
})

describe('detectMidiSections', () => {
    // 1 tick = 1 ms, to keep the header trivial
    const header = (tempos: [number, number][], keys: [number, string, string?][]) => ({
        tempos: tempos.map(([ticks, bpm]) => ({ticks, bpm})),
        keySignatures: keys.map(([ticks, key, scale]) => ({ticks, key, scale: scale ?? 'major'})),
        ticksToSeconds: (ticks: number) => ticks / 1000,
    })

    it('returns one section for a file without changes', () => {
        const sections = detectMidiSections(header([[0, 120]], [[0, 'C']]), 90)
        expect(sections).toHaveLength(1)
        expect(sections[0]).toMatchObject({start: 0, end: 90, bpm: 120, key: 'C'})
    })

    it('splits a medley at a key + tempo change', () => {
        const sections = detectMidiSections(header([[0, 104], [60000, 156]], [[0, 'F'], [60000, 'C']]), 150)
        expect(sections.map(s => [s.start, s.end, s.bpm, s.key])).toEqual([
            [0, 60, 104, 'F'],
            [60, 150, 156, 'C'],
        ])
    })

    it('ignores a ritardando and folds a short transition into its neighbour', () => {
        const sections = detectMidiSections(
            header([[0, 120], [58000, 100], [59000, 80], [60000, 120], [100000, 70]], [[0, 'G']]),
            160
        )
        // the rit at 58-60s does not hold for 6 s: no boundary; the 70 bpm change at 100 s does
        expect(sections.map(s => s.start)).toEqual([0, 100])
        expect(sections[0].bpm).toBe(120)
    })
})
