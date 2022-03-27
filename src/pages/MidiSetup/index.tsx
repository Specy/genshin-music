
import { SimpleMenu } from "components/SimpleMenu"
import './MidiSetup.css'
import { APP_NAME } from "appConfig"
import { getMIDISettings, MIDISettings } from "lib/BaseSettings"
import BaseNote from "components/BaseNote"
import { LAYOUT_IMAGES, MIDI_STATUS } from "appConfig"
import { ChangeEvent, Component } from 'react'
import { AUDIO_CONTEXT, INSTRUMENTS, IS_MIDI_AVAILABLE } from "appConfig"
import Instrument from "lib/Instrument"
import Shortcut from "./Shortcut"
import LoggerStore from "stores/LoggerStore"
import type { MIDINote } from "lib/Utils/Tools"
import { InstrumentName } from "types/GeneralTypes"

interface MidiSetupState{
    settings: typeof MIDISettings
    instrument: Instrument
    selectedNote: MIDINote | null
    selectedShortcut: string | null
    sources: WebMidi.MIDIInput[]
    selectedSource: WebMidi.MIDIInput | null
}

export default class MidiSetup extends Component<any, MidiSetupState> {
    state: MidiSetupState
    audioContext: AudioContext
    mounted: boolean
    MIDIAccess: WebMidi.MIDIAccess | null
    constructor(props: any) {
        super(props)
        this.state = {
            settings: getMIDISettings(),
            instrument: new Instrument(),
            selectedNote: null,
            selectedShortcut: null,
            sources: [],
            selectedSource: null
        }
        this.audioContext = AUDIO_CONTEXT
        this.mounted = true
        this.MIDIAccess = null
    }

    componentDidMount() {
        this.init()
    }
    componentWillUnmount() {
        const { sources, selectedSource } = this.state
        this.mounted = false
        if (this.MIDIAccess) this.MIDIAccess.removeEventListener('statechange', this.midiStateChange)
        //TODO connect to saved up keyboard
        sources?.forEach(source => {
            //@ts-ignore
            source.removeEventListener('midimessage',this.handleMidi)
        })
        //@ts-ignore
        if (selectedSource) selectedSource.removeEventListener('midimessage',this.handleMidi)
    }
    init = () => {
        this.loadInstrument(INSTRUMENTS[0])
        if (IS_MIDI_AVAILABLE) {
            navigator.requestMIDIAccess().then(this.initMidi, () => {
                LoggerStore.error('MIDI permission not accepted')
            })
        } else {
            LoggerStore.error('MIDI is not supported on this browser')
        }
    }
    initMidi = (e: WebMidi.MIDIAccess) => {
        const { settings } = this.state
        if (!this.mounted) return
        this.MIDIAccess = e
        this.MIDIAccess.addEventListener('statechange', this.midiStateChange)
        const midiInputs = this.MIDIAccess.inputs.values()
        const inputs: WebMidi.MIDIInput[] = []
        for (let input = midiInputs.next(); input && !input.done; input = midiInputs.next()) {
            inputs.push(input.value)
        }
        const selectedSource = inputs.find((input) => {
            return (input.name + " " + input.manufacturer) === settings.currentSource
        }) || inputs.length ? inputs[0] : null
        if(selectedSource) settings.currentSource = selectedSource.name + " " + selectedSource.manufacturer
        if(selectedSource) this.selectSource(selectedSource)
        this.saveLayout()
        this.setState({ sources: inputs, selectedSource})
    }
    midiStateChange = () => {
        if (!this.mounted) return
        const { sources } = this.state
        if(this.MIDIAccess){
            const midiInputs = this.MIDIAccess.inputs.values()
            const inputs = []
            for (let input = midiInputs.next(); input && !input.done; input = midiInputs.next()) {
                inputs.push(input.value)
            }
            this.setState({ sources: inputs })
    
            if (sources.length > inputs.length)
                LoggerStore.warn('Device disconnected')
            else if (inputs.length > 0)
                LoggerStore.warn('Device connected')
        }

    }
    selectMidi = (e: ChangeEvent<HTMLSelectElement>) => {
        if (!this.mounted) return
        const { sources, settings } = this.state
        const nextSource = sources.find(s => s.id === e.target.value)
        if (!nextSource) return
        this.selectSource(nextSource)
        settings.currentSource = nextSource.name + " " + nextSource.manufacturer
        this.setState({ selectedSource: nextSource, settings })
        this.saveLayout()
    }
    selectSource = (source: WebMidi.MIDIInput) => {
        const { selectedSource } = this.state
        //@ts-ignore
        if (selectedSource) selectedSource.removeEventListener('midimessage', this.handleMidi)
        source.addEventListener('midimessage', this.handleMidi)
    } 
    deselectNotes = () => {
        const { settings } = this.state
        settings.notes.forEach(note => {
            note.status = note.midi < 0 ? 'wrong' : 'right'
        })
        this.setState({ settings })
    }
    saveLayout = () => {
        const { settings } = this.state
        settings.enabled = true
        this.setState({ settings })
        localStorage.setItem(APP_NAME + '_MIDI_Settings', JSON.stringify(this.state.settings))
    }
    loadInstrument = async (name: InstrumentName) => {
        this.state.instrument?.delete?.()
        const newInstrument = new Instrument(name)
        await newInstrument.load()
        if (!this.mounted) return
        newInstrument.connect(this.audioContext.destination)
        this.setState({
            instrument: newInstrument
        })
    }
    checkIfUsed = (midi: number, type: 'all' | 'shortcuts' | 'notes') => {
        const { shortcuts, notes } = this.state.settings
        if (shortcuts.find(e => e.midi === midi) && ['all','shortcuts'].includes(type) ) return true
        if(notes.find(e => e.midi === midi) && ['all','notes'].includes(type) ) return true
        return false
    }
    handleMidi = (event: WebMidi.MIDIMessageEvent) => {
        const { selectedNote, settings, selectedShortcut } = this.state
        const eventType = event.data[0]
        const note = event.data[1]
        const velocity = event.data[2]
        if (MIDI_STATUS.down === eventType && velocity !== 0) {
            if (selectedNote) {
                if(this.checkIfUsed(note,'shortcuts')) return LoggerStore.warn('Key already used')
                selectedNote.midi = note
                this.deselectNotes()
                this.setState({ selectedNote: null })
                this.saveLayout()
            }
            
            if (selectedShortcut) {
                const shortcut = settings.shortcuts.find(e => e.type === selectedShortcut)
                if(this.checkIfUsed(note,'all')) return LoggerStore.warn('Key already used')
                if (shortcut) {
                    shortcut.midi = note
                    shortcut.status = note < 0 ? 'wrong' : 'right'
                    this.setState({ settings: settings })
                    this.saveLayout()
                }
            }
            const shortcut = settings.shortcuts.find(e => e.midi === note)
            if(shortcut){
                shortcut.status = 'clicked'
                setTimeout(() => {
                    shortcut.status = note < 0 ? 'wrong' : 'right'
                    this.setState({ settings: settings })
                },150)
                this.setState({ settings: settings })

            }
            const keyboardNotes = settings.notes.filter(e => e.midi === note)
            keyboardNotes.forEach(keyboardNote => {
                this.handleClick(keyboardNote, true)
            })
        }
    }
    handleClick = (note: MIDINote, animate = false) => {
        const { settings } = this.state
        if (!animate) this.deselectNotes()
        note.status = 'clicked'
        if (animate) {
            setTimeout(() => {
                note.status = note.midi < 0 ? 'wrong' : 'right'
                this.setState({ settings })
            }, 200)
            this.setState({ settings, selectedShortcut: null })
        } else {
            this.setState({ settings, selectedNote: note, selectedShortcut: null })
        }
        this.playSound(note)
    }
    handleShortcutClick = (shortcut: string) => {
        this.deselectNotes()
        if (this.state.selectedShortcut === shortcut) {
            return this.setState({ selectedShortcut: null, selectedNote: null })
        }
        this.setState({ selectedShortcut: shortcut, selectedNote: null })
    }
    playSound = (note: MIDINote) => {
        if (note === undefined) return
        this.state.instrument.play(note.index, 1)
    }

