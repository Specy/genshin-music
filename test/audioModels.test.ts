// Pure-logic tests for the Phase-4a Task 2 audio engine + MIDI provider port. jsdom has no
// AudioContext (confirmed: `window.AudioContext`/`window.webkitAudioContext` are both undefined
// under jsdom), so nothing here calls `.load()`/`.play()`/`AudioProvider.getAudioContext()` for
// real, or `MIDIProvider.init()`/`.requestAccess()` (no `navigator.requestMIDIAccess` under
// jsdom either) - only the construction-time and pure-method logic is exercised.
//
// AudioPlayer.syncInstruments diffing lives in test/audioPlayerDiffing.test.ts, a companion file,
// NOT here: it needs `vi.mock('$lib/audio/Instrument.svelte', ...)` to avoid AudioPlayer's real
// `.load()` touching Web Audio, but `vi.mock()` is file-scoped (hoisted for the WHOLE file) - if
// it lived in this file it would silently replace the REAL Instrument class the describe blocks
// below construct directly, breaking them. Splitting avoids that conflict entirely; see that
// file's own header comment for the full rationale.
import {describe, expect, it} from 'vitest'
import {keyBinds} from '../src/lib/stores/KeybindsStore.svelte'
import {KeyboardProvider} from '../src/lib/providers/KeyboardProvider'
import type {KeyboardCode} from '../src/lib/providers/KeyboardProvider/KeyboardTypes'
import {DEFAULT_ENG_KEYBOARD_MAP} from '../src/lib/i18n/i18n'
import {capitalize} from '../src/lib/core/utils/Utilities'
import {PITCH_TO_INDEX} from '../src/lib/core/legacyConfig'
import {Instrument} from '../src/lib/audio/Instrument.svelte'
import {MIDIProvider} from '../src/lib/providers/MIDIProvider'
import {APP_NAME, INSTRUMENTS, NOTE_SCALE, DO_RE_MI_NOTE_SCALE, MIDI_PRESETS} from './imports'

describe('Instrument.getNoteText per NoteNameType', () => {
    // INSTRUMENTS[0]'s own data is enough state to populate an Instrument without .load() -
    // getNoteText only reads this.notes[index]/this.layouts, both set synchronously in the
    // constructor.
    const instrument = new Instrument(INSTRUMENTS[0])
    const rawKey = instrument.layouts.keyboard[0]

    it('"Note name" reads NOTE_SCALE[baseNote][pitchIndex] for the note at that index', () => {
        const baseNote = instrument.notes[0].baseNote
        const expected = NOTE_SCALE[baseNote][PITCH_TO_INDEX.get('C') ?? 0]
        expect(instrument.getNoteText(0, 'Note name', 'C')).toBe(expected)
    })

    it('"Do Re Mi" reads DO_RE_MI_NOTE_SCALE[baseNote][pitchIndex] for the note at that index', () => {
        const baseNote = instrument.notes[0].baseNote
        const expected = DO_RE_MI_NOTE_SCALE[baseNote][PITCH_TO_INDEX.get('C') ?? 0]
        expect(instrument.getNoteText(0, 'Do Re Mi', 'C')).toBe(expected)
    })

    it('"ABC" / "1 2 3" / "Playstation" / "Switch" read their own layout array at the index', () => {
        expect(instrument.getNoteText(0, 'ABC', 'C')).toBe(instrument.layouts.abc[0])
        expect(instrument.getNoteText(0, '1 2 3', 'C')).toBe(instrument.layouts.number[0])
        expect(instrument.getNoteText(0, 'Playstation', 'C')).toBe(instrument.layouts.playstation[0])
        expect(instrument.getNoteText(0, 'Switch', 'C')).toBe(instrument.layouts.switch[0])
    })

    it('"No Text" is always the empty string, independent of instrument data', () => {
        expect(instrument.getNoteText(0, 'No Text', 'C')).toBe('')
    })

    it('"Keyboard layout" resolves the currently-bound key via keyBinds, then DEFAULT_ENG_KEYBOARD_MAP, capitalized', () => {
        const boundCode = keyBinds.getKeyOfShortcut('keyboard', rawKey) ?? rawKey
        const expected = capitalize(DEFAULT_ENG_KEYBOARD_MAP[boundCode] ?? boundCode.replace('Key', ''))
        expect(instrument.getNoteText(0, 'Keyboard layout', 'C')).toBe(expected)
    })

    it('"Your Keyboard layout" resolves the currently-bound key via keyBinds, then KeyboardProvider.getTextOfCode, capitalized', () => {
        const boundCode = keyBinds.getKeyOfShortcut('keyboard', rawKey) ?? rawKey
        const expected = capitalize(KeyboardProvider.getTextOfCode(boundCode as KeyboardCode) ?? boundCode.replace('Key', ''))
        expect(instrument.getNoteText(0, 'Your Keyboard layout', 'C')).toBe(expected)
        // under jsdom (no navigator.keyboard), KeyboardProvider falls back to the exact same
        // DEFAULT_ENG_KEYBOARD_MAP as the plain "Keyboard layout" branch above, so both branches
        // agree here - still two independently-dispatched code paths being exercised.
        expect(instrument.getNoteText(0, 'Your Keyboard layout', 'C'))
            .toBe(instrument.getNoteText(0, 'Keyboard layout', 'C'))
    })

    it('returns the empty string for an out-of-range index instead of throwing (old blob\'s empty catch)', () => {
        expect(instrument.getNoteText(9999, 'Note name', 'C')).toBe('')
    })
})

