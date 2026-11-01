// THE COMPOSER'S LAYER PANEL AS A NOTE EDITOR (ADR-0007 C5, pinned by phase D's smoke pass).
//
// Since ADR-0007 both halves of an instrument's identity are part of what its track's stored Note
// Numbers MEAN, so changing either is a rewrite of that track: a swap re-flavors button-preservingly
// (Lyre -> Vintage-Lyre) and a per-layer Basepoint override moves the whole track by the interval.
// ComposedSong.setInstrument does the rewriting, and it decides WHETHER to by comparing the entry it
// is handed against the one in the roster.
//
// That comparison is only answerable if the panel hands it a DIFFERENT object. This file mounts the
// real popup over a real song and asserts the notes moved — the defect it exists for was invisible
// to every model-level test (setInstrument is correct in isolation) and to every source-grep one
// (the call site reads fine): the popup mutated the live roster entry, so `previous.name` was
// already the new name and the whole rewrite branch was dead from the UI.
import {flushSync, mount, unmount} from 'svelte'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import InstrumentSettingsPopup from '../src/lib/components/pages/Composer/InstrumentSettingsPopup.svelte'
import {ComposedSong, INSTRUMENTS, INSTRUMENTS_DATA, InstrumentData} from './imports'
import {getSoundingTable, gridRowForNumber, nominalToNumber, noteIdToButton, numberToButton} from '$core/Songs/noteIds'
import {InstrumentPickSession} from '$cmp/pages/Composer/instrumentPickSession'

type Mounted = ReturnType<typeof mount>

const notesOf = (name: string) => INSTRUMENTS_DATA[name as keyof typeof INSTRUMENTS_DATA].notes
/** Roles by capability, never by game id — the same derivations the transform tests use. */
const TUNED = INSTRUMENTS.filter((name: string) =>
    notesOf(name).some(note => note.pitched && note.sounding !== note.nominal))

/** An instrument that STRANDS at least one number the default one enters — the swap's other side. */
const NARROW = INSTRUMENTS.find((name: string) =>
    notesOf(INSTRUMENTS[0]).some(note => numberToButton(name, 'C', note.sounding) === -1))!