    render() {
        const { settings, sources, selectedShortcut, selectedSource } = this.state
        return <div className="default-page">
            <SimpleMenu/>
            <div className="default-content" style={{ alignItems: 'center' }}>
                <div className="column midi-setup-column">
                    <div>
                        Select MIDI device:
                        <select
                            className="midi-select"
                            value={selectedSource?.name || 'None'}
                            onChange={this.selectMidi}
                        >
                            <option disabled value={'None'}> None</option>
                            {sources.map((e, i) => <option value={e.id} key={i}>
                                {e.name}
                            </option>)
                            }
                        </select>
                    </div>
                    <div style={{ margin: '0.5rem 0' }}>
                        Click on the note to map, then press your MIDI keyboard
                    </div>
                </div>
                <div className="midi-setup-content">
                    <div
                        className={APP_NAME === 'Genshin' ? "keyboard" : "keyboard keyboard-5"}
                        style={{ marginTop: 'auto', width: 'fit-content' }}
                    >
                        {settings.notes.map((note, i) => {
                            //@ts-ignore
                            const noteImage = LAYOUT_IMAGES[settings.notes.length][note.index]
                            return <BaseNote
                                key={i}
                                handleClick={this.handleClick}
                                data={note}
                                noteImage={noteImage}
                                noteText={note.midi < 0 ? 'NA' : String(note.midi)}
                            />
                        })}
                    </div>
                    <div className="midi-shortcuts-wrapper">
                        <div style={{ fontSize: '1.5rem' }}>
                            Shortcuts
                        </div>
                        <div className="midi-shortcuts">
                            {settings.shortcuts.map(shortcut =>
                                <Shortcut
                                    key={shortcut.type}
                                    type={shortcut.type}
                                    status={shortcut.status}
                                    midi={shortcut.midi}
                                    selected={selectedShortcut === shortcut.type}
                                    onClick={this.handleShortcutClick}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    }
}