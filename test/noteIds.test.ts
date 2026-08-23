import {describe, expect, it} from 'vitest'
import {CANONICAL_NOTE_IDS, INSTRUMENTS, InstrumentData} from './imports'
import type {ColumnNote} from './imports'
import type {InstrumentNoteIcon} from '../src/lib/core/Songs/SongClasses'
import {
    songGridSlotForId, computeButtonLayerStatuses, computeGridStrandedMarks,
    displayButtonForNumber, foldNumberIntoRange, getNoteIdTable, getSoundingTable,
    gridRowForNumber, nominalToNumber, noteIdToButton, numberToButton,
} from '../src/lib/core/Songs/noteIds'
import type {Pitch} from '../src/lib/core/legacyConfig'
import type {InstrumentName} from '../src/lib/core/types'

// The octave-fold arithmetic, on the axis songs actually store (its nominal predecessor
// `foldIdIntoRange` was deleted at ADR-0007 phase E along with every other nominal-only helper
// the flip left unconsumed — these rows moved over rather than being dropped with it). It was
// the cross-game import policy until ADR-0011 made conversion note-preserving; it has no caller
// in src/ now, and is kept (with these rows) for the composer folding tool the ADR names.
describe('foldNumberIntoRange', () => {
    it('octave-folds ordinary numbers without changing their pitch class', () => {
        const instrument = INSTRUMENTS[0]
        const table = getSoundingTable(instrument)
        const min = Math.min(...table)
        const max = Math.max(...table)

        expect(foldNumberIntoRange(instrument, 'C', max + 1) % 12).toBe((max + 1) % 12)
        expect(foldNumberIntoRange(instrument, 'C', min - 1) % 12).toBe((min - 1 + 12) % 12)
    })

    it('folds in SOUNDING space, carrying the Basepoint back afterwards', () => {
        //what the listener hears moves by whole octaves only, whatever Basepoint the track is at
        const instrument = INSTRUMENTS[0]
        const max = Math.max(...getSoundingTable(instrument))
        expect(foldNumberIntoRange(instrument, 'D', max + 1 + 2))
            .toBe(foldNumberIntoRange(instrument, 'C', max + 1) + 2)
    })

    it('handles huge finite numbers in bounded time', () => {
        expect(Number.isFinite(foldNumberIntoRange(INSTRUMENTS[0], 'C', 1e308))).toBe(true)
        expect(Number.isFinite(foldNumberIntoRange(INSTRUMENTS[0], 'C', -1e308))).toBe(true)
    })
})

