import { ChangeEvent, Component, useEffect, useState } from 'react'
import { FileElement, FilePicker } from 'components/FilePicker'
import { Midi, Track } from '@tonejs/midi'
import { numberToLayer, groupByIndex, mergeLayers } from 'lib/Utils/Tools'
import { ColumnNote, Column } from 'lib/Utils/SongClasses'
import { ComposedSong } from 'lib/Utils/ComposedSong'
import { APP_NAME, PITCHES, PitchesType } from 'appConfig'
import { FaInfoCircle } from 'react-icons/fa'
import useDebounce from 'lib/hooks/useDebounce'
import LoggerStore from 'stores/LoggerStore'
import { ThemeStore, ThemeStoreClass } from 'stores/ThemeStore'
import { observe } from 'mobx'
import { InstrumentKeys, LayerIndex } from 'types/GeneralTypes'
interface MidiImportProps {
    data: {
        instruments: [InstrumentKeys, InstrumentKeys, InstrumentKeys]
        selectedColumn: number
    }
    functions: {
        changeMidiVisibility: (override: boolean) => void
        changePitch: (pitch: PitchesType) => void
        loadSong: (song: ComposedSong) => void
    }
}
type CustomTrack = Track & {
    selected: boolean
    layer: LayerIndex
    name: string
    numberOfAccidentals: number
    numberOfOutOfRange: number
}

interface MidiImport {
    dispose: () => void
    state: {
        fileName: string
        tracks: CustomTrack[]
        bpm: number
        offset: number
        pitch: PitchesType
        accidentals: number
        outOfRange: number
        totalNotes: number
        includeAccidentals: boolean
        theme: ThemeStoreClass
    }
    props: MidiImportProps
}
class MidiImport extends Component {
    constructor(props: MidiImportProps) {
        super(props)
        this.state = {
            fileName: '',
            bpm: 220,
            tracks: [],
            offset: 0,
            pitch: 'C',
            accidentals: 0,
            outOfRange: 0,
            totalNotes: 0,
            includeAccidentals: true,
            theme: ThemeStore
        }
        this.dispose = () => { }
    }
    componentDidMount() {
        this.dispose = observe(ThemeStore.state.data, () => {
            this.setState({ theme: { ...ThemeStore } })
        })
    }
    componentWillUnmount() {
        this.dispose()
    }
    handleFile = (files: FileElement<ArrayBuffer>[]) => {
        try {
            if (files.length === 0) return
            const file = files[0]
            const midi = new Midi(file.data as ArrayBuffer)
            const bpm = midi.header.tempos[0]?.bpm
            const key = midi.header.keySignatures[0]?.key
            const tracks = midi.tracks.map((track, i) => {
                return {
                    ...track,
                    selected: true,
                    layer: 0,
                    name: track.name || `Track n.${i + 1}`,
                    numberOfAccidentals: 0,
                    numberOfOutOfRange: 0
                }
            }) as CustomTrack[]
            this.setState({
                tracks: tracks,
                fileName: file.file.name,
                bpm: Math.floor(bpm * 4) || 220,
                offset: 0,
                pitch: PITCHES.includes(key as never) ? key : 'C',
            }, () => { if (this.state.tracks.length) this.convertMidi() })
        } catch (e) {
            console.error(e)
            LoggerStore.error('There was an error importing this file, is it a .mid file?')
        }
    }