describe('the composer layer panel rewrites the track it edits', () => {
    let target: HTMLDivElement
    let component: Mounted | null = null

    /**
     * Mount the popup over a song's layer 0, wired exactly as InstrumentControls wires it - and, given
     * a pick session, through it, exactly as Composer.svelte's editInstrument routes every panel edit.
     */
    function openPanel(song: ComposedSong, picks?: InstrumentPickSession) {
        component = mount(InstrumentSettingsPopup, {
            target,
            props: {
                //THE LIVE ROSTER ENTRY, which is what InstrumentControls passes
                instrument: song.instruments[0],
                currentLayer: 0,
                instruments: song.instruments,
                onChange: (instrument: InstrumentData) => picks
                    ? picks.apply(song, 0, instrument)
                    : song.setInstrument(0, instrument),
                onChangePosition: () => {},
                onDelete: () => {},
                onClose: () => {},
            },
        })
        flushSync()
    }

    /** Pick a `<select>` by one of its option values, then choose `value` on it. */
    function choose(optionOfThisSelect: string, value: string) {
        const selects = [...target.querySelectorAll('select')]
        const select = selects.find(candidate =>
            [...candidate.options].some(option => option.value === optionOfThisSelect))
        if (!select) throw new Error(`no <select> offering ${optionOfThisSelect}`)
        select.value = value
        select.dispatchEvent(new Event('change', {bubbles: true}))
        flushSync()
    }

    beforeEach(() => {
        target = document.createElement('div')
        document.body.append(target)
    })

    afterEach(() => {
        if (component) unmount(component)
        component = null
        target.remove()
    })

    it.runIf(TUNED.length > 0)('an instrument swap re-flavors the notes, instead of leaving them where they were', () => {
        //Lyre -> Vintage-Lyre: the button is preserved and the pitch it sounds changes, which is
        //the behaviour ADR-0007 kept and the one this panel silently stopped delivering
        const tuned = TUNED[0]
        const reflavored = notesOf(tuned).find(note => note.pitched && note.sounding !== note.nominal)!
        const source = INSTRUMENTS.find((name: string) => noteIdToButton(name, reflavored.nominal) !== -1
            && name !== tuned)!
        const song = new ComposedSong('panel swap', [source])
        const before = notesOf(source)[noteIdToButton(source, reflavored.nominal)].sounding
        song.addNoteAt(0, 0, before)

        openPanel(song)
        choose(tuned, tuned)

        expect(song.instruments[0].name).toBe(tuned)
        expect(song.columns[0].notes[0].id).toBe(reflavored.sounding)
        //the same BUTTON of the new instrument, which is what "button-preserving" means
        expect(numberToButton(tuned, 'C', song.columns[0].notes[0].id))
            .toBe(noteIdToButton(tuned, reflavored.nominal))
    })

    it('a swap passes a stranded number through, and the panel is where it UN-STRANDS', () => {
        //the phase-D un-strand flow through the real control: a number the current instrument cannot
        //voice keeps its value across the swap and finds a button on the new one
        const stranded = notesOf(INSTRUMENTS[0]).map(note => note.sounding)
            .find(number => numberToButton(NARROW, 'C', number) === -1)!
        const song = new ComposedSong('panel un-strand', [NARROW])
        song.addNoteAt(0, 0, stranded)
        expect(gridRowForNumber(NARROW, 'C', stranded).stranded).toBe(true)

        openPanel(song)
        choose(INSTRUMENTS[0], INSTRUMENTS[0])

        expect(song.columns[0].notes[0].id).toBe(stranded)
        expect(gridRowForNumber(INSTRUMENTS[0], 'C', stranded).stranded).toBe(false)
    })

    it('a ROW strand un-strands when the panel swaps to an instrument with a key on that row', () => {
        //the row half of the un-strand flow (noteIds.strandedRow): a note on a row the current
        //instrument has no key for - what a swap or a legacy file leaves - is stranded on that row,
        //and swapping to an instrument that HAS a key there voices it on the same row.
        //Found by capability: an instrument missing a grid row the default instrument plays
        const host = INSTRUMENTS.find((name: string) =>
            notesOf(INSTRUMENTS[0]).some(note => noteIdToButton(name, note.nominal) === -1))!
        const row = notesOf(INSTRUMENTS[0]).find(note => noteIdToButton(host, note.nominal) === -1)!.nominal
        const stranded = nominalToNumber(host, 'C', row)
        const song = new ComposedSong('panel un-strand', [host])
        song.addNoteAt(0, 0, stranded)
        expect(gridRowForNumber(host, 'C', stranded).stranded).toBe(true)

        openPanel(song)
        choose(INSTRUMENTS[0], INSTRUMENTS[0])

        const voiced = song.columns[0].notes[0].id
        expect(voiced).toBe(nominalToNumber(INSTRUMENTS[0], 'C', row))
        expect(gridRowForNumber(INSTRUMENTS[0], 'C', voiced))
            .toEqual({row: gridRowForNumber(host, 'C', stranded).row, stranded: false, accidental: 0})
    })

    it('an audition through the instrument <select> and back leaves the song as it was', () => {
        //THE REPORTED FLOW, through the real control (user report 2026-11-01): every instrument of
        //the roster picked in turn - a long audition, one pick per focus of the <select> - and then
        //the original again. Each pick swaps from the original, so the track ends exactly where it
        //began. The NOTES alone cannot tell (swaps between rigid instruments reverse exactly since
        //the register fix); the history is what proves the run was one audition
        const song = new ComposedSong('panel audition', [INSTRUMENTS[0]])
        song.pitch = 'Gb'
        getSoundingTable(INSTRUMENTS[0]).forEach((sounding, column) => song.addNoteAt(column, 0, sounding + 6))
        const before = song.columns.flatMap(column => column.notes.map(note => note.id))
        const history = song.attachHistory()

        openPanel(song, new InstrumentPickSession())
        for (const name of [...INSTRUMENTS.slice(1), INSTRUMENTS[0]]) choose(INSTRUMENTS[0], name)

        expect(song.instruments[0].name).toBe(INSTRUMENTS[0])
        expect(song.columns.flatMap(column => column.notes.map(note => note.id))).toEqual(before)
        expect(history.canUndo).toBe(false)
        expect(history.canRedo).toBe(false)
    })

    it('a per-layer Basepoint override moves the track by the interval', () => {
        const song = new ComposedSong('panel basepoint', [INSTRUMENTS[0]])
        const number = notesOf(INSTRUMENTS[0])[0].sounding
        song.addNoteAt(0, 0, number)

        openPanel(song)
        //the pitch select is the one offering the empty "use song pitch" option
        choose('', 'D')

        expect(song.instruments[0].pitch).toBe('D')
        expect(song.columns[0].notes[0].id).toBe(number + 2)
    })

    it('leaves the roster entry it was handed untouched, so the song can still see what moved', () => {
        //the mechanism, stated on its own: the panel DESCRIBES the entry it wants rather than
        //editing the live one, which is what keeps setInstrument's comparison answerable
        const song = new ComposedSong('panel identity', [INSTRUMENTS[0]])
        const live = song.instruments[0]
        openPanel(song)
        choose('', 'D')
        expect(live.pitch).toBe('')
        expect(song.instruments[0]).not.toBe(live)
    })
})
