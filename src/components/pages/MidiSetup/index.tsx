import {APP_NAME, INSTRUMENTS, MIDI_PRESETS, MIDIPreset} from "$config"
import BaseNote from "$cmp/shared/Miscellaneous/BaseNote"
import {Component} from 'react'
import MidiShortcut from "$cmp/pages/MidiSetup/MidiShortcut"
import {logger} from "$stores/LoggerStore";
import {MIDINote, MIDIShortcut} from "$lib/utils/Utilities"
import {InstrumentName} from "$types/GeneralTypes"
import {MIDIEvent, MIDIProvider} from "$lib/Providers/MIDIProvider"
import {AudioProvider} from "$lib/Providers/AudioProvider"
import {AudioPlayer} from '$lib/audio/AudioPlayer'
import {InstrumentData} from '$lib/Songs/SongClasses'
import {Instrument} from '$lib/audio/Instrument'
import s from './MidiSetup.module.css'
import {AppButton} from "$cmp/shared/Inputs/AppButton";
import {FaPlus, FaTrash} from "react-icons/fa";
import {asyncConfirm, asyncPrompt} from "$cmp/shared/Utility/AsyncPrompts";
import {Row} from "$cmp/shared/layout/Row";
import {Column} from "$cmp/shared/layout/Column";

interface MidiSetupState {
    audioPlayer: AudioPlayer
    shortcuts: MIDIShortcut[]
    presets: MIDIPreset[]
    notes: MIDINote[]
    currentPreset: string
    selectedNote: MIDINote | null
    selectedShortcut: string | null
    sources: WebMidi.MIDIInput[]
    selectedSource: WebMidi.MIDIInput | null
}

const baseInstrument = new Instrument()
//TODO refactor this component
export default class MidiSetup extends Component<{}, MidiSetupState> {
    state: MidiSetupState
    mounted: boolean

    constructor(props: {}) {
        super(props)
        this.state = {
            audioPlayer: new AudioPlayer("C"),
            notes: MIDIProvider.notes,
            currentPreset: "default",
            shortcuts: MIDIProvider.settings.shortcuts,
            presets: MIDIProvider.getPresets(),
            selectedNote: null,
            selectedShortcut: null,
            sources: [],
            selectedSource: null
        }
        this.mounted = true
    }

    componentDidMount() {
        this.init()
    }

    componentWillUnmount() {
        this.mounted = false
        this.state.audioPlayer.destroy()
        MIDIProvider.removeInputsListener(this.midiStateChange)
        MIDIProvider.removeListener(this.handleMidi)
        AudioProvider.clear()
    }

    init = async () => {
        await this.loadInstrument(INSTRUMENTS[0])
        await MIDIProvider.enable()
        MIDIProvider.addInputsListener(this.midiStateChange)
        MIDIProvider.addListener(this.handleMidi)

        this.setState({
            sources: MIDIProvider.inputs,
            notes: MIDIProvider.notes,
            currentPreset: MIDIProvider.settings.selectedPreset,
            shortcuts: MIDIProvider.settings.shortcuts,
            presets: MIDIProvider.getPresets(),
        })
    }
    midiStateChange = (inputs: WebMidi.MIDIInput[]) => {
        if (!this.mounted) return
        this.setState({sources: inputs})
    }

    deselectNotes = () => {
        const {notes} = this.state
        notes.forEach(note => {
            note.status = note.midi < 0 ? 'wrong' : 'right'
        })
        this.setState({notes})
    }
    loadInstrument = async (name: InstrumentName) => {
        const {audioPlayer} = this.state
        const result = await audioPlayer.syncInstruments([new InstrumentData({name})])
        if (result.some(e => !e)) return logger.error('Error loading instrument')
        if (!this.mounted) return audioPlayer.destroy()
        this.setState({audioPlayer})
    }
    checkIfMidiIsUsed = (midi: number, type: 'all' | 'shortcuts' | 'notes') => {
        const {shortcuts, notes} = this.state
        if (shortcuts.find(e => e.midi === midi) && ['all', 'shortcuts'].includes(type)) return true
        if (notes.find(e => e.midi === midi) && ['all', 'notes'].includes(type)) return true
        return false
    }
    loadPreset = (name: string) => {
        MIDIProvider.loadPreset(name)
        this.setState({
            notes: MIDIProvider.notes,
            currentPreset: name
        })
    }
    handleMidi = ([eventType, note, velocity]: MIDIEvent) => {
        const {selectedNote, currentPreset, notes, selectedShortcut, shortcuts} = this.state
        if (MIDIProvider.isDown(eventType) && velocity !== 0) {
            if (selectedNote) {
                if (this.checkIfMidiIsUsed(note, 'shortcuts')) return logger.warn('Key already used')
                this.deselectNotes()
                if (MIDIProvider.isPresetBuiltin(currentPreset)) return logger.warn('Cannot edit built-in preset, create a new one to edit it')
                MIDIProvider.updateNoteOfCurrentPreset(selectedNote.index, note, "right")
                this.setState({selectedNote: null, notes: MIDIProvider.notes})
            }
            if (selectedShortcut) {
                const shortcut = shortcuts.find(e => e.type === selectedShortcut)
                if (this.checkIfMidiIsUsed(note, 'all')) return logger.warn('Key already used')
                if (shortcut) {
                    MIDIProvider.updateShortcut(shortcut.type, note, note < 0 ? 'wrong' : 'right')
                    this.setState({shortcuts: MIDIProvider.settings.shortcuts})
                }
            }
            const shortcut = shortcuts.find(e => e.midi === note)
            if (shortcut) {
                MIDIProvider.updateShortcut(shortcut.type, note, 'clicked')
                setTimeout(() => {
                    MIDIProvider.updateShortcut(shortcut.type, note, note < 0 ? 'wrong' : 'right')
                    this.setState({shortcuts: MIDIProvider.settings.shortcuts})
                }, 150)
                this.setState({shortcuts: MIDIProvider.settings.shortcuts})

            }
            const keyboardNotes = notes.filter(e => e.midi === note)
            keyboardNotes.forEach(keyboardNote => {
                this.handleClick(keyboardNote, true)
            })
        }
    }
    handleClick = (note: MIDINote, animate = false) => {
        const {notes} = this.state
        if (!animate) this.deselectNotes()
        note.status = 'clicked'
        if (animate) {
            setTimeout(() => {
                note.status = note.midi < 0 ? 'wrong' : 'right'
                this.setState({notes})
            }, 200)
            this.setState({notes, selectedShortcut: null})
        } else {
            this.setState({notes, selectedNote: note, selectedShortcut: null})
        }
        this.playSound(note)
    }
    handleShortcutClick = (shortcut: string) => {
        this.deselectNotes()
        if (this.state.selectedShortcut === shortcut) {
            return this.setState({selectedShortcut: null, selectedNote: null})
        }
        this.setState({selectedShortcut: shortcut, selectedNote: null})
    }
    playSound = (note: MIDINote) => {
        if (note === undefined) return
        const {audioPlayer} = this.state
        audioPlayer.playNoteOfInstrument(0, note.index)
    }

