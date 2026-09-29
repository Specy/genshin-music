// INSTRUMENT SETTINGS END TO END (ADR-0017/0018): what a track stores, when it resets, which
// samples an engine loads, and what the composer panel does with them.
//
// Roles by capability, never by game id: VARIANT is whichever instrument's config declares a
// Variant, PLAIN one that declares nothing - so the whole file sits out in a game that has no
// Variant, and follows the config wherever one appears.
import {flushSync, mount, unmount} from 'svelte'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {APP_NAME, ComposedSong, INSTRUMENTS, InstrumentData, RecordedSong} from './imports'
import {resolveInstrumentSettings, variantSettingOf} from '$lib/games/instrumentSettings'
import {Instrument} from '$lib/audio/Instrument.svelte'
import {planSongRender} from '$lib/audio/OfflineSongRenderer'
import {decodeMidiMetadata, encodeMidiMetadata} from '$core/Songs/midiMetadata'
import InstrumentSettingsPopup from '../src/lib/components/pages/Composer/InstrumentSettingsPopup.svelte'

const VARIANT = INSTRUMENTS.find((name: string) => variantSettingOf(name) !== undefined)
const PLAIN = INSTRUMENTS.find((name: string) => variantSettingOf(name) === undefined)!
const variant = VARIANT === undefined ? undefined : variantSettingOf(VARIANT)
const ID = variant?.id ?? 'variant'
const DEFAULT = variant?.definition.default ?? ''
const OTHER = variant?.definition.options.find(option => option.id !== DEFAULT)?.id ?? ''
const OTHER_GAME = (['Sky', 'Genshin'] as const).find(game => game !== APP_NAME)!

describe.runIf(VARIANT !== undefined)('a track stores its Instrument Settings (ADR-0018)', () => {
    const name = VARIANT!

    it('saving records every declared value, defaults included', () => {
        expect(new InstrumentData({name}).serialize().settings).toEqual({[ID]: DEFAULT})
        expect(new InstrumentData({name, settings: {[ID]: OTHER}}).serialize().settings)
            .toEqual({[ID]: OTHER})
    })

    it('an instrument that declares nothing writes no key at all', () => {
        //not.toHaveProperty, not toEqual: JSON normalization would hide a `settings: undefined`,
        //which IndexedDB's structured clone keeps
        expect(new InstrumentData({name: PLAIN}).serialize()).not.toHaveProperty('settings')
        expect(new InstrumentData({name: PLAIN, settings: {[ID]: OTHER}}).serialize())
            .not.toHaveProperty('settings')
    })

    it('loading keeps valid values and lets everything else fall back to the default', () => {
        const saved = new InstrumentData({name, settings: {[ID]: OTHER}}).serialize()
        expect(InstrumentData.deserialize(saved).settings).toEqual({[ID]: OTHER})
        //a song saved before settings existed: plays the default, and records it on the next save
        const {settings: _unused, ...legacy} = saved
        const loaded = InstrumentData.deserialize(legacy)
        expect(loaded.settings).toEqual({})
        expect(loaded.serialize().settings).toEqual({[ID]: DEFAULT})
        //an unknown option and a stray id both drop out
        expect(InstrumentData.deserialize({...saved, settings: {[ID]: 'no-such-option', stray: 'x'}}).settings)
            .toEqual({})
        //composed v1/v2 rosters hand bare names through the same method (Song.deserializeTo)
        expect(() => InstrumentData.deserialize(name as never)).not.toThrow()
    })

    it('copies never share a settings map', () => {
        const original = new InstrumentData({name, settings: {[ID]: OTHER}})
        const copy = original.clone()
        copy.settings[ID] = DEFAULT
        expect(original.settings[ID]).toBe(OTHER)
        expect(new InstrumentData().set({settings: original.settings}).settings).not.toBe(original.settings)
    })

    it('a swap resets the settings in the same undo step, and undo brings them back', () => {
        const song = new ComposedSong('swap', [name])
        song.setInstrument(0, song.instruments[0].clone().set({settings: {[ID]: OTHER}}))
        song.attachHistory()
        //the caller's copy still carries OTHER - the song must not keep it for another instrument
        song.setInstrument(0, song.instruments[0].clone().set({name: PLAIN}))
        expect(song.instruments[0].settings).toEqual({})
        song.setInstrument(0, song.instruments[0].withInstrument(name))
        expect(resolveInstrumentSettings(name, song.instruments[0].settings)[ID]).toBe(DEFAULT)
        expect(song.undo()).not.toBeNull()
        expect(song.undo()).not.toBeNull()
        expect(song.instruments[0].name).toBe(name)
        expect(song.instruments[0].settings).toEqual({[ID]: OTHER})
    })

    it('a Variant change is one undo step that touches nothing else', () => {
        const song = new ComposedSong('variant', [name])
        song.attachHistory()
        const before = song.serialize()
        song.setInstrument(0, song.instruments[0].clone().set({settings: {[ID]: OTHER}}))
        //v5 stores each track's instrument on the track, so compare the whole file
        expect(song.serialize()).not.toEqual(before)
        expect(song.undo()).not.toBeNull()
        expect(song.serialize()).toEqual(before)
    })

    it('cross-game conversion starts every track on its new instrument’s defaults', () => {
        const song = new ComposedSong('foreign', [PLAIN])
        song.data.appName = OTHER_GAME
        song.instruments = [new InstrumentData({name: 'SomeForeignInstrument', settings: {[ID]: OTHER}})]
        const converted = song.toOtherGame(APP_NAME)
        expect(converted.instruments[0].settings).toEqual({})
    })

    it('the MIDI metadata round trip keeps the Variant', () => {
        const text = encodeMidiMetadata({
            instruments: [new InstrumentData({name, settings: {[ID]: OTHER}})],
            pitch: 'C',
            reverb: false,
        })
        const decoded = decodeMidiMetadata([{type: 'text', text}])
        expect(decoded?.instruments[0].settings).toEqual({[ID]: OTHER})
    })
})

