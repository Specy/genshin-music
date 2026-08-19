// Spec §4's four rewrites, table-driven and UNWIRED (phase B). Same config-derived,
// never-branch-on-the-game rule as noteNumbers.test.ts: instrument roles (tuned, narrow,
// wide) are found by capability, and the named-instrument rows are guarded by roster
// presence so they pin real audited numbers on the build that ships them.
import {describe, expect, it} from 'vitest'
import {CANONICAL_NOTE_IDS, INSTRUMENTS, INSTRUMENTS_DATA, PITCHES, RecordedNote} from './imports'
import type {ColumnNote} from './imports'
import {
    basepointOffset, getNoteIdTable, getSoundingTable, numberToButton,
} from '../src/lib/core/Songs/noteIds'
import {
    basepointDelta, migrateTrackNotes, rewriteForBasepoint, rewriteForSwap,
    rewriteNumbersForBasepoint,
} from '../src/lib/core/Songs/noteNumberTransforms'
import type {Pitch} from '../src/lib/core/legacyConfig'

const notesOf = (name: string) => INSTRUMENTS_DATA[name as keyof typeof INSTRUMENTS_DATA].notes
const TUNED = INSTRUMENTS.filter((name: string) =>
    notesOf(name).some(note => note.pitched && note.sounding !== note.midi))
const UNTUNED = INSTRUMENTS.find((name: string) =>
    getSoundingTable(name).every((sounding, button) => sounding === getNoteIdTable(name)[button]))!
/** The widest instrument (the swap's "grows the range" side) and a strictly sub-grid one. */
const WIDE = INSTRUMENTS.reduce((widest: string, name: string) =>
    getNoteIdTable(name).length > getNoteIdTable(widest).length ? name : widest, INSTRUMENTS[0])
const NARROW = INSTRUMENTS.find((name: string) =>
    CANONICAL_NOTE_IDS.some(id => !getNoteIdTable(name).includes(id)))!
const ALL_PITCHES = PITCHES as readonly Pitch[]

describe('basepointDelta', () => {
    // [old, new, delta] — the interval is a raw PITCHES-index difference, never folded
    const CASES: [Pitch, Pitch, number][] = [
        ['C', 'C', 0],
        ['C', 'Db', 1],
        ['C', 'B', 11],
        ['B', 'C', -11],
        ['D', 'G', 5],
        ['G', 'D', -5],
        ['Bb', 'B', 1],
        ['B', 'Bb', -1],
    ]

    it.each(CASES)('%s -> %s is %i semitones', (from, to, delta) => {
        expect(basepointDelta(from, to)).toBe(delta)
    })

    it('is the difference of the two Basepoint offsets, for every pair', () => {
        for (const from of ALL_PITCHES) {
            for (const to of ALL_PITCHES) {
                expect(basepointDelta(from, to)).toBe(basepointOffset(to) - basepointOffset(from))
                //the two directions cancel exactly, which is what makes an undo a rewrite back
                expect(basepointDelta(from, to) + basepointDelta(to, from)).toBe(0)
            }
        }
    })

    it('never folds a downward move into an upward one', () => {
        //B -> C is eleven semitones DOWN: the notes follow the view down, they do not jump
        //an octave up. Folding would silently transpose a whole track.
        expect(basepointDelta('B', 'C')).toBe(-11)
        expect(basepointDelta('B', 'C')).not.toBe(1)
    })
})

describe('rewriteForBasepoint', () => {
    const columnNote = (id: number): ColumnNote => ({trackIndex: 0, id, span: 1})

    it('moves composed and recorded notes alike, in place, by the delta', () => {
        const composed = [columnNote(72), columnNote(60)]
        const recorded = [new RecordedNote(72, 100, 0, 0), new RecordedNote(60, 350, 250, 1)]
        rewriteForBasepoint(composed, basepointDelta('C', 'D'))
        rewriteForBasepoint(recorded, basepointDelta('C', 'D'))
        expect(composed.map(n => n.id)).toEqual([74, 62])
        expect(recorded.map(n => n.id)).toEqual([74, 62])
        //everything that is not the number is untouched
        expect(composed.map(n => n.span)).toEqual([1, 1])
        expect(recorded.map(n => [n.time, n.duration, n.trackIndex])).toEqual([[100, 0, 0], [350, 250, 1]])
    })

    it('moves DOWN on a negative delta and does nothing on zero', () => {
        const notes = [columnNote(72)]
        rewriteForBasepoint(notes, basepointDelta('B', 'C'))
        expect(notes[0].id).toBe(61)
        rewriteForBasepoint(notes, basepointDelta('C', 'C'))
        expect(notes[0].id).toBe(61)
    })

    it('carries Stranded Notes along with the rest of the track', () => {
        //a number no instrument in the game voices still moves: the Basepoint is part of
        //what it means, and a note left behind would drift against its neighbours
        const stranded = Math.max(...CANONICAL_NOTE_IDS) + 1000
        const notes = [columnNote(stranded)]
        rewriteForBasepoint(notes, basepointDelta('C', 'Eb'))
        expect(notes[0].id).toBe(stranded + 3)
    })

    it('is exactly reversible, which is what makes the undo snapshot a rewrite back', () => {
        const notes = [columnNote(72), columnNote(60), columnNote(48)]
        rewriteForBasepoint(notes, basepointDelta('C', 'Ab'))
        rewriteForBasepoint(notes, basepointDelta('Ab', 'C'))
        expect(notes.map(n => n.id)).toEqual([72, 60, 48])
    })

    it('returns a NEW array for bare number lists (VSRG hit objects assign, never mutate)', () => {
        const numbers = [72, 60]
        const moved = rewriteNumbersForBasepoint(numbers, basepointDelta('C', 'D'))
        expect(moved).toEqual([74, 62])
        expect(numbers).toEqual([72, 60])
        expect(rewriteNumbersForBasepoint(numbers, 0)).not.toBe(numbers)
    })
})

