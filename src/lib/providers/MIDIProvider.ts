// old: src/lib/Providers/MIDIProvider.ts - minimal-diff port; imports only (`$lib/Services/SettingsService`
// -> `$core/Services/SettingsService`; `../BaseSettings` -> `$core/BaseSettings`; `$lib/utils/Utilities`
// -> `$core/utils/Utilities` (debounce(50) - restored there P3 Task 2); `$config` -> `$core/legacyConfig`).
// Bare `//@ts-ignore` (banned outside `src/lib/core/`) converted to `@ts-expect-error` with a
// description, same pattern as KeyboardProvider.ts (Phase-4a Task 1).
//
// PRESERVED QUIRK (do not fix, per spec): `destroy()`'s `this.currentMIDISource` is NOT a
// declared field anywhere on this class (only `connectedMidiSources` is) - a pre-existing dead
// reference in the old blob (verified against `migration/next16-react19` directly), always
// `undefined` at runtime, so that line's `?.removeEventListener(...)` is a permanent no-op; the
// `midimessage` listeners attached in `setSourcesAndConnect` are never actually removed by
// `destroy()`. Kept byte-verbatim (flagged in the task report, not fixed here).
import {settingsService} from "$core/Services/SettingsService"
// old blob imported the `MIDISettings` default-settings object alongside the type but never
// actually referenced it (verified: only `MidiSettingsType` is used anywhere below) - dropped
// here since this tree's eslint (no-unused-vars) is stricter than whatever the old CRA-era config
// enforced; zero behavior change, an import-list-only trim.
import type {MidiSettingsType} from "$core/BaseSettings"
import {debounce, MIDINote, type MIDINoteStatus} from "$core/utils/Utilities";
import {MIDI_PRESETS, type MIDIPreset} from "$core/legacyConfig";

export enum PresetMidi {
    Start = 250,
    Continue = 251,
    Stop = 252,
}

export type MIDIEvent = [eventType: number, note: number, velocity: number]
type MIDICallback = (event: MIDIEvent, preset?: PresetMidi) => void
type InputsCallback = (inputs: WebMidi.MIDIInput[]) => void

export class MIDIListener {
    private listeners: MIDICallback[] = []
    private inputsListeners: InputsCallback[] = []
    MIDIAccess: WebMidi.MIDIAccess | null = null
    connectedMidiSources: WebMidi.MIDIInput[] = []
    settings: MidiSettingsType
    notes: MIDINote[] = []
    inputs: WebMidi.MIDIInput[] = []

    constructor() {
        this.settings = settingsService.getDefaultMIDISettings()
    }

    init = async (): Promise<WebMidi.MIDIAccess | null> => {
        this.settings = settingsService.getMIDISettings()
        this.loadPreset(this.settings.selectedPreset)
        if (!this.settings.enabled) return null
        if (this.MIDIAccess) return this.MIDIAccess
        const access = await this.requestAccess()
        if (access) {
            this.handleMIDIState(access)
        }
        return access
    }
    requestAccess = async (): Promise<WebMidi.MIDIAccess | null> => {
        try {
            if ("requestMIDIAccess" in navigator) {
                const access = await navigator.requestMIDIAccess()
                this.handleMIDIState(access)
                this.settings.enabled = true
                this.saveSettings()
                return access
            } else {
                console.warn("Midi not available")
                return null
            }
        } catch (e) {
            console.error(e)
            return null
        }
    }
    destroy = () => {
        this.listeners = []
        this.inputs = []
        this.MIDIAccess?.removeEventListener('statechange', this.reloadMidiAccess)
        // @ts-expect-error currentMIDISource is not a declared field on this class (pre-existing
        // dead reference in the old blob - always undefined, this line is a no-op; preserved verbatim)
        this.currentMIDISource?.removeEventListener('midimessage', this.handleEvent)
        this.MIDIAccess = null
    }

