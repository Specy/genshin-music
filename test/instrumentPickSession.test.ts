// THE LAYER PANEL'S INSTRUMENT PICKS AS ONE AUDITION (instrumentPickSession.ts), driven on a real
// song with a real history - the rule is model-level, so nothing here needs the 3000-line composer.
//
// The defect it closes (user report 2026-11-01): auditioning a layer's instrument and picking the
// original back composed one swap per pick, and a swap that the next one could not undo exactly left
// the track somewhere nobody asked for - a song's low notes an octave up, saved. rewriteForSwap now
// inverts itself between rigid instruments; this pins the other half, which holds for EVERY
// instrument: a run of picks swaps from the instrument it started on, so its result is one swap.
import {describe, expect, it} from 'vitest'
import {ComposedSong, INSTRUMENTS, InstrumentData, UndoHistory} from './imports'
import {getSoundingTable} from '$core/Songs/noteIds'
import {rewriteForSwap} from '$core/Songs/noteNumberTransforms'
import {InstrumentPickSession} from '$cmp/pages/Composer/instrumentPickSession'

const ORIGIN = INSTRUMENTS[0]
/** Two other instruments to pass through - any will do; the rule is about the run, not the pair. */
const [FIRST, SECOND] = INSTRUMENTS.filter((name: string) => name !== ORIGIN)

/** Every button of the origin instrument, one per column, at a non-C Basepoint on purpose. */
function auditionSong() {
    const song = new ComposedSong('audition', [ORIGIN])
    song.pitch = 'Gb'
    getSoundingTable(ORIGIN).forEach((sounding, column) => {
        if (column >= song.columns.length) song.addColumns(1, song.columns.length)
        song.addNoteAt(column, 0, sounding + 6)
    })
    const history = song.attachHistory()
    return {song, history}
}

const numbersOf = (song: ComposedSong) => song.columns.flatMap(column => column.notes.map(note => note.id))
/** What the layer panel hands the composer for a pick: the live entry, renamed (InstrumentSettingsPopup). */
const pickOf = (song: ComposedSong, name: string, index = 0) => song.instruments[index].withInstrument(name)