describe('rewriteForSwap', () => {
    // The whole rule in one table: swap the widest instrument's entire keyboard onto EVERY
    // instrument this game ships, at three Basepoints, and check each note against the
    // nominal correspondence by hand.
    it.each(['C', 'G', 'B'] as Pitch[])('preserves the BUTTON, not the sound, onto every instrument (Basepoint %s)', (pitch) => {
        const offset = basepointOffset(pitch)
        const numbers = getSoundingTable(WIDE).map(sounding => sounding + offset)
        for (const target of INSTRUMENTS) {
            const swapped = rewriteForSwap(numbers, WIDE, target, pitch)
            swapped.forEach((number, button) => {
                const nominal = getNoteIdTable(WIDE)[button]
                const targetButton = getNoteIdTable(target).indexOf(nominal)
                if (targetButton === -1) {
                    //no button of the same nominal: unchanged, and now stranded there
                    expect(number).toBe(numbers[button])
                    return
                }
                expect(number).toBe(getSoundingTable(target)[targetButton] + offset)
                expect(numberToButton(target, pitch, number))
                    .toBe(getSoundingTable(target).indexOf(getSoundingTable(target)[targetButton]))
            })
        }
    })

    it.runIf(TUNED.length > 0)('re-flavors onto a tuned instrument instead of stranding', () => {
        //the behavior users rely on (Lyre -> Vintage-Lyre): the D button becomes the Db
        //button — same key, different pitch — where a sound-preserving swap would strand it
        const tuned = TUNED[0]
        const reflavored = notesOf(tuned).find(note => note.pitched && note.sounding !== note.midi)!
        const button = getNoteIdTable(tuned).indexOf(reflavored.midi)
        for (const pitch of ALL_PITCHES) {
            const offset = basepointOffset(pitch)
            const [swapped] = rewriteForSwap([reflavored.midi + offset], UNTUNED, tuned, pitch)
            expect(swapped).toBe(reflavored.sounding + offset)
            expect(numberToButton(tuned, pitch, swapped)).toBe(button)
        }
    })

    it.runIf(TUNED.length > 0)('swaps a tuned number back off the tuned instrument by its nominal', () => {
        const tuned = TUNED[0]
        const reflavored = notesOf(tuned).find(note => note.pitched && note.sounding !== note.midi)!
        const [swapped] = rewriteForSwap([reflavored.sounding], tuned, UNTUNED, 'C')
        expect(swapped).toBe(reflavored.midi)
    })

    it('passes a number stranded on the OLD instrument through unchanged', () => {
        //nothing to correspond FROM: the note keeps its place rather than being invented onto
        //some button of the new instrument
        const stranded = CANONICAL_NOTE_IDS.find(id => !getNoteIdTable(NARROW).includes(id))!
        expect(numberToButton(NARROW, 'C', stranded)).toBe(-1)
        expect(rewriteForSwap([stranded], NARROW, WIDE, 'C')).toEqual([stranded])
    })

    it('lets a passed-through number UN-STRAND on the new instrument', () => {
        const stranded = CANONICAL_NOTE_IDS.find(id =>
            !getNoteIdTable(NARROW).includes(id) && getNoteIdTable(WIDE).includes(id))!
        const [swapped] = rewriteForSwap([stranded], NARROW, WIDE, 'C')
        expect(swapped).toBe(stranded)
        expect(numberToButton(WIDE, 'C', swapped)).toBeGreaterThanOrEqual(0)
    })

    it('leaves a number the new instrument has no button for unchanged, now stranded', () => {
        const dropped = getNoteIdTable(WIDE).find(id => !getNoteIdTable(NARROW).includes(id))!
        const [swapped] = rewriteForSwap([dropped], WIDE, NARROW, 'C')
        expect(swapped).toBe(dropped)
        expect(numberToButton(NARROW, 'C', swapped)).toBe(-1)
    })

    it('is not a transposition: the same Basepoint offset comes off and goes back on', () => {
        const offset = basepointOffset('G')
        const number = getSoundingTable(WIDE)[0] + offset
        const [swapped] = rewriteForSwap([number], WIDE, UNTUNED, 'G')
        expect(swapped - offset).toBe(getSoundingTable(UNTUNED)[getNoteIdTable(UNTUNED).indexOf(getNoteIdTable(WIDE)[0])])
    })

    it('returns a new array and never mutates its input', () => {
        const numbers = [getSoundingTable(WIDE)[0]]
        const swapped = rewriteForSwap(numbers, WIDE, UNTUNED, 'C')
        expect(swapped).not.toBe(numbers)
        expect(numbers).toEqual([getSoundingTable(WIDE)[0]])
    })
})

