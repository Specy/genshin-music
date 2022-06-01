import { APP_NAME } from "appConfig"
import { settingsService } from "lib/services/SettingsService"
import { MIDISettings } from "../BaseSettings"


export type MIDIEvent = [eventType: number, note: number, velocity: number]
type MIDICallback = (event: MIDIEvent) => void
type InputsCallback = (inputs: WebMidi.MIDIInput[]) => void

export class MIDIListener {
    private listeners: MIDICallback[] = []
    private inputsListeners: InputsCallback[] = []
    MIDIAccess: WebMidi.MIDIAccess | null = null
    currentMIDISource: WebMidi.MIDIInput | null = null
    settings: typeof MIDISettings
    inputs: WebMidi.MIDIInput[] = []
    constructor() {
        this.settings = settingsService.getMIDISettings()
        if (this.settings.enabled) this.create()
    }
    create = async (): Promise<WebMidi.MIDIAccess | null> => {
        if (this.MIDIAccess) return this.MIDIAccess
        if (navigator.requestMIDIAccess) {
            try{
                const access = await navigator.requestMIDIAccess()
                this.handleMIDIState(access)
                return access
            }catch(e){
                console.error(e)
                return null
            }

        } else {
            console.log("Midi not available")
            return null
        }
    }
    enable = () => {
        this.settings.enabled = true
        this.saveSettings()
        return this.create()
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
        const midiInputs = this.MIDIAccess.inputs.values()
        const inputs = []
        for (let input = midiInputs.next(); input && !input.done; input = midiInputs.next()) {
            inputs.push(input.value)
        }
        this.inputs = inputs
        const savedSource = inputs.find(input => {
            return input.name + " " + input.manufacturer === this.settings.currentSource
        }) || null
        this.dispatchInputs()
        if (inputs.length) this.selectSource(savedSource || inputs[0])
    }
    reloadMidiAccess = () => {
        if (this.MIDIAccess) this.handleMIDIState(this.MIDIAccess)
        this.dispatchInputs()
    }
    private dispatchInputs = () => {
        this.inputsListeners.forEach(l => l(this.inputs))
    }
    selectSource = (source: WebMidi.MIDIInput) => {
        this.settings.currentSource = source.name + " " + source.manufacturer
        this.saveSettings()
        //@ts-ignore
        this.currentMIDISource?.removeEventListener('midimessage', this.handleEvent)
        this.currentMIDISource = source
        this.currentMIDISource.addEventListener('midimessage', this.handleEvent)
    }
    saveSettings = () => {
        settingsService.updateMIDISettings(this.settings)
    }
    handleEvent = (e: WebMidi.MIDIMessageEvent) => {
        const { data } = e
        const event = [data[0], data[1], data[2]] as MIDIEvent
        this.listeners.forEach(l => l(event))
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
