// STORED SETTINGS ARE RECONCILED SETTING BY SETTING (ADR-0019): what still fits is kept, the rest
// is the default, keys the code dropped are dropped, and every definition comes from the code.
//
// The rules are pinned against a small hand-written schema first (one setting per rule, so a
// failure names the rule), then end to end through SettingsService and localStorage with the real
// player settings, which is where a user's blob actually comes from.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {APP_NAME, INSTRUMENTS, PlayerSettings} from './imports'
import {reconcileSettings} from '../src/lib/core/Services/reconcileSettings'
import {settingsService} from '../src/lib/core/Services/SettingsService'
import {variantSettingOf} from '$lib/games/instrumentSettings'
import type {SettingsPropriety} from '../src/lib/core/types/SettingsPropriety'

const SCHEMA = {
    flag: {
        name: 'player_reverb', type: 'checkbox', songSetting: false, category: 'player_settings',
        value: false,
        notes: [{kind: 'warning', text: 'player_reverb_description', when: true}],
    },
    choice: {
        name: 'player_pitch', type: 'select', songSetting: false, category: 'player_settings',
        value: 'C', options: ['C', 'D', 'E'],
    },
    amount: {
        name: 'player_bpm', type: 'number', songSetting: false, category: 'player_settings',
        value: 220, increment: 5, threshold: [0, 1000],
    },
    size: {
        name: 'player_keyboard_size', type: 'slider', songSetting: false, category: 'player_settings',
        value: 100, threshold: [80, 150],
    },
    label: {
        name: 'player_note_name_type', type: 'text', songSetting: false, category: 'player_settings',
        value: '',
    },
    instrument: {
        name: 'player_instrument', type: 'instrument', songSetting: false, category: 'player_settings',
        value: INSTRUMENTS[0], volume: 100, options: [...INSTRUMENTS],
    },
} satisfies Record<string, SettingsPropriety>

type Schema = typeof SCHEMA
/** A stored blob: the schema as the app would have saved it, with some values changed. */
function storedWith(values: {[K in keyof Schema]?: unknown}): Record<string, unknown> {
    const stored: Record<string, unknown> = JSON.parse(JSON.stringify(SCHEMA))
    for (const [key, value] of Object.entries(values)) {
        stored[key] = {...(stored[key] as object), value}
    }
    return stored
}
const reconcile = (stored: unknown) => reconcileSettings(SCHEMA, stored)

