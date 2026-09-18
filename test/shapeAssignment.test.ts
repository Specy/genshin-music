// ADR-0005 §2: every Shape exposes its note→position assignment as data, so the engine
// (Label Sets, keybind resolution) and the arrangement (placement) derive the SAME answer
// instead of both assuming authored order.
//
// Game-agnostic: everything is read from the live game, so the identical assertions run
// under both PUBLIC_GAMEs. The non-identity cases build their own throwaway Shape rather
// than waiting for a content-driven Shape to ship.
import {describe, expect, it} from 'vitest'
import {game} from '$game'
import {
    assertShapeAssignment, placeNotes, shapeNoteOf, shapeSlots,
} from '../src/lib/games/shapes/assignment'
import type {ShapeDefinition, ShapeNote} from '../src/lib/games/types'
import {Instrument} from '../src/lib/audio/Instrument.svelte'
import {INSTRUMENTS, INSTRUMENTS_DATA} from './imports'

const notesOf = (shapeCount: number): ShapeNote[] =>
    Array.from({length: shapeCount}, (_, i) => ({id: 60 + i, baseNote: 'C', icon: 'do'}) as ShapeNote)

/** A Shape that exists only for this file — `component` is never rendered here. */
function fakeShape(overrides: Partial<ShapeDefinition> = {}): ShapeDefinition {
    const base = game.shapes[Object.keys(game.shapes)[0]]
    return {
        ...base,
        id: 'test-shape',
        component: null as unknown as ShapeDefinition['component'],
        ...overrides,
    }
}

describe('Shape note→position assignment', () => {
    it('every shipped Shape uses the identity assignment (authored order IS on-screen order)', () => {
        for (const shape of Object.values(game.shapes)) {
            expect(shape.assign).toBeUndefined()
            const notes = notesOf(shape.capacity)
            expect(shapeSlots(shape, notes)).toEqual(notes.map((_, i) => i))
        }
    })

    it('placeNotes under identity is the notes array itself — grids render nothing extra', () => {
        for (const name of INSTRUMENTS) {
            const data = INSTRUMENTS_DATA[name as keyof typeof INSTRUMENTS_DATA]
            const shape = game.shapes[data.shape]
            const notes = data.notes.map(shapeNoteOf)
            const placed = placeNotes(shape, notes)
            expect(placed).toHaveLength(notes.length)
            expect(placed.map((p) => p && p.button)).toEqual(notes.map((_, i) => i))
            expect(placed.map((p) => p && p.note.id)).toEqual(notes.map((n) => n.id))
        }
    })

    it('a non-identity assignment places each note at its slot and keeps its Button', () => {
        // slot = reversed position: the LAST note is drawn first
        const shape = fakeShape({capacity: 4, assign: (notes) => notes.map((_, i) => notes.length - 1 - i)})
        const notes = notesOf(3)
        expect(shapeSlots(shape, notes)).toEqual([2, 1, 0])
        const placed = placeNotes(shape, notes)
        expect(placed.map((p) => p && p.note.id)).toEqual([62, 61, 60])
        // the Button travels with the note, so a surface's per-button data still resolves
        expect(placed.map((p) => p && p.button)).toEqual([2, 1, 0])
    })

    it('a slot no note takes stays an empty cell instead of shifting the ones after it', () => {
        const shape = fakeShape({capacity: 5, assign: (notes) => notes.map((_, i) => i * 2)})
        const placed = placeNotes(shape, notesOf(3))
        expect(placed).toHaveLength(5)
        expect(placed.map((p) => p && p.note.id)).toEqual([60, null, 61, null, 62])
    })

    it('assertShapeAssignment rejects duplicate, out-of-range and miscounted slots', () => {
        const notes = notesOf(3)
        expect(() => assertShapeAssignment(fakeShape({capacity: 4}), notes, 'ctx')).not.toThrow()
        expect(() =>
            assertShapeAssignment(fakeShape({capacity: 4, assign: () => [0, 1, 1]}), notes, 'ctx')
        ).toThrow(/two notes to slot 1/)
        expect(() =>
            assertShapeAssignment(fakeShape({capacity: 4, assign: () => [0, 1, 4]}), notes, 'ctx')
        ).toThrow(/outside \[0, 4\)/)
        expect(() =>
            assertShapeAssignment(fakeShape({capacity: 4, assign: () => [0, 1]}), notes, 'ctx')
        ).toThrow(/assigned 2 slots for 3 notes/)
    })

    it('the engine reads Label Sets and resolves keybinds at the SLOT the Shape drew', () => {
        // The one claim ADR-0005 §2 makes that nothing else can prove until a content-driven
        // Shape ships: swap the default instrument's Shape for a reversing one and the labels,
        // the label lookup and the key->note resolution must all follow the new placement.
        const shapeId = INSTRUMENTS_DATA[INSTRUMENTS[0] as keyof typeof INSTRUMENTS_DATA].shape
        const registry = game.shapes as Record<string, ShapeDefinition>
        const original = registry[shapeId]
        registry[shapeId] = {
            ...original,
            assign: (notes) => notes.map((_, i) => notes.length - 1 - i),
        }
        try {
            const instrument = new Instrument(INSTRUMENTS[0])
            const last = instrument.notes.length - 1
            const labelOfLastSlot = original.labels.keyboard[last]
            expect(instrument.notes[0].noteNames.keyboard).toBe(labelOfLastSlot)
            expect(instrument.getNoteText(0, 'ABC', 'C')).toBe(original.labels.abc[last])
            // pressing the key that is drawn on button 0 plays button 0's note
            expect(instrument.getNoteFromCode(labelOfLastSlot)).toBe(instrument.notes[0])
            expect(instrument.getNoteIndexFromCode(labelOfLastSlot)).toBe(0)
        } finally {
            registry[shapeId] = original
        }
    })
})

describe('Instrument number-keyed lookups (ADR-0005 §4 under ADR-0007)', () => {
    it('getNoteByNumber resolves a Note Number to its note and null for one the instrument cannot voice', () => {
        const instrument = new Instrument(INSTRUMENTS[0])
        const note = instrument.notes[1]
        expect(instrument.getNoteByNumber(note.numberAt('C'), 'C')).toBe(note)
        expect(instrument.getNoteByNumber(-999, 'C')).toBeNull()
        // the id accessor is just the ShapeNote-facing name of nominalNote (the NOMINAL axis)
        expect(note.id).toBe(note.nominalNote)
        expect(note.icon).toBe(note.noteImage)
    })

    it('the same button answers a different Note Number at every Basepoint', () => {
        const instrument = new Instrument(INSTRUMENTS[0])
        const note = instrument.notes[1]
        // 'Db' is one semitone up from C: the button is the same, the number it enters is not
        expect(note.numberAt('Db')).toBe(note.numberAt('C') + 1)
        expect(instrument.getNoteByNumber(note.numberAt('Db'), 'Db')).toBe(note)
        // ...and reading a Db-Basepoint number at C resolves to the button one semitone up,
        // or to nothing at all where the instrument has no such button
        expect(instrument.getNoteByNumber(note.numberAt('Db'), 'C'))
            .toBe(instrument.notes.find((candidate) => candidate.soundingNote === note.soundingNote + 1) ?? null)
    })

    it('getButtonOfNumber still answers in Buttons, -1 when the number is stranded', () => {
        const instrument = new Instrument(INSTRUMENTS[0])
        expect(instrument.getButtonOfNumber(instrument.notes[2].numberAt('C'), 'C')).toBe(2)
        expect(instrument.getButtonOfNumber(-999, 'C')).toBe(-1)
    })
})
