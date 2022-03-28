import { APP_NAME } from "appConfig"
import { MIDISettings } from "./BaseSettings"


export type MIDIEvent = [eventType:number, note: number, velocity:number]
type MIDICallback = (event:MIDIEvent) => void
type InputsCallback = (inputs: WebMidi.MIDIInput[]) => void
export class MIDIListenerClass{
    private listeners: MIDICallback[] = []
    private inputsListeners: InputsCallback[] = []
    MIDIAccess: WebMidi.MIDIAccess | null = null
    currentMIDISource: WebMidi.MIDIInput | null = null
    settings: typeof MIDISettings
    inputs: WebMidi.MIDIInput[] = []
    constructor(){
        this.settings = MIDIListenerClass.loadSettings()
        if(this.settings.enabled) this.create()
    }
    create():Promise<WebMidi.MIDIAccess | null>{
        return new Promise((resolve) => {
            if(this.MIDIAccess) return resolve(this.MIDIAccess)
            if (navigator.requestMIDIAccess) {
                navigator.requestMIDIAccess().then(this.init, () => {
                    resolve(this.MIDIAccess)
                }).catch(() => resolve(null))
            } else {
                console.log("Midi not available")
                resolve(null)
            }
        })

    }
    enable(){
        this.settings.enabled = true
        this.create()
    }
    dispose(){
        this.listeners = []
        this.inputs = []
        this.MIDIAccess?.removeEventListener('statechange', this.reloadMidiAccess)
        //@ts-ignore
        this.currentMIDISource?.removeEventListener('midimessage', this.handleEvent)
        this.MIDIAccess = null
    }
    init(e: WebMidi.MIDIAccess){
        this.MIDIAccess?.removeEventListener('statechange', this.reloadMidiAccess)
        e.addEventListener('statechange', this.reloadMidiAccess)
        this.MIDIAccess = e
        const midiInputs = this.MIDIAccess.inputs.values()
        const inputs = []
        for (let input = midiInputs.next(); input && !input.done; input = midiInputs.next()) {
            inputs.push(input.value)
        }
        //@ts-ignore
        this.currentMIDISource?.removeEventListener('midimessage', this.handleEvent)
        this.currentMIDISource = inputs.find(input => {
            return input.name + " " + input.manufacturer === this.settings.currentSource
        }) || null
        this.inputs = inputs
        this.currentMIDISource?.addEventListener('midimessage', this.handleEvent)
    }
    reloadMidiAccess = () => {
        if (this.MIDIAccess) this.init(this.MIDIAccess)
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
    static loadSettings(){
        let settings = localStorage.getItem(APP_NAME + '_MIDI_Settings') as any
        try {
            settings = JSON.parse(settings)
        } catch (e) {
            settings = null
        }
        if (settings !== null) {
            if (settings.settingVersion !== MIDISettings.settingVersion) {
                return MIDISettings
            }
        } else {
            return MIDISettings
        }
        return MIDISettings
    }
    saveSettings(){
        localStorage.setItem(APP_NAME + '_MIDI_Settings', JSON.stringify(this.settings))
    }
    handleEvent(e: WebMidi.MIDIMessageEvent){
        const { data } = e
        const event = [data[0], data[1], data[2]] as MIDIEvent
        this.listeners.forEach(l => l(event))
    }
    addListener(listener: MIDICallback){
        this.listeners.push(listener)
    }
    addInputsListener(listener: InputsCallback){
        this.inputsListeners.push(listener)
    }
    removeInputsListener(listener: InputsCallback){
        this.inputsListeners = this.inputsListeners.filter(l => l !== listener)
    }
    removeListener(listener: MIDICallback){
        this.listeners = this.listeners.filter(l => l !== listener)
    }
    clear(){
        this.listeners = []
        this.inputsListeners = []
    }
}

export const MIDIListener = new MIDIListenerClass()
 