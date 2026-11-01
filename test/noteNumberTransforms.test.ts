// Spec §4's four rewrites, table-driven and UNWIRED (phase B). Same config-derived,
// never-branch-on-the-game rule as noteNumbers.test.ts: instrument roles (tuned, narrow,
// wide) are found by capability, and the named-instrument rows are guarded by roster
// presence so they pin real audited numbers on the build that ships them.
import {describe, expect, it} from 'vitest'
import {CANONICAL_NOTE_IDS, INSTRUMENTS, INSTRUMENTS_DATA, PITCHES, RecordedNote} from './imports'
import type {ColumnNote} from './imports'
import {
    addressableSpan, basepointOffset, getNoteIdTable, getSoundingTable, gridRowForNumber, nominalToNumber,
    numberToButton, numberToNominal, registerShift, songGridSlotForId, strandedRow,
} from '../src/lib/core/Songs/noteIds'
import {
    basepointDelta, migrateTrackNotes, rewriteForBasepoint, rewriteForSwap,
    rewriteNumbersForBasepoint,
} from '../src/lib/core/Songs/noteNumberTransforms'
import type {Pitch} from '../src/lib/core/legacyConfig'

const notesOf = (name: string) => INSTRUMENTS_DATA[name as keyof typeof INSTRUMENTS_DATA].notes
const TUNED = INSTRUMENTS.filter((name: string) =>
    notesOf(name).some(note => note.pitched && note.sounding !== note.nominal))
const UNTUNED = INSTRUMENTS.find((name: string) =>
    getSoundingTable(name).every((sounding, button) => sounding === getNoteIdTable(name)[button]))!
/** The widest instrument (the swap's "grows the range" side) and a strictly sub-grid one. */
const WIDE = INSTRUMENTS.reduce((widest: string, name: string) =>
    getNoteIdTable(name).length > getNoteIdTable(widest).length ? name : widest, INSTRUMENTS[0])
const NARROW = INSTRUMENTS.find((name: string) =>
    CANONICAL_NOTE_IDS.some(id => !getNoteIdTable(name).includes(id))
    //...and untuned, so the grid nominals these rows pass around ARE Note Numbers
    && getSoundingTable(name).every((s, b) => s === getNoteIdTable(name)[b]))!
const ALL_PITCHES = PITCHES as readonly Pitch[]
/** Tuned by per-button flavor and NOT by a register - genshin's Vintage-Lyre. */
const FLAVORED = TUNED.filter((name: string) => registerShift(name) === 0)
/** Translated by a register - sky's Contrabass, Cello, handpans… */
const REGISTERED = INSTRUMENTS.filter((name: string) => registerShift(name) !== 0)
/**
 * Every button's Sounding Pitch is its nominal moved by the register and nothing else: no
 * per-button flavor. Between two of these an instrument swap is a bijection (rewriteForSwap).
 */