    convertMidi = () => {
        const { tracks, bpm, offset, includeAccidentals, pitch } = this.state
        const selectedTracks = tracks.filter(track => track.selected)
        const notes: MidiNote[] = []
        let numberOfAccidentals = 0
        let outOfRange = 0
        let totalNotes = 0
        selectedTracks.forEach(track => {
            track.numberOfAccidentals = 0
            track.numberOfOutOfRange = 0
            track.notes.forEach(midiNote => {
                totalNotes++
                const note = MidiNote.fromMidi(
                    track.layer,
                    Math.floor(midiNote.time * 1000),
                    midiNote.midi - offset,
                )
                if (note.data.isAccidental) {
                    numberOfAccidentals++
                    track.numberOfAccidentals++
                }
                if (note.data.note !== -1) {
                    if (includeAccidentals || !note.data.isAccidental) {
                        notes.push(note)
                    }
                } else {
                    outOfRange++
                    track.numberOfOutOfRange++
                }
            })
        })
        const sorted = notes.sort((a, b) => a.time - b.time)
        const bpmToMs = Math.floor(60000 / bpm)
        const groupedNotes: MidiNote[][] = []
        while (sorted.length > 0) {
            let row = [sorted.shift() as MidiNote]
            let amount = 0
            for (let i = 0; i < sorted.length; i++) {
                if (row[0].time > sorted[i].time - bpmToMs / 9) amount++
            }
            groupedNotes.push([...row, ...sorted.splice(0, amount)])
        }
        const columns: Column[] = []
        let previousTime = 0
        groupedNotes.forEach(notes => {
            let note = notes[0]
            if (!note) return
            let elapsedTime = note.time - previousTime
            previousTime = note.time
            let emptyColumns = Math.floor((elapsedTime - bpmToMs) / bpmToMs)
            if (emptyColumns > -1) new Array(emptyColumns).fill(0).forEach(() => columns.push(new Column())) // adds empty columns
            let noteColumn = new Column()
            noteColumn.notes = notes.map(note => {
                return new ColumnNote(note.data.note, numberToLayer(note.layer))
            })
            columns.push(noteColumn)
        })
        columns.forEach(column => { //merges notes of different layer
            let groupedNotes = groupByIndex(column)
            column.notes = groupedNotes.map(group => {
                group[0].layer = mergeLayers(group)
                return group[0]
            })
        })
        const song = new ComposedSong("Untitled")
        song.columns = columns
        song.bpm = bpm
        song.instruments = this.props.data.instruments
        song.pitch = pitch
        const lastColumn = this.props.data.selectedColumn
        song.selected = lastColumn < song.columns.length ? lastColumn : 0
        if (song.columns.length === 0) {
            return LoggerStore.warn("There are no notes")
        }
        this.props.functions.loadSong(song)
        this.setState({
            accidentals: numberOfAccidentals,
            totalNotes: totalNotes,
            outOfRange: outOfRange
        })
    }

