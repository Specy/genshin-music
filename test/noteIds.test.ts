import {describe, expect, it} from 'vitest'
import {CANONICAL_NOTE_IDS, INSTRUMENTS, InstrumentData} from './imports'
import type {ColumnNote} from './imports'
import type {InstrumentNoteIcon} from '../src/lib/core/Songs/SongClasses'
import {
    songGridSlotForId, computeButtonLayerStatuses, displayButtonForId, foldIdIntoRange,
    getNoteIdTable, noteIdToButton,
} from '../src/lib/core/Songs/noteIds'
import type {InstrumentName} from '../src/lib/core/types'

describe('foldIdIntoRange', () => {
    it('octave-folds ordinary ids without changing their pitch class', () => {
        const instrument = INSTRUMENTS[0]
        const table = getNoteIdTable(instrument)
        const min = Math.min(...table)
        const max = Math.max(...table)

        expect(foldIdIntoRange(instrument, max + 1) % 12).toBe((max + 1) % 12)
        expect(foldIdIntoRange(instrument, min - 1) % 12).toBe((min - 1 + 12) % 12)
    })

    it('handles huge finite ids in bounded time', () => {
        expect(Number.isFinite(foldIdIntoRange(INSTRUMENTS[0], 1e308))).toBe(true)
        expect(Number.isFinite(foldIdIntoRange(INSTRUMENTS[0], -1e308))).toBe(true)
    })
})

