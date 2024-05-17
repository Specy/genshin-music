import {settingsService} from "$lib/Services/SettingsService"
import {MIDISettings} from "../BaseSettings"
import {debounce, MIDINote, MIDINoteStatus} from "$lib/utils/Utilities";
import {MIDI_PRESETS, MIDIPreset} from "$config";

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
    settings: typeof MIDISettings
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
        return this.requestAccess()
    }
    requestAccess = async () : Promise<WebMidi.MIDIAccess | null>  => {
        try {
            if ("requestMIDIAccess" in navigator) {
                const access = await navigator.requestMIDIAccess()
                this.handleMIDIState(access)
                return access
            } else {
                console.log("Midi not available")
                return null
            }
        } catch (e) {
            console.error(e)
            return null
        }
    }
    enable = () => {
        const res = this.requestAccess()
        if (!res) return null
        this.settings.enabled = true
        this.saveSettings()
        return res
    }
    destroy = () => {
        this.listeners = []
        this.inputs = []
        this.MIDIAccess?.removeEventListener('statechange', this.reloadMidiAccess)
        //@ts-ignore
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
        //@ts-ignore
        this.connectedMidiSources.forEach(s => s.removeEventListener('midimessage', this.handleEvent))
        this.connectedMidiSources = []
    }
    setSourcesAndConnect = (sources: WebMidi.MIDIInput[]) => {
        this.disconnectCurrentSources()
        this.connectedMidiSources = sources
        //@ts-ignore
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
    setSettings = (settings: typeof MIDISettings) => {
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