    editTrack = (index: number, data: Partial<CustomTrack>) => {
        const tracks = this.state.tracks
        Object.assign(tracks[index], data)
        this.setState({
            tracks
        }, () => { if (this.state.tracks.length > 0) this.convertMidi() })
    }
    changeOffset = (value: number) => {
        if (!Number.isInteger(value)) value = 0
        if (this.state.offset === value) return
        this.setState({
            offset: value
        }, () => { if (this.state.tracks.length > 0) this.convertMidi() })
    }
    changePitch = (value: PitchesType) => {
        this.props.functions.changePitch(value)
        this.setState({
            pitch: value
        })
    }
    toggleAccidentals = () => {
        this.setState({
            includeAccidentals: !this.state.includeAccidentals
        }, () => { if (this.state.tracks.length > 0) this.convertMidi() })
    }
    changeBpm = (value: number) => {
        if (!Number.isInteger(value)) value = 0
        if (this.state.bpm === value) return
        this.setState({
            bpm: value
        }, () => { if (this.state.tracks.length > 0) this.convertMidi() })
    }
    render() {
        const { handleFile, editTrack, state, changeBpm, changeOffset, changePitch } = this
        const { tracks, fileName, bpm, offset, pitch, accidentals, outOfRange, totalNotes, includeAccidentals, theme } = state
        const { functions } = this.props
        const { changeMidiVisibility } = functions
        const midiInputsStyle = {
            backgroundColor: theme.layer('primary', 0.2).toString(),
            color: theme.getText('primary').toString()
        }
        return <div className='floating-midi'>
            <div
                className='midi-row separator-border'
                style={{ width: '100%' }}
            >
                <FilePicker onChange={handleFile} as='buffer'>
                    <button className="midi-btn" style={midiInputsStyle}>
                        Click to load midi file
                    </button>
                </FilePicker>
                <div style={{ margin: '0 0.5rem', maxWidth: '8rem', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                    {fileName}
                </div>
                <button
                    className='midi-btn'
                    style={{ marginLeft: 'auto', ...midiInputsStyle }}
                    onClick={() => changeMidiVisibility(false)}
                >
                    Close
                </button>
            </div>
            <table className='separator-border' style={{ width: "100%" }}>
                <tbody>
                    <tr>
                        <td>
                            <div style={{ marginRight: '0.5rem' }}>Bpm:</div>
                        </td>
                        <td style={{ display: 'flex', justifyContent: 'flex-end', alignItems: "center" }}>
                            <NumberInput
                                value={bpm}
                                onChange={changeBpm}
                                delay={600}
                                style={midiInputsStyle}
                                step={5}
                            />
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <div style={{ marginRight: '0.5rem' }}>Scale notes by: </div>
                        </td>
                        <td>
                            <NumberInput
                                value={offset}
                                onChange={changeOffset}
                                delay={600}
                                style={midiInputsStyle}
                                step={1}
                            />
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <div style={{ marginRight: '0.5rem' }}>Pitch:</div>
                        </td>
                        <td style={{ display: 'flex', justifyContent: 'flex-end', alignItems: "center" }}>
                            <select
                                className='midi-select'
                                value={pitch}
                                onChange={(event: ChangeEvent<HTMLSelectElement>) => changePitch(event.target.value as PitchesType)}
                                style={{ width: '5rem', ...midiInputsStyle }}
                            >
                                <option value="C">C</option>
                                <option value="Db">Db</option>
                                <option value="D">D</option>
                                <option value="Eb">Eb</option>
                                <option value="E">E</option>
                                <option value="F">F</option>
                                <option value="Gb">Gb</option>
                                <option value="G">G</option>
                                <option value="Ab">Ab</option>
                                <option value="A">A</option>
                                <option value="Bb">Bb</option>
                                <option value="B">B</option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <td>
                            <div style={{ marginRight: '0.5rem' }}>Include accidentals:</div>
                        </td>
                        <td style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <input type='checkbox'
                                checked={includeAccidentals}
                                onChange={this.toggleAccidentals}
                            />
                        </td>
                    </tr>
                </tbody>
            </table>
            {tracks.length && <div className='midi-column separator-border' style={{ width: '100%' }}>
                <div className='midi-column' style={{ width: '100%' }}>
                    <div>Select midi tracks</div>
                    {tracks.map((track, i) =>
                        <TrackInfo
                            data={track}
                            key={i}
                            index={i}
                            editTrack={editTrack}
                            theme={theme}
                        />
                    )}
                </div>
            </div>
            }
            {tracks.length && <table>
                <tbody>
                    <tr>
                        <td>Total notes: </td>
                        <td />
                        <td>{totalNotes}</td>
                    </tr>
                    <tr>
                        <td>Accidentals: </td>
                        <td />
                        <td>{accidentals}</td>
                    </tr>
                    <tr>
                        <td>Out of range: </td>
                        <td />
                        <td>{outOfRange}</td>
                    </tr>
                </tbody>
            </table>
            }
        </div>
    }
}

interface TrackProps {
    data: CustomTrack
    index: number
    editTrack: (index: number, data: Partial<CustomTrack>) => void
    theme: ThemeStoreClass
}

function TrackInfo({ data, index, editTrack, theme }: TrackProps) {
    const [dataShown, setDataShown] = useState(false)
    return <div className='midi-track-column' style={{ backgroundColor: theme.layer('primary', 0.2).toString() }}>
        <div className='midi-track-wrapper'>
            <div className='midi-track-center'>
                <input type='checkbox' onChange={() => editTrack(index, { selected: !data.selected })} checked={data.selected} />
                {data.name} ({data.notes.length})
            </div>
            <div className='midi-track-center'>
                <div style={{ textAlign: 'center' }}>
                    {data.instrument.family}
                </div>
                <select
                    onChange={(event) => editTrack(index, { layer: Number(event.target.value) as LayerIndex })}
                    value={data.layer}
                    className='midi-select'
                >
                    <option value='0'>Layer 1</option>
                    <option value='1'>Layer 2</option>
                    <option value='2'>Layer 3</option>
                </select>

                <FaInfoCircle
                    size={22}
                    color={dataShown ? "rgb(207, 122, 130)" : "white"}
                    onClick={() => setDataShown(!dataShown)}
                    cursor='pointer'
                />
            </div>
        </div>
        <div
            className='midi-track-data'
            style={{
                display: dataShown ? "flex" : "none",
                backgroundColor: theme.layer('primary', 0.3).toString()
            }}
        >
            <div className='midi-track-data-row'>
                <div>Instrument:</div>
                <div>{data.instrument.name}</div>
            </div>
            <div className='midi-track-data-row'>
                <div>Number of notes:</div>
                <div>{data.notes.length}</div>
            </div>
            <div className='midi-track-data-row'>
                <div>Accidentals:</div>
                <div>{data.numberOfAccidentals}</div>
            </div>
            <div className='midi-track-data-row'>
                <div>Out of range:</div>
                <div>{data.numberOfOutOfRange}</div>
            </div>
        </div>
    </div>
}

export default MidiImport


interface NumberInputProps {
    onChange: (value: number) => void
    value: number
    delay: number
    step: number
    style: any
}
function NumberInput({ onChange, value, delay = 500, step = 1, style = {} }: NumberInputProps) {
    const [elementValue, setElementValue] = useState(value)
    const debounced = useDebounce<number>(elementValue, delay)
    useEffect(() => {
        onChange(debounced)
    }, [debounced, onChange]);
    useEffect(() => {
        setElementValue(value)
    }, [value])
    return <div style={{ display: 'flex', justifyContent: 'flex-end' }} >
        <button
            onClick={() => setElementValue(elementValue - step)}
            className='midi-btn-small'
            style={style}
        >-</button>
        <input
            type="text"
            value={elementValue}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setElementValue(Number(e.target.value))}
            className='midi-input'
            style={{ margin: '0 0.3rem', ...style }}
        />
        <button
            onClick={() => setElementValue(elementValue + step)}
            className='midi-btn-small'
            style={style}
        >+</button>
    </div>
}


type ParsedMidiNote = {
    note: number
    isAccidental: boolean
}
class MidiNote {
    time: number
    data: ParsedMidiNote
    layer: LayerIndex
    constructor(time: number, layer: LayerIndex, data?: ParsedMidiNote,) {
        this.time = time
        this.data = data || {
            note: -1,
            isAccidental: false
        }
        this.layer = layer
    }
    static fromMidi = (layer: LayerIndex, time: number, midiNote: number) => {
        const toReturn = new MidiNote(time, layer)
        let note = -1
        let isAccidental = false
        if (APP_NAME === 'Sky') {
            switch (midiNote) {
                case 60: note = 0; break;
                case 61: note = 0; isAccidental = true; break;
                case 62: note = 1; break;
                case 63: note = 1; isAccidental = true; break;
                case 64: note = 2; break;
                case 65: note = 3; break;
                case 66: note = 3; isAccidental = true; break;
                case 67: note = 4; break;
                case 68: note = 4; isAccidental = true; break;
                case 69: note = 5; break;
                case 70: note = 5; isAccidental = true; break;
                case 71: note = 6; break;
                case 72: note = 7; break;
                case 73: note = 7; isAccidental = true; break;
                case 74: note = 8; break;
                case 75: note = 8; isAccidental = true; break;
                case 76: note = 9; break;
                case 77: note = 10; break;
                case 78: note = 10; isAccidental = true; break;
                case 79: note = 11; break;
                case 80: note = 11; isAccidental = true; break;
                case 81: note = 12; break;
                case 82: note = 12; isAccidental = true; break;
                case 83: note = 13; break;
                case 84: note = 14; break;
                default: note = -1;
            }
        }
        if (APP_NAME === 'Genshin') {
            switch (midiNote) {
                case 48: note = 14; break;
                case 49: note = 14; isAccidental = true; break;
                case 50: note = 15; break;
                case 51: note = 15; isAccidental = true; break;
                case 52: note = 16; break;
                case 53: note = 17; break;
                case 54: note = 17; isAccidental = true; break;
                case 55: note = 18; break;
                case 56: note = 18; isAccidental = true; break;
                case 57: note = 19; break;
                case 58: note = 19; isAccidental = true; break;
                case 59: note = 20; break;
                case 60: note = 7; break;
                case 61: note = 7; isAccidental = true; break;
                case 62: note = 8; break;
                case 63: note = 8; isAccidental = true; break;
                case 64: note = 9; break;
                case 65: note = 10; break;
                case 66: note = 10; isAccidental = true; break;
                case 67: note = 11; break;
                case 68: note = 11; isAccidental = true; break;
                case 69: note = 12; break;
                case 70: note = 12; isAccidental = true; break;
                case 71: note = 13; break;
                case 72: note = 0; break;
                case 73: note = 0; isAccidental = true; break;
                case 74: note = 1; break;
                case 75: note = 1; isAccidental = true; break;
                case 76: note = 2; break;
                case 77: note = 3; break;
                case 78: note = 3; isAccidental = true; break;
                case 79: note = 4; break;
                case 80: note = 4; isAccidental = true; break;
                case 81: note = 5; break;
                case 82: note = 5; isAccidental = true; break;
                case 83: note = 6; break;
                default: note = -1;
            }
        }
        toReturn.data = {
            note,
            isAccidental
        }
        return toReturn
    }
}