describe('Instrument note index/code mapping', () => {
    const instrument = new Instrument(INSTRUMENTS[0])

    it('getNoteIndexFromCode finds the layout position of a real code, -1 for an unknown one', () => {
        const code = instrument.layouts.keyboard[0]
        expect(instrument.getNoteIndexFromCode(code)).toBe(0)
        expect(instrument.getNoteIndexFromCode('not-a-real-code')).toBe(-1)
    })

    it('getNoteFromCode returns the matching ObservableNote, null when not found', () => {
        const code = instrument.layouts.keyboard[0]
        expect(instrument.getNoteFromCode(code)).toBe(instrument.notes[0])
        expect(instrument.getNoteFromCode('not-a-real-code')).toBeNull()
    })

    it('getNoteFromIndex returns the note at that index, null out of range', () => {
        expect(instrument.getNoteFromIndex(0)).toBe(instrument.notes[0])
        expect(instrument.getNoteFromIndex(9999)).toBeNull()
    })
})

describe('ObservableNote reactive state ($state data, mobx-free)', () => {
    it('setStatus/triggerAnimation mutate `data` in place via Object.assign (readonly-by-convention)', () => {
        const instrument = new Instrument(INSTRUMENTS[0])
        const note = instrument.notes[0]
        const dataRef = note.data
        note.setStatus('clicked')
        expect(note.status).toBe('clicked')
        expect(note.data).toBe(dataRef) // same object identity - never reassigned, only mutated

        const before = note.data.animationId
        note.triggerAnimation('toClick')
        expect(note.data.animationId).toBe(before + 1)
        expect(note.status).toBe('toClick')
    })

    it('clone() produces an independent ObservableNote carrying the same data snapshot', () => {
        const instrument = new Instrument(INSTRUMENTS[0])
        const note = instrument.notes[0]
        note.setStatus('clicked')
        const clone = note.clone()
        expect(clone).not.toBe(note)
        expect(clone.data).not.toBe(note.data)
        expect(clone.status).toBe(note.status)
        expect(clone.instrument).toBe(note.instrument)
        expect(clone.noteImage).toBe(note.noteImage)
    })
})

describe('MIDIProvider preset logic (real settingsService, no init()/requestAccess())', () => {
    const builtinName = MIDI_PRESETS[0].name

    it('loadPreset loads a built-in preset by name and populates notes 1:1 from its data', () => {
        MIDIProvider.loadPreset(builtinName)
        expect(MIDIProvider.settings.selectedPreset).toBe(builtinName)
        expect(MIDIProvider.notes.map(n => n.midi)).toEqual(MIDI_PRESETS[0].notes)
        expect(MIDIProvider.isPresetBuiltin(builtinName)).toBe(true)
    })

    it('loadPreset throws for an unknown preset name (old blob behavior, preserved)', () => {
        expect(() => MIDIProvider.loadPreset('definitely-not-a-real-preset')).toThrow()
    })

    it('createPreset persists a new user preset that loadPreset can then load, and isPresetBuiltin rejects it', () => {
        MIDIProvider.createPreset({name: 'audioModels-test-preset', notes: [10, 20, 30]})
        expect(MIDIProvider.isPresetBuiltin('audioModels-test-preset')).toBe(false)

        MIDIProvider.loadPreset('audioModels-test-preset')
        expect(MIDIProvider.settings.selectedPreset).toBe('audioModels-test-preset')
        expect(MIDIProvider.notes.map(n => n.midi)).toEqual([10, 20, 30])

        const raw = localStorage.getItem(`${APP_NAME}_MIDI_Settings`)
        expect(raw).toBeTruthy()
        expect(JSON.parse(raw!).presets['audioModels-test-preset']).toBeTruthy()
    })

    it('updateNoteOfCurrentPreset mutates both the loaded MIDINote and the underlying preset entry', () => {
        MIDIProvider.createPreset({name: 'audioModels-update-preset', notes: [1, 2]})
        MIDIProvider.loadPreset('audioModels-update-preset')

        const updated = MIDIProvider.updateNoteOfCurrentPreset(0, 77, 'right')

        expect(updated?.midi).toBe(77)
        expect(MIDIProvider.notes[0].midi).toBe(77)
        expect(MIDIProvider.getCurrentPreset()?.notes[0]).toBe(77)
    })

    it('deletePreset removes a preset from settings.presets', () => {
        MIDIProvider.createPreset({name: 'audioModels-delete-preset', notes: []})
        expect(MIDIProvider.getPresets().some(p => p.name === 'audioModels-delete-preset')).toBe(true)

        MIDIProvider.deletePreset('audioModels-delete-preset')

        expect(MIDIProvider.getPresets().some(p => p.name === 'audioModels-delete-preset')).toBe(false)
    })
})
