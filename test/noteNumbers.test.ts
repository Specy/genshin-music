// Spec §4's resolution formulas, table-driven and UNWIRED (phase B): nothing in the app
// calls these yet, so this file is the only thing standing between a wrong semitone and
// the phase-C flip.
//
// Game-agnostic by construction: every case derives its instruments from CONFIG capability
// (does this game ship a tuned instrument? an Assigned Button? an instrument narrower than
// the grid?) and never from APP_NAME, so a game that later gains a tuned instrument gets
// the tuned rows for free instead of skipping them forever. The named-instrument rows
// (Vintage-Lyre, Ukulele) are guarded by roster PRESENCE for the same reason — they pin the
// exact numbers the audit produced, on the build that actually ships those instruments.
import {describe, expect, it} from 'vitest'
import {CANONICAL_NOTE_IDS, INSTRUMENTS, INSTRUMENTS_DATA, PITCHES} from './imports'
import {
    basepointOffset, buttonToNumber, getNoteIdTable, getSoundingTable, gridRowForNumber,
    numberToButton, songGridSlotForId,
} from '../src/lib/core/Songs/noteIds'
import type {Pitch} from '../src/lib/core/legacyConfig'

const notesOf = (name: string) => INSTRUMENTS_DATA[name as keyof typeof INSTRUMENTS_DATA].notes

/** Instruments with at least one Pitched Button tuned away from its Nominal Id (genshin: Vintage-Lyre). */
const TUNED = INSTRUMENTS.filter((name: string) =>
    notesOf(name).some(note => note.pitched && note.sounding !== note.midi))
/** Instruments with at least one Assigned Button (percussion, SFX, chord strums). */
const ASSIGNED = INSTRUMENTS.filter((name: string) => notesOf(name).some(note => !note.pitched))
/** An instrument whose two axes coincide — every number off its nominal set is guaranteed stranded on it. */
const UNTUNED = INSTRUMENTS.find((name: string) =>
    getSoundingTable(name).every((sounding, button) => sounding === getNoteIdTable(name)[button]))!
/** Every Basepoint, so no case can accidentally hold only at offset 0. */
const ALL_PITCHES = PITCHES as readonly Pitch[]

describe('sounding tables', () => {
    it('mirror the instrument note structs button for button, through the same adapter as the nominal tables', () => {
        for (const name of INSTRUMENTS) {
            const table = getSoundingTable(name)
            expect(table).toEqual(notesOf(name).map(note => note.sounding))
            expect(table.length).toBe(getNoteIdTable(name).length)
        }
    })

    it('give an Assigned Button its own Nominal Id, and a Pitched Button a match within a tritone', () => {
        for (const name of INSTRUMENTS) {
            notesOf(name).forEach((note, button) => {
                const sounding = getSoundingTable(name)[button]
                if (!note.pitched) expect(sounding).toBe(note.midi)
                //the registry rejects the exact ±6 tie, so a derived pitch is always strictly nearer
                else expect(Math.abs(sounding - note.midi)).toBeLessThan(6)
            })
        }
    })

    it('are cached per instrument (identical reference on re-read, like the nominal tables)', () => {
        expect(getSoundingTable(INSTRUMENTS[0])).toBe(getSoundingTable(INSTRUMENTS[0]))
    })

    it('fall back to the default instrument for an unknown name', () => {
        expect(getSoundingTable('NotAnInstrument')).toEqual(getSoundingTable(INSTRUMENTS[0]))
    })
})

