
import { SimpleMenu } from "components/SimpleMenu"
import './MidiSetup.css'
import { appName } from "appConfig"
import { LoggerEvent } from "lib/Utils"
import { getMIDISettings } from "lib/SettingsObj"
import BaseNote from "components/BaseNote"
import { layoutImages, MIDI_STATUS } from "appConfig"
import React, { Component } from 'react'
import { audioContext, instruments, isMidiAvailable } from "appConfig"
import Instrument from "lib/Instrument"

export default class MidiSetup extends Component {
    constructor(props) {
        super(props)
        this.state = {
            settings: getMIDISettings(),
            instrument: new Instrument(),
            selectedNote: null,
            sources: [],
            selectedSource: undefined
        }
        this.audioContext = audioContext
        this.mounted = true
        this.MidiAccess = undefined
    }

    componentDidMount() {
        this.init()
    }
    componentWillUnmount() {
        const { sources } = this.state
        this.mounted = false
        if(this.MidiAccess) this.MidiAccess.onstatechange = null
        sources?.forEach(source => {
            source.onmidimessage = null
        })
        if (this.selectedSource) this.selectedSource.onmidimessage = null
    }
    init = () => {
        this.loadInstrument(instruments[0])
        if (isMidiAvailable) {
            navigator.requestMIDIAccess().then(this.initMidi, () => {
                new LoggerEvent('Error', 'MIDI permission not accepted').trigger()
            })
        } else {
            new LoggerEvent('Error', 'MIDI is not supported on this browser').trigger()
        }
    }
    initMidi = (e) => {
        if(!this.mounted) return
        e.onstatechange = this.midiStateChange
        this.MidiAccess = e
        const midiInputs = this.MidiAccess.inputs.values()
        const inputs = []
        for (let input = midiInputs.next(); input && !input.done; input = midiInputs.next()) {
            inputs.push(input.value)
        }
        this.setState({ sources: inputs })
    }
    midiStateChange = (e) => {
        if(!this.mounted) return
        const { sources } = this.state
        const midiInputs = this.MidiAccess.inputs.values()
        const inputs = []
        for (let input = midiInputs.next(); input && !input.done; input = midiInputs.next()) {
            inputs.push(input.value)
        }
        this.setState({ sources: inputs })

        if (sources.length > inputs.length)
            new LoggerEvent('Warning', 'Device disconnected').trigger()
        else if (inputs.length > 0)
            new LoggerEvent('Warning', 'Device connected').trigger()
    }
    selectMidi = (e) => {
        if(!this.mounted) return
        const { sources, selectedSource, settings } = this.state
        const nextSource = sources.find(s => s.id === e.target.value)
        if (selectedSource) selectedSource.onmidimessage = null
        if(!nextSource) return
        nextSource.onmidimessage = this.handleMidi
        settings.currentSource = nextSource.name + " " + nextSource.manufacturer
        this.setState({ selectedSource: nextSource, settings })
        this.saveLayout()
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
        this.setState({settings})
        localStorage.setItem(appName + '_MIDI_Settings', JSON.stringify(this.state.settings))
    }
    loadInstrument = async (name) => {
        this.state.instrument?.delete?.()
        const newInstrument = new Instrument(name)
        await newInstrument.load()
        if (!this.mounted) return
        newInstrument.connect(this.audioContext.destination)
        this.setState({
            instrument: newInstrument
        })
    }
    handleMidi = (event) => {
        const { selectedNote, settings } = this.state
        const { data } = event
        const [eventType, note, velocity] = data

        if (MIDI_STATUS.down === eventType && velocity !== 0) {
            if (selectedNote) {
                selectedNote.midi = note
                this.deselectNotes()
                this.setState({ selectedNote: null })
                this.saveLayout()
            }
            const keyboardNotes = settings.notes.filter(e => e.midi === note)
            keyboardNotes.forEach(keyboardNote => {
                this.handleClick(keyboardNote, true)
            })
        }
    }
    handleClick = (note, animate = false) => {
        const { settings } = this.state
        if (!animate) this.deselectNotes()
        note.status = 'clicked'
        if (animate) {
            setTimeout(() => {
                note.status = note.midi < 0 ? 'wrong' : 'right'
                this.setState({ settings })
            }, 200)
            this.setState({ settings })
        } else {
            this.setState({ settings, selectedNote: note })
        }
        this.playSound(note)
    }

    playSound = (note) => {
        if (note === undefined) return
        this.state.instrument.play(note.index, 1)
    }

    render() {
        const { settings, sources } = this.state
        const { changePage } = this.props
        return <div className="default-page">
            <SimpleMenu functions={{ changePage: changePage }} />
            <div className="default-content" style={{ alignItems: 'center' }}>
                <div className="column">
                    <div>
                        Select MIDI device:
                        <select
                            className="midi-select"
                            defaultValue={'None'}
                            onChange={this.selectMidi}
                        >
                            <option disabled value={'None'}> None</option>
                            {sources.map((e, i) => <option value={e.id} key={i}>
                                {e.name}
                            </option>)
                            }
                        </select>
                    </div>
                    <div style={{ margin: '1rem 0' }}>
                        Click on the note to map, then press your MIDI keyboard
                    </div>
                </div>


                <div
                    className={appName === 'Genshin' ? "keyboard" : "keyboard keyboard-5"}
                    style={{ marginTop: 'auto', width: 'fit-content' }}
                >
                    {settings.notes.map((note, i) => {
                        const noteImage = layoutImages[settings.notes.length][note.index]
                        return <BaseNote
                            key={i}
                            handleClick={this.handleClick}
                            data={note}
                            noteImage={`./assets/icons/keys/${noteImage}.svg`}
                            noteText={note.midi < 0 ? 'NA' : note.midi}
                        />
                    })}
                </div>
            </div>
        </div>
    }
}