// The composer KEYBOARD's only source of note textures (ComposerKeyboard.svelte). ONE
// coordinate space (ADR-0004: the keyboard's rows ARE the Buttons of the instrument it
// draws), so every note - whatever track it sits on - is resolved against the DISPLAYED
// instrument at the DISPLAYED instrument's Basepoint, and a number it cannot voice lights
// nothing; the canvas, which places by grid row, is where those stay visible. Its Song-Grid
// twin (computeGridRowLayerStatuses) is covered through the renderer oracles in
// composerRenderer.test.ts; the bit rules themselves are pinned here, on the cheap side.
// Written game-agnostically: nominals AND buttons come from the live tables, never hardcoded,
// so the same assertions run under both PUBLIC_GAMEs.
describe('computeButtonLayerStatuses', () => {
    const DEFAULT_INSTRUMENT = INSTRUMENTS[0]
    const defaultTable = getNoteIdTable(DEFAULT_INSTRUMENT)
    /**
     * A column note carrying what `instrument` STORES for that grid nominal at Basepoint C
     * (ADR-0007 §4) — deliberately not the nominal itself: songs stopped storing those, and a
     * test that fed one in would be asking the keyboard a question production never asks.
     */
    const note = (trackIndex: number, nominal: number, instrument: InstrumentName = DEFAULT_INSTRUMENT): ColumnNote =>
        ({trackIndex, id: nominalToNumber(instrument, 'C', nominal), span: 1})
    const track = (icon: InstrumentNoteIcon, visible = true, name = DEFAULT_INSTRUMENT) =>
        new InstrumentData({name, icon, visible})

    it('sets bit 0 on the current layer note\'s button', () => {
        const statuses = computeButtonLayerStatuses(
            [note(0, defaultTable[3])], 0, [track('circle')], DEFAULT_INSTRUMENT, 'C')
        expect(statuses).toEqual(new Map([[3, 1]]))
    })

    it('sets another visible track\'s icon-class bit, and ORs both tracks on a shared button', () => {
        const instruments = [track('circle'), track('line')]
        const otherIconBit = 1 << instruments[1].toNoteIcon()
        expect(otherIconBit).toBeGreaterThan(1)

        expect(computeButtonLayerStatuses([note(1, defaultTable[5])], 0, instruments, DEFAULT_INSTRUMENT, 'C'))
            .toEqual(new Map([[5, otherIconBit]]))
        expect(computeButtonLayerStatuses(
            [note(0, defaultTable[5]), note(1, defaultTable[5])], 0, instruments, DEFAULT_INSTRUMENT, 'C'))
            .toEqual(new Map([[5, 1 | otherIconBit]]))
    })

    it('ignores a hidden other track, but never hides the current layer', () => {
        const instruments = [track('circle'), track('line', false)]
        //the button is still reported, with no bits: a hidden track contributes nothing to draw
        expect(computeButtonLayerStatuses([note(1, defaultTable[2])], 0, instruments, DEFAULT_INSTRUMENT, 'C'))
            .toEqual(new Map([[2, 0]]))
        //...but `visible` is only consulted for OTHER tracks - selecting the hidden track
        //still lights its own notes on the keyboard
        expect(computeButtonLayerStatuses([note(1, defaultTable[2])], 1, instruments, DEFAULT_INSTRUMENT, 'C'))
            .toEqual(new Map([[2, 1]]))
    })

    it('skips an id no instrument and no grid row owns', () => {
        const unknownId = Math.max(...CANONICAL_NOTE_IDS) + 1000
        expect(songGridSlotForId(unknownId)).toBe(-1)
        expect(computeButtonLayerStatuses([note(0, unknownId)], 0, [track('circle')], DEFAULT_INSTRUMENT, 'C'))
            .toEqual(new Map())
    })

    // ADR-0007: the same stored number lights a DIFFERENT key at a different Basepoint, and the
    // keyboard is asked at the Basepoint of the track it is drawing. Entering a note at Db and
    // reading it back at Db must land on the button that was pressed; reading the same number at C
    // must not.
    it('resolves against the keyboard\'s own Basepoint, not a fixed one', () => {
        const raised: Pitch = 'Db'
        const button = 3
        const stored = nominalToNumber(DEFAULT_INSTRUMENT, raised, defaultTable[button])
        expect(computeButtonLayerStatuses(
            [{trackIndex: 0, id: stored, span: 1}], 0, [track('circle')], DEFAULT_INSTRUMENT, raised))
            .toEqual(new Map([[button, 1]]))
        //at C the very same number is one semitone up, so it is either another button or nothing
        const atC = numberToButton(DEFAULT_INSTRUMENT, 'C', stored)
        expect(atC).not.toBe(button)
        expect(computeButtonLayerStatuses(
            [{trackIndex: 0, id: stored, span: 1}], 0, [track('circle')], DEFAULT_INSTRUMENT, 'C'))
            .toEqual(atC === -1 ? new Map() : new Map([[atC, 1]]))
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
                [note(0, strandedId, keyboard)], 0, [track('circle', true, keyboard)], keyboard, 'C'))
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
                note(0, ownId, keyboard), note(0, strandedId, keyboard),
                note(1, sharedId, DEFAULT_INSTRUMENT), note(1, foreignId, DEFAULT_INSTRUMENT),
            ], 0, instruments, keyboard, 'C')

            //ownButton carries EXACTLY bit 0 - the stranded id did not leak into it - and the
            //other track's note sits on the button THIS keyboard plays it with
            expect(statuses).toEqual(new Map([
                [ownButton, 1],
                [sharedButton, otherIconBit],
            ]))

            //...while both dropped ids did have a row under the old own-track/grid-slot keying:
            //that is the regression, since the keyboard then indexed those numbers as its own
            //Buttons and lit keys that play unrelated notes. Asked here of the own-track
            //resolver that still exists (displayButtonForNumber, the sounding-space successor
            //of the deleted displayButtonForId), at the Basepoint these notes were built at.
            expect(displayButtonForNumber(keyboard, 'C', nominalToNumber(keyboard, 'C', strandedId)))
                .toBeGreaterThanOrEqual(0)
            expect(displayButtonForNumber(DEFAULT_INSTRUMENT, 'C', nominalToNumber(DEFAULT_INSTRUMENT, 'C', foreignId)))
                .toBeGreaterThanOrEqual(0)
            //every button it does light is a key this keyboard actually has
            for (const button of statuses.keys()) {
                expect(button).toBeLessThan(keyboardTable.length)
            }
        })
    })
})

