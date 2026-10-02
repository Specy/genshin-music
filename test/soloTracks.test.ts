/**
 * SOLO (spec §3, 2026-08-22; CONTEXT.md "Solo" under Songs).
 *
 * Solo is a per-track FLAG and audibility is a DERIVATION over the whole roster - the thing it is
 * deliberately not is the obvious implementation, where soloing a track writes `muted` onto every
 * other one. That version loses the user's own mutes the moment the solo is released, cannot stack
 * without bookkeeping, and saves a lie into the file. So the flag is what is stored and
 * `isTrackAudible` is what every playback seam asks, which is also what makes a saved solo state
 * sound the same in the composer and in the player.
 *
 * The panel half is mounted rather than grepped because its rule is a VISIBILITY one: the bar is
 * how a solo is released, so it has to be reachable on a row the user is not standing on - and the
 * dim cue has to cover the selected row too, since being selected does not make a track audible.
 */
import {flushSync, mount, unmount, type ComponentProps} from 'svelte'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import InstrumentControls from '../src/lib/components/pages/Composer/InstrumentControls.svelte'
import {ComposedSong, INSTRUMENTS, InstrumentData, isTrackAudible} from './imports'
import {reactiveProps} from './signals.svelte'

type Mounted = ReturnType<typeof mount>

const INSTRUMENT = INSTRUMENTS[0]

/** The roster the rule reads: `solo`/`muted` are all it looks at, so nothing else is set here. */
const roster = (...flags: {muted?: boolean, solo?: boolean}[]) =>
    flags.map(flag => new InstrumentData({name: INSTRUMENT, ...flag}))

describe('the solo flag on the wire', () => {
    it('serializes beside muted and survives the roundtrip', () => {
        const soloed = new InstrumentData({name: INSTRUMENT, solo: true})
        expect(soloed.serialize().solo).toBe(true)
        expect(InstrumentData.deserialize(soloed.serialize()).solo).toBe(true)
        expect(new InstrumentData().serialize().solo).toBe(false)
    })

    it('reads false out of a payload written before the field existed', () => {
        //no version bump came with solo, so a v5 file from yesterday is a v5 file today - it just
        //has no solos in it, and every unmuted track keeps sounding
        const {solo: _dropped, ...beforeSolo} = new InstrumentData({name: INSTRUMENT}).serialize()
        expect(InstrumentData.deserialize(beforeSolo as never).solo).toBe(false)
    })

    it('travels with the song through serialize/deserialize', () => {
        const song = new ComposedSong('solo song', [INSTRUMENT, INSTRUMENT])
        song.setInstrument(1, song.instruments[1].clone().set({solo: true}))
        const reloaded = ComposedSong.deserialize(song.serialize())
        expect(reloaded.instruments.map(instrument => instrument.solo)).toEqual([false, true])
    })
})

describe('isTrackAudible', () => {
    it('is exactly "not muted" while nothing is soloed', () => {
        const instruments = roster({}, {muted: true}, {})
        expect([0, 1, 2].map(i => isTrackAudible(instruments, i))).toEqual([true, false, true])
    })

    it('narrows to the solo set, without touching anyone else\'s mute', () => {
        const instruments = roster({}, {solo: true}, {})
        expect([0, 1, 2].map(i => isTrackAudible(instruments, i))).toEqual([false, true, false])
        //the silenced tracks are silenced by the DERIVATION - their own flags are untouched, which
        //is what makes releasing the solo restore exactly the mutes the user had
        expect(instruments.map(instrument => instrument.muted)).toEqual([false, false, false])
    })

    it('stacks: a second solo joins the set instead of replacing it', () => {
        const instruments = roster({solo: true}, {}, {solo: true})
        expect([0, 1, 2].map(i => isTrackAudible(instruments, i))).toEqual([true, false, true])
    })

    it('lets a track\'s own mute silence it inside the set', () => {
        const instruments = roster({muted: true, solo: true}, {solo: true})
        expect([0, 1].map(i => isTrackAudible(instruments, i))).toEqual([false, true])
    })

    it('keeps an unlisted track audible only while no solo exists', () => {
        //the player tolerates a note whose track has no roster entry (its gate has always been
        //`insData?.muted`); a set it is not listed in cannot contain it
        expect(isTrackAudible(roster({}), 3)).toBe(true)
        expect(isTrackAudible(roster({solo: true}), 3)).toBe(false)
    })
})