// The composer KEYBOARD's only source of note textures (ComposerKeyboard.svelte). ONE
// coordinate space (ADR-0004: the keyboard's rows ARE the Buttons of the instrument it
// draws), so every note - whatever track it sits on - is keyed by the DISPLAYED
// instrument's table, and an id that instrument has no key for lights nothing; the canvas,
// which places by Note Id, is where those stay visible. Its Song-Grid twin
// (computeGridRowLayerStatuses) is covered through the renderer oracles in
// composerRenderer.test.ts; the bit rules themselves are pinned here, on the cheap side.
// Written game-agnostically: ids AND buttons come from the live tables, never hardcoded, so
// the same assertions run under both PUBLIC_GAMEs.
describe('computeButtonLayerStatuses', () => {
    const DEFAULT_INSTRUMENT = INSTRUMENTS[0]
    const defaultTable = getNoteIdTable(DEFAULT_INSTRUMENT)
    const note = (trackIndex: number, id: number): ColumnNote => ({trackIndex, id, span: 1})
    const track = (icon: InstrumentNoteIcon, visible = true, name = DEFAULT_INSTRUMENT) =>
        new InstrumentData({name, icon, visible})

    it('sets bit 0 on the current layer note\'s button', () => {
        const statuses = computeButtonLayerStatuses(
            [note(0, defaultTable[3])], 0, [track('circle')], DEFAULT_INSTRUMENT)
        expect(statuses).toEqual(new Map([[3, 1]]))
    })

    it('sets another visible track\'s icon-class bit, and ORs both tracks on a shared button', () => {
        const instruments = [track('circle'), track('line')]
        const otherIconBit = 1 << instruments[1].toNoteIcon()
        expect(otherIconBit).toBeGreaterThan(1)

        expect(computeButtonLayerStatuses([note(1, defaultTable[5])], 0, instruments, DEFAULT_INSTRUMENT))
            .toEqual(new Map([[5, otherIconBit]]))
        expect(computeButtonLayerStatuses(
            [note(0, defaultTable[5]), note(1, defaultTable[5])], 0, instruments, DEFAULT_INSTRUMENT))
            .toEqual(new Map([[5, 1 | otherIconBit]]))
    })

    it('ignores a hidden other track, but never hides the current layer', () => {
        const instruments = [track('circle'), track('line', false)]
        //the button is still reported, with no bits: a hidden track contributes nothing to draw
        expect(computeButtonLayerStatuses([note(1, defaultTable[2])], 0, instruments, DEFAULT_INSTRUMENT))
            .toEqual(new Map([[2, 0]]))
        //...but `visible` is only consulted for OTHER tracks - selecting the hidden track
        //still lights its own notes on the keyboard
        expect(computeButtonLayerStatuses([note(1, defaultTable[2])], 1, instruments, DEFAULT_INSTRUMENT))
            .toEqual(new Map([[2, 1]]))
    })

    it('skips an id no instrument and no grid row owns', () => {
        const unknownId = Math.max(...CANONICAL_NOTE_IDS) + 1000
        expect(songGridSlotForId(unknownId)).toBe(-1)
        expect(computeButtonLayerStatuses([note(0, unknownId)], 0, [track('circle')], DEFAULT_INSTRUMENT))
            .toEqual(new Map())
    })

    // The reported reproduction. The keyboard on screen belongs to a SUB-GRID instrument
    // (genshin's 14-button NightwindHorn) while the song also carries a full-size track
    // (Lyre): the horn's Buttons, the Lyre's Buttons and the Song Grid's slots are three
    // different numberings of the same Note Ids, and only the first one addresses the keys
    // the user is looking at.
    describe('with a sub-grid instrument on screen', () => {
        //The WIDEST instrument that still cannot play every Song Grid id: the more keys it has,
        //the more of those foreign numbers land on keys it really does have, which is the sharp
        //form of the bug. Under genshin that is the reported NightwindHorn (14 keys, packed
        //nothing like the 21-row grid); under sky it is an 8-note kit, whose buttons happen to
        //BE grid slots 0-7, so the same scenario there has fewer numbers to disagree about.
        const subGridInstruments = INSTRUMENTS.filter((name: InstrumentName) =>
            CANONICAL_NOTE_IDS.some((id) => !getNoteIdTable(name).includes(id)))
        const keyboard = subGridInstruments.reduce((widest, name) =>
            getNoteIdTable(name).length > getNoteIdTable(widest).length ? name : widest,
        subGridInstruments[0])
        const keyboardTable = keyboard ? getNoteIdTable(keyboard) : []

        it('this game ships an instrument that cannot play every canonical Note Id', () => {
            //if this ever stops holding, the rows below are vacuous rather than failing
            expect(keyboard).toBeTruthy()
            expect(keyboardTable.length).toBeLessThan(CANONICAL_NOTE_IDS.length)
        })

        it('lights no button for an id STRANDED on the keyboard, grid slot or not', () => {
            const strandedId = CANONICAL_NOTE_IDS.find((id) => !keyboardTable.includes(id))!
            expect(noteIdToButton(keyboard, strandedId)).toBe(-1)
            //it HAS a canonical Song-Grid slot, and that slot is what the old own-track keying
            //fell back to and then indexed as a Button of this keyboard
            expect(songGridSlotForId(strandedId)).toBeGreaterThanOrEqual(0)

            expect(computeButtonLayerStatuses(
                [note(0, strandedId)], 0, [track('circle', true, keyboard)], keyboard))
                .toEqual(new Map())
        })

        it('keys EVERY track by the keyboard on screen, and only that keyboard', () => {
            //current track, playable here
            const ownId = keyboardTable[0]
            //current track, stranded here (genshin: id 72, whose grid slot 0 is a real horn key)
            const strandedId = CANONICAL_NOTE_IDS.find((id) => !keyboardTable.includes(id))!
            //other visible track, playable here - preferring an id the two instruments put on
            //DIFFERENT buttons, which is the disagreement the old keying resolved the wrong way
            const sharedId = keyboardTable.slice(1).find((id) =>
                noteIdToButton(DEFAULT_INSTRUMENT, id) !== -1
                && noteIdToButton(DEFAULT_INSTRUMENT, id) !== noteIdToButton(keyboard, id))
                ?? keyboardTable.slice(1).find((id) => noteIdToButton(DEFAULT_INSTRUMENT, id) !== -1)!
            const instruments = [track('circle', true, keyboard), track('line', true, DEFAULT_INSTRUMENT)]
            const otherIconBit = 1 << instruments[1].toNoteIcon()
            const ownButton = noteIdToButton(keyboard, ownId)
            const sharedButton = noteIdToButton(keyboard, sharedId)
            expect(ownButton).toBeGreaterThanOrEqual(0)
            expect(sharedButton).toBeGreaterThan(ownButton)

            //other visible track, NOT playable here - preferring an id whose button on ITS OWN
            //instrument is a real key of THIS keyboard, and a different one from the two above:
            //that is the reported screenshot, a horn key lighting up for a Lyre note it cannot
            //play (genshin picks id 76, Lyre button 2, where the horn's key 2 plays 64)
            const foreignIds = defaultTable.filter((id) =>
                !keyboardTable.includes(id) && id !== strandedId)
            const foreignId = foreignIds.find((id) => {
                const ownTrackButton = noteIdToButton(DEFAULT_INSTRUMENT, id)
                return ownTrackButton < keyboardTable.length
                    && ownTrackButton !== ownButton && ownTrackButton !== sharedButton
            }) ?? foreignIds[0]

            const statuses = computeButtonLayerStatuses([
                note(0, ownId), note(0, strandedId), note(1, sharedId), note(1, foreignId),
            ], 0, instruments, keyboard)

            //ownButton carries EXACTLY bit 0 - the stranded id did not leak into it - and the
            //other track's note sits on the button THIS keyboard plays it with
            expect(statuses).toEqual(new Map([
                [ownButton, 1],
                [sharedButton, otherIconBit],
            ]))

            //...while both dropped ids did have a row under the old own-track/grid-slot keying:
            //that is the regression, since the keyboard then indexed those numbers as its own
            //Buttons and lit keys that play unrelated notes
            expect(displayButtonForId(keyboard, strandedId)).toBeGreaterThanOrEqual(0)
            expect(displayButtonForId(DEFAULT_INSTRUMENT, foreignId)).toBeGreaterThanOrEqual(0)
            //every button it does light is a key this keyboard actually has
            for (const button of statuses.keys()) {
                expect(button).toBeLessThan(keyboardTable.length)
            }
        })
    })
})