describe.runIf(VARIANT !== undefined)('an engine loads the Variant it was built for (ADR-0017)', () => {
    const name = VARIANT!

    it('its identity is the name plus the Variant', () => {
        expect(new Instrument(name).identityKey).toBe(`${name}#${DEFAULT}`)
        expect(new Instrument(name, {[ID]: OTHER}).identityKey).toBe(`${name}#${OTHER}`)
        expect(new Instrument(name, {[ID]: 'no-such-option'}).identityKey).toBe(`${name}#${DEFAULT}`)
        expect(new Instrument(PLAIN, {[ID]: OTHER}).identityKey).toBe(PLAIN)
    })

    it('each note fetches the chosen option’s sample', () => {
        for (const option of variant!.definition.options) {
            const engine = new Instrument(name, {[ID]: option.id})
            engine.notes.forEach((note, button) => {
                expect(note.url.endsWith(`/${name}/${option.files[button]}`)).toBe(true)
            })
        }
    })

    it('an audio export renders each track’s own Variant', () => {
        const song = new RecordedSong('export', [], [name, name])
        song.instruments = [
            song.instruments[0],
            song.instruments[1].clone().set({settings: {[ID]: OTHER}}),
        ]
        const plan = planSongRender(song)
        expect(plan.tracks[0].settings).toEqual({})
        expect(plan.tracks[1].settings).toEqual({[ID]: OTHER})
    })
})

describe.runIf(VARIANT !== undefined)('the composer layer panel picks a Variant', () => {
    let target: HTMLDivElement
    let component: ReturnType<typeof mount> | null = null

    function openPanel(song: ComposedSong) {
        component = mount(InstrumentSettingsPopup, {
            target,
            props: {
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

    const variantSelect = () => [...target.querySelectorAll('select')]
        .find(select => [...select.options].some(option => option.value === OTHER))

    beforeEach(() => {
        target = document.createElement('div')
        document.body.append(target)
    })

    afterEach(() => {
        if (component) unmount(component)
        component = null
        target.remove()
    })

    it('shows the row for an instrument that declares a Variant, and a pick lands on the track', () => {
        const song = new ComposedSong('panel', [VARIANT!])
        openPanel(song)
        const select = variantSelect()
        expect(select?.value).toBe(DEFAULT)
        select!.value = OTHER
        select!.dispatchEvent(new Event('change', {bubbles: true}))
        flushSync()
        expect(song.instruments[0].settings).toEqual({[ID]: OTHER})
    })

    it('shows no Variant row for an instrument that declares none', () => {
        openPanel(new ComposedSong('panel', [PLAIN]))
        expect(variantSelect()).toBeUndefined()
    })
})