describe('the layer panel drives solo', () => {
    let target: HTMLDivElement
    let component: Mounted | null = null
    let props: ComponentProps<typeof InstrumentControls>
    let changes: {solo: boolean, index: number}[]

    const SOLO_BAR = '.instrument-solo-button'
    const DIMMED = '.instrument-button-outside-solo'

    /**
     * The panel over a three-track song, wired through the real funnel: onInstrumentChange goes to
     * setInstrument, which REPLACES the roster entry, and the fresh array is what the panel then
     * re-renders from - the same path Composer.svelte's editInstrument takes.
     */
    function openPanel(selected: number) {
        const song = new ComposedSong('solo panel', [INSTRUMENT, INSTRUMENT, INSTRUMENT])
        changes = []
        props = reactiveProps({
            instruments: song.instruments,
            selected,
            usedLayers: new Set<number>(),
            onLayerSelect: () => {},
            onInstrumentChange: (instrument: InstrumentData, index: number) => {
                changes.push({solo: instrument.solo, index})
                song.setInstrument(index, instrument)
                props.instruments = song.instruments
            },
            onInstrumentDelete: () => {},
            onInstrumentAdd: () => {},
            onChangePosition: () => {},
        })
        component = mount(InstrumentControls, {target, props})
        flushSync()
    }

    /** Every row, in roster order - the panel renders one per instrument. */
    const rows = () => [...target.querySelectorAll('.instrument-button')]

    function clickSoloOf(row: number) {
        const bar = rows()[row].querySelector<HTMLButtonElement>(SOLO_BAR)
        if (!bar) throw new Error(`row ${row} has no solo bar`)
        bar.click()
        flushSync()
    }

    beforeEach(() => {
        //jsdom has no layout, so it ships no scrollIntoView - and the panel's selected row calls it
        //on mount and on every selection change through its action
        Element.prototype.scrollIntoView ??= () => {}
        target = document.createElement('div')
        document.body.append(target)
    })

    afterEach(() => {
        if (component) unmount(component)
        component = null
        target.remove()
    })

    it('shows the bar on the selected row, and on no other until that row is soloed', () => {
        openPanel(1)
        expect(rows().map(row => Boolean(row.querySelector(SOLO_BAR)))).toEqual([false, true, false])

        clickSoloOf(1)
        //selecting row 0 leaves row 1's bar standing: it is the only way back off the solo
        props.selected = 0
        flushSync()

        expect(rows().map(row => Boolean(row.querySelector(SOLO_BAR)))).toEqual([true, true, false])
        //...and it comes alone - the gear and the eye stay a property of the selection
        expect(rows()[1].querySelector('[aria-label="Settings"]')).toBeNull()
        expect(rows()[1].querySelector('[aria-label="Hide"]')).toBeNull()
    })

    it('describes the row\'s own entry, flipped, and names that row', () => {
        openPanel(0)
        clickSoloOf(0)
        expect(changes).toEqual([{solo: true, index: 0}])
        expect(props.instruments.map(instrument => instrument.solo)).toEqual([true, false, false])

        clickSoloOf(0)
        expect(changes[1]).toEqual({solo: false, index: 0})
        expect(props.instruments.map(instrument => instrument.solo)).toEqual([false, false, false])
    })

    it('soloes one row without writing anything onto the others', () => {
        openPanel(0)
        clickSoloOf(0)
        props.selected = 1
        flushSync()
        clickSoloOf(1)

        //two solos, stacked, and not a mute written anywhere
        expect(props.instruments.map(instrument => instrument.solo)).toEqual([true, true, false])
        expect(props.instruments.map(instrument => instrument.muted)).toEqual([false, false, false])
    })

    it('dims every row outside the solo set, the selected one included', () => {
        openPanel(0)
        expect(target.querySelectorAll(DIMMED)).toHaveLength(0)

        //solo row 2 from row 2, then step the selection back to row 0 - which is now selected AND
        //silent, the case the cue exists to be honest about
        props.selected = 2
        flushSync()
        clickSoloOf(2)
        props.selected = 0
        flushSync()

        expect(rows().map(row => row.classList.contains('instrument-button-outside-solo')))
            .toEqual([true, true, false])
        expect(rows()[0].classList.contains('instrument-button-selected')).toBe(true)

        //releasing the last solo takes the whole cue away
        clickSoloOf(2)
        expect(target.querySelectorAll(DIMMED)).toHaveLength(0)
    })
})
