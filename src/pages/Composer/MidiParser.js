import React, { Component, useEffect, useState } from 'react'
import { FilePicker } from 'components/FilePicker'
import { Midi } from '@tonejs/midi'
import { ColumnNote, Column, numberToLayer, ComposedSong, groupByIndex, mergeLayers } from 'lib/Utils'
import { APP_NAME,PITCHES } from 'appConfig'
import { FaInfoCircle } from 'react-icons/fa'
import useDebounce from 'lib/hooks/useDebounce'
import LoggerStore from 'stores/LoggerStore'
import { ThemeStore } from 'stores/ThemeStore'
import { observe } from 'mobx'
class MidiImport extends Component {
    constructor(props) {
        super(props)
        this.state = {
            fileName: '',
            midi: null,
            bpm: 220,
            offset: 0,
            pitch: 'C',
            accidentals: 0,
            outOfRange: 0,
            totalNotes: 0,
            includeAccidentals: true,
            theme: ThemeStore
        }
        this.dispose = () => {}
    }
    componentDidMount(){
        this.dispose = observe(ThemeStore.state.data,() => {
            this.setState({theme : {...ThemeStore}})
        })
    }
    componentWillUnmount(){
        this.dispose()
    }
    handleFile = (file) => {
        let midi
        try {
            midi = new Midi(file[0].data)
        } catch (e) {
            console.error(e)
            return LoggerStore.error('There was an error importing this file')
        }
        let bpm = midi.header.tempos[0]?.bpm
        let key = midi.header.keySignatures[0]?.key
        midi.tracks.forEach((track, i) => {
            track.selected = true
            track.layer = 0
            track.name = track.name || `Track n.${i + 1}`
            track.numberOfAccidentals = 0
            track.numberOfOutOfRange = 0
        })
        this.setState({
            midi: midi,
            fileName: file.name,
            bpm: Math.floor(bpm * 4) || 220,
            offset: 0,
            pitch: PITCHES.includes(key) ? key : 'C',
        }, () => { if (this.state.midi !== null) this.convertMidi() })
    }

    convertMidi = () => {
        const { midi, bpm, offset, includeAccidentals, pitch } = this.state
        let tracks = midi.tracks.filter(track => track.selected)
        let notes = []
        let numberOfAccidentals = 0
        let outOfRange = 0
        let totalNotes = 0
        tracks.forEach(track => {
            track.numberOfAccidentals = 0
            track.numberOfOutOfRange = 0
            track.notes.forEach(midiNote => {
                totalNotes++
                let convertedNote = convertMidiNote(midiNote.midi - offset)
                let note = {
                    time: Math.floor(midiNote.time * 1000),
                    note: convertedNote.note,
                    layer: track.layer
                }
                if (convertedNote.isAccidental) {
                    numberOfAccidentals++
                    track.numberOfAccidentals++
                }
                if (note.note !== null) {
                    if (includeAccidentals || !convertedNote.isAccidental) {
                        notes.push(note)
                    }
                } else {
                    outOfRange++
                    track.numberOfOutOfRange++
                }
            })
        })
        notes = notes.sort((a, b) => a.time - b.time)
        let bpmToMs = Math.floor(60000 / bpm)
        let groupedNotes = []
        while (notes.length > 0) {
            let row = [notes.shift()]
            let amount = 0
            for (let i = 0; i < notes.length; i++) {
                if (row[0].time > notes[i].time - bpmToMs / 9) amount++
            }
            groupedNotes.push([...row, ...notes.splice(0, amount)])
        }
        let columns = []
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
                return new ColumnNote(note.note, numberToLayer(note.layer))
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
        let song = new ComposedSong("Untitled")
        song.columns = columns
        song.bpm = bpm
        song.instruments = this.props.data.instruments
        song.pitch = pitch
        let lastColumn = this.props.data.selectedColumn
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

    editTrack = (command, data) => {
        let tracks = this.state.midi.tracks
        if (command === 'index') {

            tracks[data.index].selected = !tracks[data.index].selected
        }
        if (command === 'layer') {
            tracks[data.index].layer = data.layer
        }

        this.setState({
            midi: this.state.midi
        }, () => { if (this.state.midi !== null) this.convertMidi() })
    }
    changeOffset = (value) => {
        value = parseInt(value)
        if (!Number.isInteger(value)) value = 0
        if (this.state.offset === value) return
        this.setState({
            offset: value
        }, () => { if (this.state.midi !== null) this.convertMidi() })
    }
    changePitch = (value) => {
        this.props.functions.changePitch(value)
        this.setState({
            pitch: value
        })
    }
    toggleAccidentals = () => {
        this.setState({
            includeAccidentals: !this.state.includeAccidentals
        }, () => { if (this.state.midi !== null) this.convertMidi() })
    }
    changeBpm = (value) => {
        value = parseInt(value)
        if (!Number.isInteger(value)) value = 0
        if (this.state.bpm === value) return
        this.setState({
            bpm: value
        }, () => { if (this.state.midi !== null) this.convertMidi() })
    }
    render() {
        const { handleFile, editTrack, state, changeBpm, changeOffset, changePitch } = this
        const { fileName, midi, bpm, offset, pitch, accidentals, outOfRange, totalNotes, includeAccidentals, theme } = state
        const { functions } = this.props
        const { changeMidiVisibility } = functions
        const primaryColor = theme.get('primary')
        const midiInputsStyle = {
            backgroundColor: primaryColor.isDark() ? primaryColor.lighten(0.2) : primaryColor.darken(0.2),
            color: theme.getText('primary')
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
                                changeValue={changeBpm}
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
                                changeValue={changeOffset}
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
                                onChange={(event) => changePitch(event.target.value)}
                                style={{ backgroundColor: '#576377', width: '5rem', ...midiInputsStyle }}
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
            {midi !== null && <div className='midi-column separator-border' style={{ width: '100%' }}>
                <div className='midi-column' style={{ width: '100%' }}>
                    <div>Select midi tracks</div>
                    {midi?.tracks.map((track, i) =>
                        <Track
                            data={track}
                            key={i}
                            index={i}
                            editTrack={editTrack}
                        />
                    )}
                </div>
            </div>
            }
            {midi !== null && <table>
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

function Track(props) {
    const { data, index, editTrack } = props
    const [dataShown, setDataShown] = useState(false)
    return <div className='midi-track-column'>
        <div className='midi-track-wrapper'>
            <div className='midi-track-center'>
                <input type='checkbox' onChange={() => editTrack("index", { index: index })} checked={data.selected} />
                {data.name} ({data.notes.length})
            </div>
            <div className='midi-track-center'>
                <div style={{ textAlign: 'center' }}>
                    {data.instrument.family}
                </div>
                <select
                    onChange={(event) => editTrack('layer', { index: index, layer: Number(event.target.value) })}
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
        <div className='midi-track-data' style={{ display: dataShown ? "flex" : "none" }}>
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

function NumberInput({ changeValue, value, delay = 500, step = 1, style={} }) {
    const [elementValue, setElementValue] = useState(value)
    const debounced = useDebounce(elementValue, delay)
    useEffect(() => {
        changeValue(debounced)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debounced]);
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
            onChange={(e) => setElementValue(e.target.value)}
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

function convertMidiNote(midiNote) {
    let note = null
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
            default: note = null;
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
            default: note = null;
        }
    }
    return {
        note: note,
        isAccidental: isAccidental
    }
}