import { ChangeEvent, Component, useEffect, useState } from 'react'
import { FileElement, FilePicker } from 'components/Inputs/FilePicker'
import { Midi, Track } from '@tonejs/midi'
import { groupNotesByIndex, mergeLayers } from 'lib/Utilities'
import { ColumnNote, Column, MidiNote, InstrumentData } from 'lib/Songs/SongClasses'
import { ComposedSong } from 'lib/Songs/ComposedSong'
import { PITCHES, Pitch } from 'appConfig'
import { FaArrowDown, FaArrowUp, FaEllipsisH } from 'react-icons/fa'
import useDebounce from 'lib/Hooks/useDebounce'
import { logger } from 'stores/LoggerStore'
import { ThemeProvider, ThemeStore } from 'stores/ThemeStore'
import { observe } from 'mobx'
import Switch from 'components/Inputs/Switch'
import { NoteLayer } from 'lib/Layer'
import { HelpTooltip } from 'components/Utility/HelpTooltip'
import { Select } from 'components/Inputs/Select'
import { PitchSelect } from 'components/Inputs/PitchSelect'
interface MidiImportProps {
    data: {
        instruments: InstrumentData[]
        selectedColumn: number
    }
    functions: {
        changeMidiVisibility: (override: boolean) => void
        changePitch: (pitch: Pitch) => void
        loadSong: (song: ComposedSong) => void
    }
}
type CustomTrack = Track & {
    selected: boolean
    layer: number
    name: string
    numberOfAccidentals: number
    localOffset: number | null
    outOfRangeBounds: {
        lower: number
        upper: number
    }
}

interface MidiImportState {
    fileName: string
    tracks: CustomTrack[]
    bpm: number
    offset: number
    pitch: Pitch
    accidentals: number
    outOfRange: number
    totalNotes: number
    includeAccidentals: boolean
    ignoreEmptytracks: boolean
    theme: ThemeStore
}