const RIGID = INSTRUMENTS.filter((name: string) =>
    getSoundingTable(name).every((sounding, button) => sounding === getNoteIdTable(name)[button] + registerShift(name)))

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
                    //no button of the same nominal: carried by the target's REGISTER onto the row
                    //it was on, and stranded there - never left on a number some other key of a
                    //registered target sounds (registerShift says why). Without a register on
                    //either side that is the number itself, unchanged
                    expect(number).toBe(nominal + registerShift(target) + offset)
                    expect(numberToButton(target, pitch, number)).toBe(-1)
                    expect(gridRowForNumber(target, pitch, number)).toEqual({
                        row: songGridSlotForId(nominal), stranded: true, accidental: 0,
                    })
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
        const reflavored = notesOf(tuned).find(note => note.pitched && note.sounding !== note.nominal)!
        const button = getNoteIdTable(tuned).indexOf(reflavored.nominal)
        for (const pitch of ALL_PITCHES) {
            const offset = basepointOffset(pitch)
            const [swapped] = rewriteForSwap([reflavored.nominal + offset], UNTUNED, tuned, pitch)
            expect(swapped).toBe(reflavored.sounding + offset)
            expect(numberToButton(tuned, pitch, swapped)).toBe(button)
        }
    })

    it.runIf(TUNED.length > 0)('swaps a tuned number back off the tuned instrument by its nominal', () => {
        const tuned = TUNED[0]
        const reflavored = notesOf(tuned).find(note => note.pitched && note.sounding !== note.nominal)!
        const [swapped] = rewriteForSwap([reflavored.sounding], tuned, UNTUNED, 'C')
        expect(swapped).toBe(reflavored.nominal)
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

    // THE REVERSIBILITY RULE (user report 2026-11-01): a Piano song at Gb swapped to a handpan and
    // back lost every C4/F4/G4 an octave up, because the handpan's register made the number a note
    // was "left unchanged" at the Sounding Pitch of the key an octave away. Stated for every pair
    // the build ships rather than for the two instruments of the report.
    it('restores every number when a swap between two rigid instruments is swapped back, at every Basepoint', () => {
        for (const a of RIGID) {
            //every row a track on `a` can hold: its buttons, and the grid rows it has no key for
            //(ROW strands, carried by its own register - noteIds.strandedRow)
            const rows = [...new Set([...getNoteIdTable(a), ...CANONICAL_NOTE_IDS])]
            for (const b of RIGID) {
                for (const pitch of ALL_PITCHES) {
                    const numbers = rows.map(nominal => nominalToNumber(a, pitch, nominal))
                    const there = rewriteForSwap(numbers, a, b, pitch)
                    expect(rewriteForSwap(there, b, a, pitch)).toEqual(numbers)
                    //and nothing collapsed on the way: a bijection merges no notes
                    expect(new Set(there).size).toBe(new Set(numbers).size)
                }
            }
        }
    })

    /**
     * THE OCTAVE-SIBLING TRAP itself, wherever this build has one: a voiced number whose nominal the
     * new instrument lacks, but which is the Sounding Pitch of some OTHER key of it. Before the fix
     * the swap left it there, voiced by that key; the swap back then took that key's nominal.
     */
    const TRAPS = INSTRUMENTS.flatMap((from: string) => INSTRUMENTS.flatMap((to: string) =>
        getNoteIdTable(from)
            .filter(nominal => !getNoteIdTable(to).includes(nominal))
            .map(nominal => ({from, to, nominal, number: nominalToNumber(from, 'Gb', nominal)}))
            .filter(({number}) => numberToButton(to, 'Gb', number) !== -1)))

    it.runIf(TRAPS.some(trap => RIGID.includes(trap.to)))('strands a note the new instrument has no key for, instead of voicing it on another key', () => {
        for (const {from, to, nominal, number} of TRAPS.filter(trap => RIGID.includes(trap.to))) {
            const [swapped] = rewriteForSwap([number], from, to, 'Gb')
            expect(numberToButton(to, 'Gb', swapped)).toBe(-1)
            expect(numberToNominal(to, 'Gb', swapped)).toBe(nominal)
            //...and on the row it was drawn on before the swap
            expect(gridRowForNumber(to, 'Gb', swapped).row).toBe(gridRowForNumber(from, 'Gb', number).row)
            if (RIGID.includes(from)) expect(rewriteForSwap([swapped], to, from, 'Gb')).toEqual([number])
        }
    })

    /** A grid row one rigid instrument has no key on and another, registered differently, has. */
    const UNSTRAND = RIGID.flatMap((host: string) => RIGID
        .filter((to: string) => registerShift(to) !== registerShift(host))
        .flatMap((to: string) => CANONICAL_NOTE_IDS
            .filter(row => !getNoteIdTable(host).includes(row) && getNoteIdTable(to).includes(row))
            .map(row => ({host, to, row}))))

    it.runIf(UNSTRAND.length > 0)('carries a ROW strand by the registers\' difference, and un-strands it where its row has a key', () => {
        //a row strand is a row the instrument has no key on: it moves with its track like every
        //voiced note beside it, and finds a button exactly when the new instrument has one there
        for (const {host, to, row} of UNSTRAND) {
            const stranded = nominalToNumber(host, 'C', row)
            expect(numberToButton(host, 'C', stranded)).toBe(-1)
            const [swapped] = rewriteForSwap([stranded], host, to, 'C')
            expect(swapped).toBe(getSoundingTable(to)[getNoteIdTable(to).indexOf(row)])
            expect(swapped - stranded).toBe(registerShift(to) - registerShift(host))
        }
    })

    // PITCH STRANDS: every stranded number that does not stand for a grid row its instrument lacks
    // (a paste between instruments, a Pro View placement, a cross-game import). They keep their
    // pitch through a swap, exactly as every strand did before registers (ADR-0007, ADR-0011).
    it('passes every PITCH strand through a swap unchanged, at every Basepoint', () => {
        const span = addressableSpan()
        for (const pitch of ['C', 'Gb', 'B'] as Pitch[]) {
            for (const a of INSTRUMENTS) {
                const strands: number[] = []
                for (let number = span.min; number <= span.max; number++) {
                    if (numberToButton(a, pitch, number) === -1 && strandedRow(a, pitch, number) === null) strands.push(number)
                }
                for (const b of INSTRUMENTS) expect(rewriteForSwap(strands, a, b, pitch), `${a} -> ${b} at ${pitch}`).toEqual(strands)
            }
        }
    })

    it('lets a part pasted onto the wrong layer play once that layer becomes its instrument', () => {
        //THE FIX-UP a register must not break (review of the 2026-11-01 fix): paste keeps pitch, so a
        //low part pasted onto a Piano layer is all strands there - and swapping the layer to the
        //instrument it was written for voices every one of them, at the pitch it was pasted at
        for (const instrument of INSTRUMENTS) {
            const part = getSoundingTable(instrument).filter(sounding =>
                numberToButton(INSTRUMENTS[0], 'C', sounding) === -1
                && strandedRow(INSTRUMENTS[0], 'C', sounding) === null)
            const swapped = rewriteForSwap(part, INSTRUMENTS[0], instrument, 'C')
            expect(swapped, instrument).toEqual(part)
            for (const number of swapped) expect(numberToButton(instrument, 'C', number)).not.toBe(-1)
        }
    })

    it('carries every grid row by every register onto the MIDI axis', () => {
        //what lets nominalToNumber carry a row strand without an axis fallback: a future register
        //that broke this would fail here, not write a number no format can hold
        for (const name of INSTRUMENTS) {
            for (const pitch of ALL_PITCHES) {
                for (const row of CANONICAL_NOTE_IDS) {
                    const number = nominalToNumber(name, pitch, row)
                    expect(number).toBeGreaterThanOrEqual(0)
                    expect(number).toBeLessThanOrEqual(127)
                }
            }
        }
    })

    it('returns a new array and never mutates its input', () => {
        const numbers = [getSoundingTable(WIDE)[0]]
        const swapped = rewriteForSwap(numbers, WIDE, UNTUNED, 'C')
        expect(swapped).not.toBe(numbers)
        expect(numbers).toEqual([getSoundingTable(WIDE)[0]])
    })
})