    createPreset = async () => {
        const {presets, notes} = this.state
        while (true) {
            const name = await asyncPrompt("Write the name of the preset")
            if (!name) return
            if (MIDIProvider.isPresetBuiltin(name) || presets.some(p => p.name === name)) {
                logger.warn('Preset with this name already exists')
                continue
            }
            MIDIProvider.createPreset({
                name,
                notes: this.state.notes.map(_ => -1)
            })
            this.setState({presets: MIDIProvider.getPresets()})
            this.loadPreset(name)
            return
        }
    }
    deletePreset = async (name: string) => {
        if (MIDIProvider.isPresetBuiltin(name)) return logger.warn('Cannot delete built-in preset')
        if (!await asyncConfirm(`Are you sure you want to delete the preset "${name}"?`)) return
        MIDIProvider.deletePreset(name)
        MIDIProvider.loadPreset('default')
        this.setState({
            presets: MIDIProvider.getPresets(),
            notes: MIDIProvider.notes,
            currentPreset: 'default'
        })
    }

    render() {
        const {notes, currentPreset, presets, shortcuts, sources, selectedShortcut, selectedSource} = this.state
        return <>
            <Column gap={'1rem'}>
                <Row gap={'1rem'} align={'center'} justify={'between'}>
                    Connected MIDI devices:
                    <Row gap={'0.5rem'} style={{flexWrap: 'wrap'}}>

                        {sources.length > 0
                            ? sources.map(s =>
                                <div
                                    key={s.id}
                                    style={{
                                        borderRadius: '0.3rem',
                                        padding: '0.2rem 0.4rem',
                                        border: 'solid 0.1rem var(--secondary)',
                                    }}
                                >
                                    {s.name} - {s.id}
                                </div>
                            )
                            : 'No connected devices'
                        }
                    </Row>

                </Row>
                <Row justify={'between'} gap={'0.5rem'}>
                    MIDI layout preset:
                    <Row gap={'0.5rem'}>
                        <select
                            className="midi-select"
                            style={{marginLeft: '0.5rem'}}
                            value={currentPreset}
                            onChange={(e) => {
                                this.loadPreset(e.target.value)
                            }}
                        >
                            <optgroup label={'App presents'}>
                                {MIDI_PRESETS.map((e) => <option value={e.name} key={e.name}>
                                    {e.name}
                                </option>)}
                            </optgroup>
                            <optgroup label={"Your presets"}>
                                {presets.map((e) => <option value={e.name} key={e.name}>
                                    {e.name}
                                </option>)}
                            </optgroup>
                        </select>
                        <AppButton onClick={() => this.deletePreset(currentPreset)} className={'flex items-center'}
                                   style={{gap: "0.5rem"}}>
                            <FaTrash/>
                            Delete preset
                        </AppButton>
                        <AppButton onClick={this.createPreset} className={'flex items-center'} style={{gap: "0.5rem"}}>
                            <FaPlus/>
                            Create new preset
                        </AppButton>
                    </Row>
                </Row>
                <div style={{margin: '0.5rem 0'}}>
                    Click on the note to select it, then press your MIDI keyboard to assign that note to the key. You
                    can click it again to change it.
                </div>
            </Column>

            <div className={s['midi-setup-content']}>
                <div
                    className={APP_NAME === 'Genshin' ? "keyboard" : "keyboard keyboard-5"}
                    style={{margin: '1.5rem 0', width: 'fit-content'}}
                >
                    {notes.map((note, i) => {
                        return <BaseNote
                            key={i}
                            handleClick={() => this.handleClick(note)}
                            data={note}
                            noteImage={baseInstrument.notes[i]?.noteImage}
                            noteText={note.midi < 0 ? 'N/A' : String(note.midi)}
                        />
                    })}
                </div>
                <div className={s['midi-shortcuts-wrapper']}>
                    <h1>
                        MIDI Shortcuts
                    </h1>
                    <div className={s['midi-shortcuts']}>
                        {shortcuts.map(shortcut =>
                            <MidiShortcut
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
        </>
    }
}