describe('reconcileSettings', () => {
    it('keeps every stored value that still fits', () => {
        const other = INSTRUMENTS[INSTRUMENTS.length - 1]
        const result = reconcile(storedWith({
            flag: true, choice: 'E', amount: 1000, size: 80, label: 'mine', instrument: other,
        }))
        expect(result.flag.value).toBe(true)
        expect(result.choice.value).toBe('E')
        //the range's own ends are inside it
        expect(result.amount.value).toBe(1000)
        expect(result.size.value).toBe(80)
        expect(result.label.value).toBe('mine')
        expect(result.instrument.value).toBe(other)
    })

    it('gives a setting the stored blob does not have its default (a setting added since)', () => {
        const stored = storedWith({choice: 'D'})
        delete stored.flag
        const result = reconcile(stored)
        expect(result.flag.value).toBe(false)
        expect(result.choice.value).toBe('D')
    })

    it('drops a stored setting the code no longer has', () => {
        const result = reconcile({...storedWith({}), removed: {type: 'checkbox', value: true}})
        expect(result).not.toHaveProperty('removed')
        expect(Object.keys(result)).toEqual(Object.keys(SCHEMA))
    })

    it('resets a setting whose type changed, even when the old value would fit the new type', () => {
        const stored = storedWith({})
        //a select that used to be a text setting holding one of today's options
        stored.choice = {...SCHEMA.label, value: 'D'}
        //and a checkbox that used to be a number holding 1
        stored.flag = {...SCHEMA.amount, value: 1}
        const result = reconcile(stored)
        expect(result.choice.value).toBe('C')
        expect(result.flag.value).toBe(false)
    })

    it('resets a value the definition no longer accepts', () => {
        const result = reconcile(storedWith({
            //an option that was removed
            choice: 'F',
            //outside the range, on either side
            amount: 1001,
            size: 79,
            //the wrong primitive for the type
            flag: 'true',
            label: 5,
            //an instrument this build does not list
            instrument: 'NoSuchInstrument',
        }))
        expect(result.choice.value).toBe('C')
        expect(result.amount.value).toBe(220)
        expect(result.size.value).toBe(100)
        expect(result.flag.value).toBe(false)
        expect(result.label.value).toBe('')
        expect(result.instrument.value).toBe(INSTRUMENTS[0])
    })

    it('treats a missing or malformed value as the default', () => {
        const stored = storedWith({})
        stored.choice = {type: 'select'}
        stored.amount = {type: 'number', value: null}
        stored.flag = 'not an object'
        stored.label = null
        const result = reconcile(stored)
        expect(result.choice.value).toBe('C')
        expect(result.amount.value).toBe(220)
        expect(result.flag.value).toBe(false)
        expect(result.label.value).toBe('')
    })

    it.each([undefined, null, 'string', 42, ['array']])('a stored blob of %j is all defaults', (stored) => {
        expect(reconcile(stored)).toEqual(SCHEMA)
    })

    it('takes every definition from the code, never from storage', () => {
        const stored = storedWith({choice: 'D', flag: true})
        stored.choice = {...(stored.choice as object), name: 'player_bpm', options: ['D', 'Z'], tooltip: 'player_bpm'}
        stored.flag = {...(stored.flag as object), notes: [], category: 'metronome'}
        const result = reconcile(stored)
        expect(result.choice).toEqual({...SCHEMA.choice, value: 'D'})
        expect(result.flag).toEqual({...SCHEMA.flag, value: true})
    })

    it('hands out fresh objects: writing to the result never reaches the schema', () => {
        const result = reconcile(undefined)
        result.flag.value = true
        result.choice.options.push('Z')
        result.flag.notes[0].text = 'player_bpm'
        expect(SCHEMA.flag.value).toBe(false)
        expect(SCHEMA.choice.options).toEqual(['C', 'D', 'E'])
        expect(SCHEMA.flag.notes[0].text).toBe('player_reverb_description')
    })

    describe('an instrument setting', () => {
        const instrumentWith = (extra: Record<string, unknown>) => {
            const stored = storedWith({})
            stored.instrument = {...(stored.instrument as object), ...extra}
            return reconcile(stored).instrument
        }

        it('keeps its volume when it fits, independently of the instrument', () => {
            expect(instrumentWith({volume: 40}).volume).toBe(40)
            expect(instrumentWith({value: 'NoSuchInstrument', volume: 40}).volume).toBe(40)
            expect(instrumentWith({volume: -1}).volume).toBe(100)
            expect(instrumentWith({volume: '40'}).volume).toBe(100)
            expect(instrumentWith({value: INSTRUMENTS[0], volume: null}).volume).toBe(100)
        })

        it('leaves Instrument Settings absent when none were stored', () => {
            expect(instrumentWith({})).not.toHaveProperty('settings')
        })

        it('drops Instrument Settings along with an instrument that fell back to the default', () => {
            const result = instrumentWith({value: 'NoSuchInstrument', settings: {variant: 'x'}})
            expect(result.value).toBe(INSTRUMENTS[0])
            expect(result).not.toHaveProperty('settings')
        })

        const VARIANT = INSTRUMENTS.find((name: string) => variantSettingOf(name) !== undefined)
        it.runIf(VARIANT !== undefined)('keeps the Instrument Settings its instrument declares, and only those', () => {
            const {id, definition} = variantSettingOf(VARIANT!)!
            const option = definition.options[definition.options.length - 1].id
            expect(instrumentWith({value: VARIANT, settings: {[id]: option}}).settings).toEqual({[id]: option})
            expect(instrumentWith({value: VARIANT, settings: {[id]: 'no-such-option', stray: 'x'}}).settings)
                .toEqual({})
        })
    })
})