    private handleMIDIState = (e: WebMidi.MIDIAccess) => {
        this.MIDIAccess?.removeEventListener('statechange', this.reloadMidiAccess)
        this.MIDIAccess = e
        e.addEventListener('statechange', this.reloadMidiAccess)
        const midiInputs = Array.from(this.MIDIAccess.inputs.values())
        this.setSourcesAndConnect(midiInputs)
        this.setAndDispatchInputs(midiInputs)
    }
    reloadMidiAccess = () => {
        if (this.MIDIAccess) this.handleMIDIState(this.MIDIAccess)
        this.setAndDispatchInputs(this.inputs)
    }
    private setAndDispatchInputs = (inputs: WebMidi.MIDIInput[]) => {
        this.inputs = inputs
        this.dispatchInputsChange()
    }
    private dispatchInputsChange = debounce(() => {
        this.inputsListeners.forEach(l => l(this.inputs))
    }, 50)
    disconnectCurrentSources = () => {
        this.connectedMidiSources.forEach(s => s.removeEventListener('midimessage', this.handleEvent))
        this.connectedMidiSources = []
    }
    setSourcesAndConnect = (sources: WebMidi.MIDIInput[]) => {
        this.disconnectCurrentSources()
        this.connectedMidiSources = sources
        sources.forEach(s => s.addEventListener('midimessage', this.handleEvent))
    }
    getCurrentPreset = () => {
        return this.settings.presets[this.settings.selectedPreset]
    }
    loadPreset = (name: string) => {
        const values = Object.values(this.settings.presets)
        const preset = values.find(p => p.name === name) ?? MIDI_PRESETS.find(p => p.name === name)
        if (preset) {
            this.settings.selectedPreset = name
            this.notes = preset.notes.map((midi, i) => {
                return new MIDINote(i, midi)
            })
            this.saveSettings()
        } else {
            throw new Error(`No preset with name "${name}" found! "${values.map(p => p.name).join(", ")}" available`)
        }
    }
    updateNoteOfCurrentPreset = (index: number, midi: number, status?: MIDINoteStatus) => {
        const savedNote = this.notes[index]
        if (savedNote) {
            savedNote.setMidi(midi)
            savedNote.status = status ?? savedNote.status
            const preset = this.getCurrentPreset()
            if (!preset) throw new Error("No preset with this name found!")
            preset.notes[index] = midi
        }
        this.saveSettings()
        return savedNote
    }
    isPresetBuiltin = (name: string) => {
        return MIDI_PRESETS.some(p => p.name === name)
    }
    deletePreset = (name: string) => {
        delete this.settings.presets[name]
        this.saveSettings()
    }
    createPreset = (preset: MIDIPreset) => {
        this.settings.presets[preset.name] = preset
        this.saveSettings()
    }
    getPresets = () => {
        return Object.values(this.settings.presets)
    }
    getNotesOfMIDIevent = (midi: number) => {
        return this.notes.filter(n => n.midi === midi)
    }
    updateShortcut = (shortcutType: string, midi: number, status?: MIDINoteStatus) => {
        const savedNote = this.settings.shortcuts.find(s => s.type === shortcutType)
        if (savedNote) {
            savedNote.midi = midi
            savedNote.status = status ?? savedNote.status
        }
        this.saveSettings()
        return savedNote
    }
    setSettings = (settings: MidiSettingsType) => {
        this.settings = settings
        this.saveSettings()
    }
    saveSettings = () => {
        settingsService.updateMIDISettings(this.settings)
    }
    broadcastEvent = (event: MIDIEvent) => {
        this.MIDIAccess?.outputs.forEach(output => {
            output.send(event)
        })
    }
    broadcastNoteClick = (note: number, duration = 500) => {
        this.broadcastEvent([0x90, note, 127])
        setTimeout(() => {
            this.broadcastEvent([0x80, note, 0])
        }, duration)
    }
    handleEvent = (e: WebMidi.MIDIMessageEvent) => {
        const {data} = e
        const event = [data[0], data[1], data[2]] as MIDIEvent
        let preset: PresetMidi | undefined
        switch (event[0]) {
            case PresetMidi.Start:
                preset = PresetMidi.Start;
                break
            case PresetMidi.Continue:
                preset = PresetMidi.Continue;
                break
            case PresetMidi.Stop:
                preset = PresetMidi.Stop;
                break
        }
        this.listeners.forEach(l => l(event, preset))
    }
    //any of the channels
    isUp = (code: number) => {
        return code > 127 && code < 144
    }
    isDown = (code: number) => {
        return code > 143 && code < 160
    }

    addListener = (listener: MIDICallback) => {
        this.listeners.push(listener)
    }
    addInputsListener = (listener: InputsCallback) => {
        this.inputsListeners.push(listener)
    }
    removeInputsListener = (listener: InputsCallback) => {
        this.inputsListeners = this.inputsListeners.filter(l => l !== listener)
    }
    removeListener = (listener: MIDICallback) => {
        this.listeners = this.listeners.filter(l => l !== listener)
    }
    clear = () => {
        this.listeners = []
        this.inputsListeners = []
    }
}

export const MIDIProvider = new MIDIListener()