describe('registerShift', () => {
    it('is the same whole octaves for every button of every instrument', () => {
        //the registry's guarantee the function relies on: a register translates the WHOLE
        //instrument rigidly, and a baseNote flavor is at most five semitones, so every button
        //rounds to one answer
        for (const name of INSTRUMENTS) {
            const shift = registerShift(name)
            expect(Number.isInteger(shift / 12)).toBe(true)
            getSoundingTable(name).forEach((sounding, button) => {
                const flavor = sounding - getNoteIdTable(name)[button] - shift
                expect(Math.abs(flavor)).toBeLessThanOrEqual(5)
                if (!notesOf(name)[button].pitched) expect(flavor).toBe(0)
            })
        }
    })

    it('is 0 for an instrument without a register, flavored ones included', () => {
        expect(registerShift(UNTUNED)).toBe(0)
        for (const name of FLAVORED) expect(registerShift(name)).toBe(0)
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
        const reflavored = notesOf(tuned).find(note => note.pitched && note.sounding !== note.nominal)!
        expect(migrateTrackNotes([reflavored.nominal], tuned, 'C')).toEqual([reflavored.sounding])
        //the per-track Basepoint override is what the file's playback used, so it is what
        //the migration adds — a track at 'D' migrates two semitones higher than one at 'C'
        expect(migrateTrackNotes([reflavored.nominal], tuned, 'D')).toEqual([reflavored.sounding + 2])
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

    it.runIf(FLAVORED.length > 0)('may UN-STRAND a best-effort migration on a per-button tuned instrument, by design', () => {
        //the accepted consequence of `id + offset` (ADR-0007): a nominal the flavored
        //instrument never had can equal another button's Sounding Pitch, so a note that was
        //silent starts sounding the pitch its stored number now names. Pinned here so the
        //phase-C parity suite is never asked to prove the opposite — parity songs must not
        //put a Stranded Note on a tuned track.
        const tuned = FLAVORED[0]
        const soundingOnly = getSoundingTable(tuned).find(sounding =>
            !getNoteIdTable(tuned).includes(sounding))
        if (soundingOnly === undefined) return
        expect(numberToButton(tuned, 'C', soundingOnly)).toBeGreaterThanOrEqual(0)
        const [migrated] = migrateTrackNotes([soundingOnly], tuned, 'C')
        expect(migrated).toBe(soundingOnly)
    })

    it.runIf(REGISTERED.length > 0)('keeps a stranded id STRANDED on its own row on a registered instrument', () => {
        //the register is a rigid translation, so carrying a missing nominal by it can never meet a
        //button's Sounding Pitch - the note that never sounded in the old file stays silent, on the
        //row it was drawn on, instead of un-stranding onto the key an octave away
        for (const name of REGISTERED) {
            for (const id of CANONICAL_NOTE_IDS.filter(id => !getNoteIdTable(name).includes(id))) {
                for (const pitch of ALL_PITCHES) {
                    const [migrated] = migrateTrackNotes([id], name, pitch)
                    expect(migrated).toBe(id + registerShift(name) + basepointOffset(pitch))
                    expect(gridRowForNumber(name, pitch, migrated))
                        .toEqual({row: songGridSlotForId(id), stranded: true, accidental: 0})
                }
            }
        }
    })

    it('migrates an id that is no grid row as itself: it has no row to strand on', () => {
        //only a malformed v4 file holds one; carried by a register it could leave the MIDI axis
        const offGrid = Math.min(...CANONICAL_NOTE_IDS) - 13
        expect(songGridSlotForId(offGrid)).toBe(-1)
        for (const name of INSTRUMENTS) {
            expect(migrateTrackNotes([offGrid], name, 'D')).toEqual([offGrid + basepointOffset('D')])
        }
    })

    it('returns a new array and never mutates its input', () => {
        const ids = [getNoteIdTable(UNTUNED)[0]]
        const migrated = migrateTrackNotes(ids, UNTUNED, 'D')
        expect(migrated).not.toBe(ids)
        expect(ids).toEqual([getNoteIdTable(UNTUNED)[0]])
    })
})