describe('SettingsService loads player settings through the reconcile', () => {
    const key = `${APP_NAME}_Player_Settings`
    const otherInstrument = INSTRUMENTS[INSTRUMENTS.length - 1]
    /**
     * A player blob as an older build would have saved it: from before `noteAnimation` existed (so
     * it lacks one), with a definition that has moved on since, a setting that was removed since,
     * and a value whose option is gone.
     */
    function oldBlob(settingVersion: string) {
        const data: Record<string, unknown> = JSON.parse(JSON.stringify(PlayerSettings.data))
        delete data.noteAnimation
        data.pitch = {...(data.pitch as object), value: 'Eb', options: ['C', 'Eb'], tooltip: 'player_bpm'}
        data.instrument = {...(data.instrument as object), value: otherInstrument, volume: 35}
        data.keyboardSize = {...(data.keyboardSize as object), value: 130}
        data.loopPractice = {...(data.loopPractice as object), value: true}
        data.syncSongData = {name: 'player_sync_song_data', type: 'checkbox', value: false}
        data.numberOfVisualRows = {...(data.numberOfVisualRows as object), value: 99}
        return {other: {settingVersion}, data}
    }

    beforeEach(() => localStorage.removeItem(key))
    afterEach(() => vi.restoreAllMocks())

    it('carries the user over a version bump instead of wiping them', () => {
        localStorage.setItem(key, JSON.stringify(oldBlob(`${APP_NAME}1`)))
        const settings = settingsService.getPlayerSettings()
        expect(settings.instrument.value).toBe(otherInstrument)
        expect(settings.instrument.volume).toBe(35)
        expect(settings.keyboardSize.value).toBe(130)
        expect(settings.loopPractice.value).toBe(true)
        expect(settings.pitch.value).toBe('Eb')
        //the setting added since arrives at its default, with the code's own definition
        expect(settings.noteAnimation).toEqual(PlayerSettings.data.noteAnimation)
        expect(settings.numberOfVisualRows.value).toBe(PlayerSettings.data.numberOfVisualRows.value)
        expect(settings).not.toHaveProperty('syncSongData')
        //...and the reconciled blob is what storage holds now, under the current version
        const stored = JSON.parse(localStorage.getItem(key)!)
        expect(stored.other.settingVersion).toBe(PlayerSettings.other.settingVersion)
        expect(stored.data).toEqual(JSON.parse(JSON.stringify(settings)))
    })

    it('reconciles a blob of the CURRENT version too, so a definition change needs no bump', () => {
        localStorage.setItem(key, JSON.stringify(oldBlob(PlayerSettings.other.settingVersion)))
        const settings = settingsService.getPlayerSettings()
        expect(settings.instrument.value).toBe(otherInstrument)
        //the stored definition had moved on; the code's wins, and the user's value stays
        expect(settings.pitch).toEqual({...PlayerSettings.data.pitch, value: 'Eb'})
        expect(JSON.parse(localStorage.getItem(key)!).data).toHaveProperty('noteAnimation')
    })

    it('writes nothing back once storage already holds what the code would', () => {
        localStorage.setItem(key, JSON.stringify(oldBlob(`${APP_NAME}1`)))
        settingsService.getPlayerSettings()
        const setItem = vi.spyOn(Storage.prototype, 'setItem')
        settingsService.getPlayerSettings()
        expect(setItem).not.toHaveBeenCalled()
    })

    it('writes nothing when nothing is stored, and hands out a copy of the defaults', () => {
        const setItem = vi.spyOn(Storage.prototype, 'setItem')
        const settings = settingsService.getPlayerSettings()
        expect(setItem).not.toHaveBeenCalled()
        expect(settings).toEqual(JSON.parse(JSON.stringify(PlayerSettings.data)))
        //the player resets this straight after loading; it must not write into the defaults
        settings.hidePracticeMode.value = true
        expect(PlayerSettings.data.hidePracticeMode.value).toBe(false)
    })
})