describe('a run of instrument picks is one audition', () => {
    it('picking the original back leaves the song exactly as it was, with no Step', () => {
        const {song, history} = auditionSong()
        const before = numbersOf(song)
        history.markSavepoint()
        const picks = new InstrumentPickSession()

        picks.apply(song, 0, pickOf(song, FIRST))
        picks.apply(song, 0, pickOf(song, SECOND))
        picks.apply(song, 0, pickOf(song, ORIGIN))

        expect(song.instruments[0].name).toBe(ORIGIN)
        expect(numbersOf(song)).toEqual(before)
        expect(history.canUndo).toBe(false)
        //...and clean: the audition never reached the file, so nothing asks to be saved
        expect(history.isDirty).toBe(false)
        //...and the instruments backed out of are WITHDRAWN, not waiting on the redo stack: a redo
        //here would re-make an audition the user already left
        expect(history.canRedo).toBe(false)
    })

    it('withdraws a replaced pick even over a redo branch the user had before the run', () => {
        const {song, history} = auditionSong()
        song.addNoteAt(0, 0, getSoundingTable(ORIGIN)[1] + 6)
        song.undo()
        expect(history.canRedo).toBe(true)
        const picks = new InstrumentPickSession()

        picks.apply(song, 0, pickOf(song, FIRST))
        picks.apply(song, 0, pickOf(song, ORIGIN))

        //the earlier branch died at the first pick, as at any edit; what must not be left is a redo
        //that swaps the layer back onto the auditioned instrument
        expect(history.canRedo).toBe(false)
        expect(song.redo()).toBeNull()
        expect(song.instruments[0].name).toBe(ORIGIN)
    })

    it('keeps the song dirty when a save landed in the middle of the run', () => {
        //the autosave can write the file between two picks: it then holds the auditioned
        //instrument, and the song picked back to the original no longer matches it
        const {song, history} = auditionSong()
        const picks = new InstrumentPickSession()
        picks.apply(song, 0, pickOf(song, FIRST))
        history.markSavepoint()
        picks.apply(song, 0, pickOf(song, ORIGIN))
        expect(history.isDirty).toBe(true)
    })

    it('swaps every pick from the ORIGIN, so the run is one Step equal to one direct swap', () => {
        const {song, history} = auditionSong()
        const before = numbersOf(song)
        const picks = new InstrumentPickSession()

        picks.apply(song, 0, pickOf(song, FIRST))
        picks.apply(song, 0, pickOf(song, SECOND))

        expect(song.instruments[0].name).toBe(SECOND)
        expect(numbersOf(song)).toEqual(rewriteForSwap(before, ORIGIN, SECOND, 'Gb'))
        //one Step: a single undo is back on the origin, notes and all
        song.undo()
        expect(history.canUndo).toBe(false)
        expect(song.instruments[0].name).toBe(ORIGIN)
        expect(numbersOf(song)).toEqual(before)
    })

    it('ends the run on any edit that lands a Step of its own', () => {
        const {song, history} = auditionSong()
        const before = numbersOf(song)
        const picks = new InstrumentPickSession()

        picks.apply(song, 0, pickOf(song, FIRST))
        //a volume change through the same panel is not a pick: its own Step, and the run is over
        picks.apply(song, 0, song.instruments[0].clone().set({volume: 50}))
        const afterFirst = numbersOf(song)
        picks.apply(song, 0, pickOf(song, SECOND))

        //the second pick is an ordinary swap from where the track now is - nothing was undone
        expect(numbersOf(song)).toEqual(rewriteForSwap(afterFirst, FIRST, SECOND, 'Gb'))
        song.undo()
        song.undo()
        song.undo()
        expect(history.canUndo).toBe(false)
        expect(numbersOf(song)).toEqual(before)
    })

    it('ends the run at a note edit between two picks, and never undoes that edit', () => {
        //THE IDENTITY CHECK, on an edit that does not come through the panel: the keyboard stays
        //live while the panel is open, so a note can land between two picks. The second pick must
        //see that the history moved and swap from where the track is, rather than undo the note
        const {song, history} = auditionSong()
        const picks = new InstrumentPickSession()
        picks.apply(song, 0, pickOf(song, FIRST))
        const column = song.columns.length - 1
        const added = song.addNoteAt(column, 0, getSoundingTable(FIRST)[0] + 6)
        picks.apply(song, 0, pickOf(song, SECOND))

        expect(song.instruments[0].name).toBe(SECOND)
        expect(song.columns[column].notes).toContain(added)
        //three Steps: the first pick, the note, the second pick
        song.undo()
        expect(song.instruments[0].name).toBe(FIRST)
        expect(song.columns[column].notes).toContain(added)
        song.undo()
        song.undo()
        expect(history.canUndo).toBe(false)
    })

    it('ends the run when the panel closes or opens (reset)', () => {
        const {song} = auditionSong()
        const picks = new InstrumentPickSession()
        picks.apply(song, 0, pickOf(song, FIRST))
        picks.reset()
        const afterFirst = numbersOf(song)
        picks.apply(song, 0, pickOf(song, SECOND))
        expect(numbersOf(song)).toEqual(rewriteForSwap(afterFirst, FIRST, SECOND, 'Gb'))
    })

    it('ends the run on a pick for another layer', () => {
        const {song} = auditionSong()
        song.addInstrument(ORIGIN)
        const picks = new InstrumentPickSession()
        picks.apply(song, 0, pickOf(song, FIRST))
        picks.apply(song, 1, pickOf(song, FIRST, 1))
        //back on layer 0: a new run, so layer 1's pick is not undone by it
        picks.apply(song, 0, pickOf(song, SECOND))
        expect(song.instruments[1].name).toBe(FIRST)
        expect(song.instruments[0].name).toBe(SECOND)
    })

    it('never undoes into an open group - the pick then simply starts a new run', () => {
        const {song, history} = auditionSong()
        const picks = new InstrumentPickSession()
        picks.apply(song, 0, pickOf(song, FIRST))
        history.beginGroup()
        const afterFirst = numbersOf(song)
        picks.apply(song, 0, pickOf(song, SECOND))
        history.endGroup()
        expect(numbersOf(song)).toEqual(rewriteForSwap(afterFirst, FIRST, SECOND, 'Gb'))
        expect(song.instruments[0].name).toBe(SECOND)
        //the first pick was NOT undone (an undo would also have force-closed the group): it is still
        //its own Step, under the group's
        song.undo()
        expect(song.instruments[0].name).toBe(FIRST)
        song.undo()
        expect(song.instruments[0].name).toBe(ORIGIN)
        expect(history.canUndo).toBe(false)
    })

    it('is setInstrument, unchanged, without a history', () => {
        const song = new ComposedSong('no history', [ORIGIN])
        const picks = new InstrumentPickSession()
        picks.apply(song, 0, new InstrumentData({name: FIRST}))
        picks.apply(song, 0, new InstrumentData({name: SECOND}))
        expect(song.instruments[0].name).toBe(SECOND)
    })
})

describe('UndoHistory.lastStep', () => {
    it('is the Step the history stands on, and null while an edit is in flight', () => {
        const history = new UndoHistory<string>()
        expect(history.lastStep).toBeNull()
        history.beginStep(0)
        history.record('a')
        //mid-mutator: the open Step is newer than anything on the stack
        expect(history.lastStep).toBeNull()
        history.endStep()
        const landed = history.lastStep
        expect(landed?.deltas).toEqual(['a'])
        history.beginGroup()
        expect(history.lastStep).toBeNull()
        history.endGroup()
        expect(history.lastStep).toBe(landed)
        history.undoStep()
        expect(history.lastStep).toBeNull()
    })
})