class MidiImport extends Component<MidiImportProps, MidiImportState> {
    dispose: () => void
    constructor(props: MidiImportProps) {
        super(props)
        this.state = {
            fileName: '',
            bpm: 220,
            tracks: [],
            offset: 0,
            pitch: 'C',
            ignoreEmptytracks: false,
            accidentals: 0,
            outOfRange: 0,
            totalNotes: 0,
            includeAccidentals: true,
            theme: ThemeProvider
        }
        this.dispose = () => { }
    }
    componentDidMount() {
        this.dispose = observe(ThemeProvider.state.data, () => {
            this.setState({ theme: { ...ThemeProvider } })
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
                    outOfRangeBounds: {
                        lower: 0,
                        upper: 0
                    },
                    localOffset: null
                }
            }) as CustomTrack[]
            this.setState({
                tracks: tracks,
                fileName: file.file.name,
                bpm: Math.floor(bpm * 4) || 220,
                offset: 0,
                pitch: (PITCHES.includes(key as never) ? key : 'C') as Pitch,
            }, () => { if (this.state.tracks.length) this.convertMidi() })
        } catch (e) {
            console.error(e)
            logger.error('There was an error importing this file, is it a .mid file?')
        }
    }

    convertMidi = () => {
        const { tracks, bpm, offset, includeAccidentals, pitch } = this.state
        const selectedTracks = tracks.filter(track => track.selected)
        const notes: MidiNote[] = []
        let accidentals = 0
        let outOfRange = 0
        let totalNotes = 0
        selectedTracks.forEach(track => {
            track.numberOfAccidentals = 0
            track.outOfRangeBounds.upper = 0
            track.outOfRangeBounds.lower = 0
            track.notes.forEach(midiNote => {
                totalNotes++
                const note = MidiNote.fromMidi(
                    track.layer,
                    Math.floor(midiNote.time * 1000),
                    midiNote.midi - (track.localOffset ?? offset),
                )
                if (note.data.isAccidental) {
                    accidentals++
                    track.numberOfAccidentals++
                }
                if (note.data.note !== -1) {
                    if (includeAccidentals || !note.data.isAccidental) {
                        notes.push(note)
                    }
                } else {
                    outOfRange++
                    if (note.data.outOfRangeBound === - 1) track.outOfRangeBounds.lower++
                    if (note.data.outOfRangeBound === 1) track.outOfRangeBounds.upper++
                }
            })
        })
        const sorted = notes.sort((a, b) => a.time - b.time)
        const bpmToMs = Math.floor(60000 / bpm)
        const groupedNotes: MidiNote[][] = []
        while (sorted.length > 0) {
            const row = [sorted.shift() as MidiNote]
            let amount = 0
            for (let i = 0; i < sorted.length; i++) {
                if (row[0].time > sorted[i].time - bpmToMs / 9) amount++
            }
            groupedNotes.push([...row, ...sorted.splice(0, amount)])
        }
        const columns: Column[] = []
        let previousTime = 0
        groupedNotes.forEach(notes => {
            const note = notes[0]
            if (!note) return
            const elapsedTime = note.time - previousTime
            const emptyColumns = Math.floor((elapsedTime - bpmToMs) / bpmToMs)
            const noteColumn = new Column()
            previousTime = note.time
            if (emptyColumns > -1) new Array(emptyColumns).fill(0).forEach(() => columns.push(new Column())) // adds empty columns
            noteColumn.notes = notes.map(note => {
                const layer = new NoteLayer()
                layer.set(note.layer, true)
                return new ColumnNote(note.data.note, layer)
            })
            columns.push(noteColumn)
        })
        columns.forEach(column => { //merges notes of different layer
            const groupedNotes = groupNotesByIndex(column)
            column.notes = groupedNotes.map(group => {
                group[0].layer = mergeLayers(group)
                return group[0]
            })
        })
        const song = new ComposedSong("Untitled")
        song.columns = columns
        song.bpm = bpm
        song.instruments = []
        song.instruments = this.props.data.instruments.map(ins => ins.clone())
        song.pitch = pitch
        const lastColumn = this.props.data.selectedColumn
        song.selected = lastColumn < song.columns.length ? lastColumn : 0
        if (song.columns.length === 0) {
            return logger.warn("There are no notes")
        }
        this.props.functions.loadSong(song)
        this.setState({ accidentals, totalNotes, outOfRange })
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
    changePitch = (value: Pitch) => {
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
        const { tracks, fileName, bpm, offset, pitch, accidentals, outOfRange, totalNotes, includeAccidentals, theme, ignoreEmptytracks } = state
        const { functions, data } = this.props
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
                        Open midi file
                    </button>
                </FilePicker>
                <div 
                    style={{ margin: '0 0.5rem', maxWidth: '20rem' }}
                    className='text-ellipsis'
                >
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
            <div className='midi-table-row'>
                <div style={{ marginRight: '0.5rem' }}>Bpm:</div>
                <NumberInput
                    value={bpm}
                    onChange={changeBpm}
                    delay={600}
                    style={midiInputsStyle}
                    step={5}
                />
            </div>
            <div className='midi-table-row'>
                <div className='row flex-centered'>
                    <span style={{ marginRight: '0.5rem' }}>Global note offset: </span>
                    <HelpTooltip buttonStyle={{width: '1.2rem', height: '1.2rem'}}>
                        The index of each note will be pushed up/down by this amount, you can use it to make
                        the song fit into the app range. You can also change the offset of each layer.
                    </HelpTooltip>
                </div>
                
                <NumberInput
                    value={offset}
                    onChange={changeOffset}
                    delay={600}
                    style={midiInputsStyle}
                    step={1}
                />
            </div>
            <div className='midi-table-row'>
                <div style={{ marginRight: '0.5rem' }}>Pitch:</div>
                <PitchSelect 
                    style={{ width: '5rem', ...midiInputsStyle }}
                    selected={pitch}
                    onChange={changePitch}
                />
            </div>
            <div className='midi-table-row'>
                <div className='row'>
                    <div style={{ marginRight: '0.5rem' }}>Include accidentals:</div>
                    <Switch
                        checked={includeAccidentals}
                        onChange={this.toggleAccidentals}
                        styleOuter={midiInputsStyle}
                    />
                </div>
                <div className='row'>
                    <div style={{ marginRight: '0.5rem' }}>Ignore empty tracks:</div>
                    <Switch
                        checked={ignoreEmptytracks}
                        onChange={(b) => this.setState({ ignoreEmptytracks: b })}
                        styleOuter={midiInputsStyle}
                    />
                </div>
            </div>
            {tracks.length > 0 && <div className='midi-column separator-border' style={{ width: '100%' }}>
                <div className='midi-column' style={{ width: '100%' }}>
                    <div>Select midi tracks</div>
                    {tracks.map((track, i) =>
                        ignoreEmptytracks && track.notes.length === 0
                            ? null
                            : <TrackInfo
                                data={track}
                                instruments={data.instruments}
                                key={i}
                                index={i}
                                onChange={editTrack}
                                theme={theme}
                            />
                    )}
                </div>
            </div>
            }
            {tracks.length > 0 && <table>
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
    instruments: InstrumentData[]
    onChange: (index: number, data: Partial<CustomTrack>) => void
    theme: ThemeStore
}

function TrackInfo({ data, index, onChange, theme, instruments }: TrackProps) {
    const [dataShown, setDataShown] = useState(false)
    const background = {backgroundColor: theme.layer('menu_background', 0.15).toString()}
    const [offset, setOffset] = useState(`${data.localOffset ?? ""}`)
    const debounced = useDebounce<string>(offset, 600)
    useEffect(() => {
        const parsedOffset = parseInt(debounced)
        const localOffset = Number.isFinite(parsedOffset) ? parsedOffset : null
        setOffset(`${localOffset ?? ""}`)
        onChange(index, { localOffset })
    }, [debounced, onChange, index]);
    useEffect(() => {
        setOffset(`${data.localOffset ?? ""}`)
    }, [data.localOffset])
    return <div className='midi-track-column' style={background}>
        <div className='midi-track-wrapper'>
            <div className='midi-track-center'>
                <input type='checkbox' onChange={() => onChange(index, { selected: !data.selected })} checked={data.selected} />
                {`${data.name} `}
                (
                    {data.notes.length},
                    {` ${data.instrument.family}`}
                )

            </div>
            <div className='midi-track-center'>
                <Select
                    onChange={(event) => onChange(index, { layer: Number(event.target.value) })}
                    value={data.layer}
                    className='midi-select'
                    style={{
                        marginLeft: '0.2rem',
                    }}
                >
                    {instruments.map((ins, i) =>
                        <option value={i} key={i}>
                            {ins.alias || ins.name} - {`Layer ${ i + 1}`}
                        </option>
                    )}
                </Select>

                <FaEllipsisH
                    size={22}
                    color={"var(--primary)"}
                    onClick={() => setDataShown(!dataShown)}
                    cursor='pointer'
                />
            </div>
        </div>
        <div
            className='midi-track-data'
            style={{
                display: dataShown ? "flex" : "none"
            }}
        >   
            <div className='midi-track-data-row'>
                <div>
                    Track offset:
                </div>
                <input 
                    type='text'
                    value={offset}
                    placeholder='No offset'
                    className='midi-input'
                    style={{width: '6rem'}}
                    onChange={(e) => setOffset(e.target.value)}
                />
            </div>
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
                <div>Out of range: ({data.outOfRangeBounds.upper + data.outOfRangeBounds.lower})</div>
                <div className='row' style={{width: 'fit-content'}}>
                    <div className='row' style={{marginRight: '0.4rem'}}>
                        <FaArrowUp style={{marginRight: '0.2rem'}}/>
                        {data.outOfRangeBounds.upper}
                    </div>
                    <div className='row'>
                        <FaArrowDown style={{marginRight: '0.2rem'}}/> 
                        {data.outOfRangeBounds.lower}
                    </div>
                </div>

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
    style: React.CSSProperties
}
function NumberInput({ onChange, value, delay = 500, step = 1, style }: NumberInputProps) {
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