// The reason ADR-0007 exists at all: this instrument's top row is tuned a semitone below
// the nominal grid it shares with its own lower octaves, so the SAME degree sounds Db up
// top and D in the middle. Nominal ids cannot express that; Note Numbers must.
describe.runIf(INSTRUMENTS.includes('Vintage-Lyre'))('Vintage-Lyre asymmetric octaves', () => {
    // [button, nominal, baseNote, sounding] — the whole instrument, as audited 2026-08-19.
    const ROWS: [number, number, string, number][] = [
        [0, 72, 'C', 72], [1, 74, 'Db', 73], [2, 76, 'Eb', 75], [3, 77, 'F', 77],
        [4, 79, 'G', 79], [5, 81, 'Ab', 80], [6, 83, 'Bb', 82],
        [7, 60, 'C', 60], [8, 62, 'D', 62], [9, 64, 'Eb', 63], [10, 65, 'F', 65],
        [11, 67, 'G', 67], [12, 69, 'A', 69], [13, 71, 'Bb', 70],
        [14, 48, 'C', 48], [15, 50, 'D', 50], [16, 52, 'Eb', 51], [17, 53, 'F', 53],
        [18, 55, 'G', 55], [19, 57, 'A', 57], [20, 59, 'Bb', 58],
    ]

    it.each(ROWS)('button %i (nominal %i, %s) sounds %i at Basepoint C', (button, nominal, _label, sounding) => {
        expect(getNoteIdTable('Vintage-Lyre')[button]).toBe(nominal)
        expect(getSoundingTable('Vintage-Lyre')[button]).toBe(sounding)
        expect(buttonToNumber('Vintage-Lyre', 'C', button)).toBe(sounding)
    })

    it('tunes the top row down where the octaves below it are not', () => {
        //the second degree: Db up top, D in both lower octaves — one semitone apart from
        //the octave relation the nominal ids claim
        expect(buttonToNumber('Vintage-Lyre', 'C', 1)).toBe(73)
        expect(buttonToNumber('Vintage-Lyre', 'C', 8)).toBe(62)
        expect(buttonToNumber('Vintage-Lyre', 'C', 15)).toBe(50)
        expect(73 - 62).not.toBe(12)
        //...and the sixth: Ab up top, A below
        expect(buttonToNumber('Vintage-Lyre', 'C', 5)).toBe(80)
        expect(buttonToNumber('Vintage-Lyre', 'C', 12)).toBe(69)
        expect(80 - 69).not.toBe(12)
    })

    it('draws a tuned button on the row its NOMINAL id owns, voiced and unmarked', () => {
        //the Db button keeps the D row: the grid is a nominal-id index, and the player
        //looks for that key where its instrument prints it
        const placement = gridRowForNumber('Vintage-Lyre', 'C', 73)
        expect(placement).toEqual({row: songGridSlotForId(74), stranded: false, accidental: 0})
    })

    it('strands the untuned neighbour that the tuned button displaced', () => {
        //74 is a real Note Number (D above middle C) that this instrument simply cannot
        //make — its D-shaped button sounds 73. Nothing rewrites it onto that button.
        expect(numberToButton('Vintage-Lyre', 'C', 74)).toBe(-1)
        expect(gridRowForNumber('Vintage-Lyre', 'C', 74))
            .toEqual({row: songGridSlotForId(74), stranded: true, accidental: 0})
    })
})

// An Assigned Button has no Sounding Pitch to derive, so its Note Number is its Nominal Id
// carried by the Basepoint — identity, whatever its label says (the labels here are chord
// names: C, Dm, Em, F, G, Am, G7).
describe.runIf(ASSIGNED.length > 0)('Assigned Buttons', () => {
    it('enter their own Nominal Id plus the Basepoint offset, on every instrument that has one', () => {
        for (const name of ASSIGNED) {
            notesOf(name).forEach((note, button) => {
                if (note.pitched) return
                for (const pitch of ALL_PITCHES) {
                    expect(buttonToNumber(name, pitch, button)).toBe(note.midi + basepointOffset(pitch))
                    expect(numberToButton(name, pitch, note.midi + basepointOffset(pitch))).toBe(button)
                }
            })
        }
    })

    it.runIf(INSTRUMENTS.includes('Ukulele'))('keep the Ukulele chord row on its own nominal rows', () => {
        //the chord row's labels are free text and numerically irrelevant; what matters is
        //that a chord button never collapses onto a pitched neighbour
        const chordButtons = notesOf('Ukulele')
            .map((note, button) => ({note, button}))
            .filter(({note}) => !note.pitched)
        expect(chordButtons.map(({note}) => note.baseNote)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'G7'])
        for (const {note, button} of chordButtons) {
            expect(buttonToNumber('Ukulele', 'C', button)).toBe(note.midi)
            expect(gridRowForNumber('Ukulele', 'C', note.midi))
                .toEqual({row: songGridSlotForId(note.midi), stranded: false, accidental: 0})
        }
    })
})

describe('numberToButton / buttonToNumber', () => {
    it('round-trip every button of every instrument at every Basepoint', () => {
        for (const name of INSTRUMENTS) {
            const sounding = getSoundingTable(name)
            for (const pitch of ALL_PITCHES) {
                sounding.forEach((value, button) => {
                    const number = buttonToNumber(name, pitch, button)!
                    expect(number).toBe(value + basepointOffset(pitch))
                    //first button wins on a duplicate sounding value (only Assigned Buttons
                    //can produce one), so the round trip lands on the FIRST button of that number
                    expect(numberToButton(name, pitch, number)).toBe(sounding.indexOf(value))
                })
            }
        }
    })

    it('shifts every number by exactly the Basepoint interval', () => {
        const table = getSoundingTable(UNTUNED)
        ALL_PITCHES.forEach((pitch, index) => {
            expect(basepointOffset(pitch)).toBe(index)
            expect(buttonToNumber(UNTUNED, pitch, 0)).toBe(table[0] + index)
        })
    })

    it('returns null past the instrument\'s range, and -1 for a stranded number', () => {
        expect(buttonToNumber(UNTUNED, 'C', getSoundingTable(UNTUNED).length)).toBe(null)
        expect(buttonToNumber(UNTUNED, 'C', -1)).toBe(null)
        expect(numberToButton(UNTUNED, 'C', Math.max(...CANONICAL_NOTE_IDS) + 1000)).toBe(-1)
    })
})