describe('migrateTrackNotes', () => {
    it('lifts every playable old id to what it already sounded, at every Basepoint', () => {
        for (const name of INSTRUMENTS) {
            for (const pitch of ALL_PITCHES) {
                const ids = getNoteIdTable(name)
                const migrated = migrateTrackNotes(ids, name, pitch)
                expect(migrated).toEqual(getSoundingTable(name).map(s => s + basepointOffset(pitch)))
                //the audible proof: same button, so the same sample at the same rate
                migrated.forEach((number, button) => {
                    expect(numberToButton(name, pitch, number)).toBe(button)
                })
            }
        }
    })

    it.runIf(TUNED.length > 0)('records the tuned pitch a file only ever implied', () => {
        const tuned = TUNED[0]
        const reflavored = notesOf(tuned).find(note => note.pitched && note.sounding !== note.midi)!
        expect(migrateTrackNotes([reflavored.midi], tuned, 'C')).toEqual([reflavored.sounding])
        //the per-track Basepoint override is what the file's playback used, so it is what
        //the migration adds — a track at 'D' migrates two semitones higher than one at 'C'
        expect(migrateTrackNotes([reflavored.midi], tuned, 'D')).toEqual([reflavored.sounding + 2])
    })

    it('migrates a stranded id best-effort as id + offset', () => {
        const stranded = CANONICAL_NOTE_IDS.find(id => !getNoteIdTable(NARROW).includes(id))!
        for (const pitch of ALL_PITCHES) {
            expect(migrateTrackNotes([stranded], NARROW, pitch)).toEqual([stranded + basepointOffset(pitch)])
        }
        //including one no game grid ever had
        const nonsense = Math.max(...CANONICAL_NOTE_IDS) + 1000
        expect(migrateTrackNotes([nonsense], NARROW, 'Eb')).toEqual([nonsense + 3])
    })

    it('keeps a stranded id\'s position relative to its playable neighbours', () => {
        const [low, high] = [getNoteIdTable(NARROW)[0], getNoteIdTable(NARROW)[1]]
        const stranded = CANONICAL_NOTE_IDS.find(id => !getNoteIdTable(NARROW).includes(id))!
        const migrated = migrateTrackNotes([low, stranded, high], NARROW, 'F')
        expect(migrated[1] - stranded).toBe(basepointOffset('F'))
    })

    it.runIf(TUNED.length > 0)('may UN-STRAND a best-effort migration on a tuned instrument, by design', () => {
        //the accepted consequence of `id + offset` (ADR-0007): a nominal the tuned
        //instrument never had can equal another button's Sounding Pitch, so a note that was
        //silent starts sounding the pitch its stored number now names. Pinned here so the
        //phase-C parity suite is never asked to prove the opposite — parity songs must not
        //put a Stranded Note on a tuned track.
        const tuned = TUNED[0]
        const soundingOnly = getSoundingTable(tuned).find(sounding =>
            !getNoteIdTable(tuned).includes(sounding))
        if (soundingOnly === undefined) return
        expect(numberToButton(tuned, 'C', soundingOnly)).toBeGreaterThanOrEqual(0)
        const [migrated] = migrateTrackNotes([soundingOnly], tuned, 'C')
        expect(migrated).toBe(soundingOnly)
    })

    it('returns a new array and never mutates its input', () => {
        const ids = [getNoteIdTable(UNTUNED)[0]]
        const migrated = migrateTrackNotes(ids, UNTUNED, 'D')
        expect(migrated).not.toBe(ids)
        expect(ids).toEqual([getNoteIdTable(UNTUNED)[0]])
    })
})