/**
 * THE COMPOSER CANVAS' TWO STRANDED FACTS, in one pass (ADR-0007 phase D). The KEYS are the rows
 * the canvas dims — every note contributing to them stranded on its own instrument — and the VALUE
 * is the accidental hint those notes agree on, which is what tells an OFF-SCALE strand (a number
 * between two grid rows) apart from a merely un-voiced one sitting on its own row.
 *
 * Written game-agnostically: instruments are chosen by capability and the off-scale numbers are
 * derived from the grid's own ends, so both PUBLIC_GAMEs run the same rows.
 */
describe('computeGridStrandedMarks', () => {
    const DEFAULT = INSTRUMENTS[0]
    const track = (name = DEFAULT, visible = true) => new InstrumentData({name, visible})
    const columnNote = (trackIndex: number, id: number): ColumnNote => ({trackIndex, id, span: 1})
    /** A semitone past an end of the grid: off-scale on every instrument, whatever the ladder. */
    const above = Math.max(...CANONICAL_NOTE_IDS) + 1
    const below = Math.min(...CANONICAL_NOTE_IDS) - 1

    it('this game leaves both of the derived numbers off-scale', () => {
        //guards every row below from going vacuous
        expect(gridRowForNumber(DEFAULT, 'C', above)).toMatchObject({stranded: true, accidental: 1})
        expect(gridRowForNumber(DEFAULT, 'C', below)).toMatchObject({stranded: true, accidental: -1})
    })

    it('marks an off-scale row with the sign of its notes, and a voiced row not at all', () => {
        const sharpRow = gridRowForNumber(DEFAULT, 'C', above).row
        const flatRow = gridRowForNumber(DEFAULT, 'C', below).row
        //a playable nominal on neither of the two rows above — the off-scale ones land on the
        //grid's own ends, and a voiced note sharing one of those rows would (correctly) clear it
        const nominal = CANONICAL_NOTE_IDS.find((id, row) =>
            ![sharpRow, flatRow].includes(row) && noteIdToButton(DEFAULT, id) !== -1)!
        const voiced = nominalToNumber(DEFAULT, 'C', nominal)
        const marks = computeGridStrandedMarks(
            [columnNote(0, voiced), columnNote(0, above), columnNote(0, below)], [track()], 'C')
        expect(marks.get(sharpRow)).toBe(1)
        expect(marks.get(flatRow)).toBe(-1)
        expect(marks.has(songGridSlotForId(nominal))).toBe(false)
    })

    it('marks an ON-SCALE strand 0: dimmed, but not claiming to be off the scale', () => {
        //a grid row this instrument has no button for, if the game ships such an instrument
        const narrow = INSTRUMENTS.find((name: InstrumentName) =>
            CANONICAL_NOTE_IDS.some(id => noteIdToButton(name, id) === -1))
        if (!narrow) return
        const stranded = CANONICAL_NOTE_IDS.find(id => noteIdToButton(narrow, id) === -1)!
        expect(computeGridStrandedMarks([columnNote(0, stranded)], [track(narrow)], 'C'))
            .toEqual(new Map([[songGridSlotForId(stranded), 0]]))
    })

    it('a HEALTHY contributor clears the row, hint and dimming together', () => {
        //the row is drawn as ONE sprite, so a row that reads as voiced must not also claim to be
        //a semitone off — the same "any healthy contributor is not dimmed" rule, extended
        const nearest = gridRowForNumber(DEFAULT, 'C', above).row
        const onThatRow = nominalToNumber(DEFAULT, 'C', CANONICAL_NOTE_IDS[nearest])
        expect(gridRowForNumber(DEFAULT, 'C', onThatRow).row).toBe(nearest)
        expect(computeGridStrandedMarks(
            [columnNote(0, above), columnNote(1, onThatRow)], [track(), track()], 'C'))
            .toEqual(new Map())
    })

    it('collapses DISAGREEING contributors to no hint rather than to either one', () => {
        //one sprite cannot honestly carry two hints; no hint reads as "stranded, look at the
        //notes" instead of a wrong one. Two strands a semitone either side of one row is the
        //constructible form of that (the grid's end row, approached from outside and from inside).
        const row = gridRowForNumber(DEFAULT, 'C', above).row
        const top = CANONICAL_NOTE_IDS[row]
        const fromBelow = top - 1
        //only meaningful while that number really is off-scale AND lands on the same row
        const inside = gridRowForNumber(DEFAULT, 'C', fromBelow)
        if (inside.row !== row || inside.accidental !== -1) return
        expect(computeGridStrandedMarks(
            [columnNote(0, above), columnNote(1, fromBelow)], [track(), track()], 'C'))
            .toEqual(new Map([[row, 0]]))
    })
})
