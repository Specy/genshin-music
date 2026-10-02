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
import {gridRowForNumber, noteIdToButton, numberToButton} from '$core/Songs/noteIds'

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

    /** Mount the popup over a song's layer 0, wired exactly as InstrumentControls wires it. */
    function openPanel(song: ComposedSong) {
        component = mount(InstrumentSettingsPopup, {
            target,
            props: {
                //THE LIVE ROSTER ENTRY, which is what InstrumentControls passes
                instrument: song.instruments[0],
                currentLayer: 0,
                instruments: song.instruments,
                onChange: (instrument: InstrumentData) => song.setInstrument(0, instrument),
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