describe('gridRowForNumber', () => {
    const gridMin = Math.min(...CANONICAL_NOTE_IDS)
    const gridMax = Math.max(...CANONICAL_NOTE_IDS)
    //a virtual nominal with a canonical id one semitone either side: the tie case
    const tieVirtual = CANONICAL_NOTE_IDS
        .map(id => id + 1)
        .find(v => !CANONICAL_NOTE_IDS.includes(v) && CANONICAL_NOTE_IDS.includes(v + 1))!

    it('this game\'s grid has an off-scale gap to place notes into', () => {
        //guards the rows below from going vacuous on a future chromatic grid
        expect(tieVirtual).toBeGreaterThan(0)
    })

    it('places a voiced note on its button\'s canonical row, at every Basepoint', () => {
        for (const pitch of ALL_PITCHES) {
            getNoteIdTable(UNTUNED).forEach((nominal, button) => {
                const number = buttonToNumber(UNTUNED, pitch, button)!
                expect(gridRowForNumber(UNTUNED, pitch, number))
                    .toEqual({row: songGridSlotForId(nominal), stranded: false, accidental: 0})
            })
        }
    })

    it('keeps ADR-0004\'s canonical fallback row for a stranded but on-scale number', () => {
        //a sub-grid instrument (genshin's 14-button horn, sky's 8-note kits) and a grid id
        //it has no button for: drawn on its OWN row, marked stranded — unchanged from today
        const narrow = INSTRUMENTS.find((name: string) =>
            CANONICAL_NOTE_IDS.some(id => !getNoteIdTable(name).includes(id)))!
        const id = CANONICAL_NOTE_IDS.find(candidate => !getNoteIdTable(narrow).includes(candidate))!
        for (const pitch of ALL_PITCHES) {
            expect(gridRowForNumber(narrow, pitch, id + basepointOffset(pitch)))
                .toEqual({row: songGridSlotForId(id), stranded: true, accidental: 0})
        }
    })

    it('breaks an off-scale tie toward the LOWER id, marking it sharp', () => {
        //equidistant between two rows: the lower one wins, so the answer never depends on
        //the authored row order
        expect(gridRowForNumber(UNTUNED, 'C', tieVirtual))
            .toEqual({row: songGridSlotForId(tieVirtual - 1), stranded: true, accidental: 1})
    })

    it('marks an off-scale note below the nearest row as flat', () => {
        expect(gridRowForNumber(UNTUNED, 'C', gridMin - 1))
            .toEqual({row: songGridSlotForId(gridMin), stranded: true, accidental: -1})
        expect(gridRowForNumber(UNTUNED, 'C', gridMin - 2))
            .toEqual({row: songGridSlotForId(gridMin), stranded: true, accidental: -1})
    })

    it('marks an off-scale note above the nearest row as sharp', () => {
        expect(gridRowForNumber(UNTUNED, 'C', gridMax + 1))
            .toEqual({row: songGridSlotForId(gridMax), stranded: true, accidental: 1})
        expect(gridRowForNumber(UNTUNED, 'C', gridMax + 2))
            .toEqual({row: songGridSlotForId(gridMax), stranded: true, accidental: 1})
    })

    it('resolves off-scale against the VIRTUAL nominal, so the placement follows the Basepoint', () => {
        //same stored number, two Basepoints: the row moves because `number - offset` does
        const number = tieVirtual + basepointOffset('D')
        expect(gridRowForNumber(UNTUNED, 'D', number))
            .toEqual({row: songGridSlotForId(tieVirtual - 1), stranded: true, accidental: 1})
        expect(gridRowForNumber(UNTUNED, 'C', number).row)
            .not.toBe(gridRowForNumber(UNTUNED, 'D', number).row)
    })
})

describe.runIf(TUNED.length > 0)('tuned instruments seen from an untuned track', () => {
    it('renders a tuned instrument\'s Note Number off-scale on an untuned instrument', () => {
        //the number a Vintage-Lyre song stores for its Db button, opened on a Lyre track:
        //no button plays it, and it is not a grid id either, so it draws on the nearest row
        //with an accidental instead of vanishing
        const tuned = TUNED[0]
        const offScale = getSoundingTable(tuned).find(sounding =>
            !CANONICAL_NOTE_IDS.includes(sounding) && numberToButton(UNTUNED, 'C', sounding) === -1)!
        expect(offScale).toBeGreaterThan(0)
        const placement = gridRowForNumber(UNTUNED, 'C', offScale)
        expect(placement.stranded).toBe(true)
        expect(placement.accidental).not.toBe(0)
        expect(placement.row).toBeGreaterThanOrEqual(0)
    })
})
