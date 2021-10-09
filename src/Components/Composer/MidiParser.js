import React, { Component } from 'react'
import { FilePicker } from "react-file-picker"
import { Midi } from '@tonejs/midi'
import { LoggerEvent, pitchArr,ColumnNote, Column,numberToLayer,ComposedSong,groupByIndex,mergeLayers } from '../SongUtils'
import { appName } from '../../appConfig'
class MidiImport extends Component {
    constructor(props) {
        super(props)
        this.state = {
            fileName: '',
            midi: null,
            bpm: 220,
            offset: 16,
            pitch: 'C',
            accidentals: 0,
            outOfRange: 0,
            totalNotes: 0,
        }
        this.handleFile = (file) => {
            const reader = new FileReader();
            reader.addEventListener('load', (event) => {
                let midi
                try {
                    midi = new Midi(event.target.result)
                } catch (e) {
                    console.error(e)
                }
                if (!midi) return new LoggerEvent('Error', 'There was an error importing this file', 2000).trigger()
                let bpm = midi.header.tempos[0]?.bpm
                let key = midi.header.keySignatures[0]?.key
                midi.tracks.forEach((track, i) => {
                    track.selected = true
                    track.layer = 0
                    track.name = track.name || `Track n.${i + 1}`
                })
                this.setState({
                    midi: midi,
                    fileName: file.name,
                    bpm: Math.floor(bpm * 4) || 220,
                    offset: 16,
                    pitch: pitchArr.includes(key) ? key : 'C',
                })
            })
            reader.readAsArrayBuffer(file)
        }

        this.convertMidi = () => {
            const { midi, bpm, offset } = this.state
            let tracks = midi.tracks.filter(track => track.selected)
            let notes = []
            let numberOfAccidentals = 0
            let outOfRange = 0
            let totalNotes = 0
            tracks.forEach(track => {
                track.notes.forEach(midiNote => {
                    let convertedNote = convertMidiNote(midiNote.midi - offset)
                    let note = {
                        time: Math.floor(midiNote.time * 1000),
                        note: convertedNote.note,
                        layer: track.layer
                    }
                    numberOfAccidentals += convertedNote.isAccidental ? 1 : 0
                    totalNotes++
                    if(note.note !== null){
                        notes.push(note)
                    }else{
                        outOfRange++
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
                if(!note) return
                let elapsedTime = note.time - previousTime
                previousTime = note.time
                let emptyColumns = Math.floor((elapsedTime - bpmToMs) / bpmToMs)
                if(emptyColumns > -1) new Array(emptyColumns ).fill(0).forEach(() => columns.push(new Column())) // adds empty columns
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
            if(song.columns.length === 0){
                return new LoggerEvent("Error","There are no notes",2000).trigger()
            }
            this.props.functions.loadSong(song)
            this.setState({
                accidentals: numberOfAccidentals,
                totalNotes: totalNotes,
                outOfRange: outOfRange
            })
        }

        this.editTrack = (command, data) => {
            let tracks = this.state.midi.tracks
            if (command === 'index') {

                tracks[data.index].selected = !tracks[data.index].selected
            }
            if (command === 'layer') {
                tracks[data.index].layer = data.layer
            }
            this.setState({
                midi: this.state.midi
            })
        }
        this.changeOffset = (value) => {
            value = parseInt(value)
            if(!Number.isInteger(value)) value = 0
            this.setState({
                offset: value
            })
        }
        this.changePitch = (value) => {
            this.setState({
                pitch: value
            })
        }
        this.changeBpm = (value) => {
            value = parseInt(value)
            if(!Number.isInteger(value)) value = 0
            this.setState({
                bpm: value
            })
        }
    }
    render() {
        const { handleFile, editTrack, state, changeBpm, changeOffset, convertMidi, changePitch } = this
        const { fileName, midi, bpm, offset, pitch, accidentals, outOfRange, totalNotes } = state
        const { functions } = this.props
        const { changeMidiVisibility } = functions
        return <div className='floating-midi'>
            <div 
                className='midi-row separator-border' 
                style={{ width: '100%'}}
            >
                <FilePicker onChange={handleFile}>
                    <button className="midi-btn">
                        Click to load midi file
                    </button>
                </FilePicker>
                <div style={{ marginLeft: '0.5rem', maxWidth: '7rem', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                    {fileName}
                </div>
                <button
                    className='midi-btn'
                    style={{ marginLeft: 'auto' }}
                    onClick={() => changeMidiVisibility(false)}
                >
                    Close
                </button>
                <button
                    className='midi-btn-green'
                    style={{ marginLeft: '0.5rem' }}
                    disabled={midi === null}
                    onClick={convertMidi}
                >
                    Load
                </button>
            </div>
            <table className='separator-border' style={{width: "100%"}}>
                <tr>
                    <td>
                        <div style={{ marginRight: '0.5rem' }}>Bpm:</div>
                    </td>
                    <td style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            onClick={() => changeBpm(bpm - 5)}
                            className='midi-btn-small'
                        >-</button>
                        <input 
                            type='text' 
                            value={bpm} 
                            onChange={(e) => changeBpm(e.target.value)} 
                            className='midi-input' 
                            style={{ margin: '0 0.3rem' }}
                        />
                        <button
                                onClick={() => changeBpm(bpm + 5)}
                                className='midi-btn-small'
                        >+</button>
                    </td>
                </tr>
                <tr>
                    <td>
                        <div style={{ marginRight: '0.5rem' }}>Scale notes by: </div>
                    </td>
                    <td>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }} >
                            <button
                                onClick={() => changeOffset(offset - 1)}
                                className='midi-btn-small'
                            >-</button>
                            <input
                                type="text"
                                value={offset}
                                onChange={(e) => changeOffset(e.target.value)}
                                className='midi-input'
                                style={{ margin: '0 0.3rem' }}
                            />
                            <button
                                onClick={() => changeOffset(offset + 1)}
                                className='midi-btn-small'
                            >+</button>
                        </div>
                    </td>
                </tr>
                <tr>
                    <td>
                        <div style={{ marginRight: '0.5rem' }}>Pitch:</div>
                    </td>
                    <td style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <select
                            className='midi-select'
                            value={pitch}
                            onChange={(event) => changePitch(event.target.value)}
                            style={{ backgroundColor: '#576377', width: '5rem' }}
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
            </table>
            {midi !== null && <div className='midi-column separator-border' style={{width:'100%'}}>
                    <div className='midi-column' style={{ width:'100%'}}>
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
                <tr>
                    <td>Total notes: </td>
                    <td/>
                    <td>{totalNotes}</td>
                </tr>
                <tr>
                    <td>Accidentals: </td>
                    <td/>
                    <td>{accidentals}</td>
                </tr>
                <tr>
                    <td>Out of range: </td>
                    <td/>
                    <td>{outOfRange}</td>
                </tr>
            </table>
        }
        </div>
    }
}

function Track(props) {
    const { data, index, editTrack } = props
    return <div className='midi-track-wrapper'>
        <div>
            {data.name}
        </div>
        <input type='checkbox' onChange={() => editTrack("index", { index: index })} checked={data.selected} />
        <select
            onChange={(event) => editTrack('layer', { index: index, layer: Number(event.target.value) })}
            value={data.layer}
            className='midi-select'
        >
            <option value='0'>Layer 1</option>
            <option value='1'>Layer 2</option>
            <option value='2'>Layer 3</option>
        </select>
        <div style={{ textAlign: 'center' }}>
            {data.instrument.family}
        </div>
    </div>
}

export default MidiImport


function convertMidiNote(midiNote) {
    let note = null
    let isAccidental = false
    if(appName === 'Sky'){
        switch (midiNote) {
            case 36: note = 0; break;
            case 37: note = 0; isAccidental = true; break;
            case 38: note = 1; break;
            case 39: note = 1; isAccidental = true; break;
            case 40: note = 2; break;
            case 41: note = 3; break;
            case 42: note = 3; isAccidental = true; break;
            case 43: note = 4; break;
            case 44: note = 4; isAccidental = true; break;
            case 45: note = 5; break;
            case 46: note = 5; isAccidental = true; break;
            case 47: note = 6; break;
            case 48: note = 7; break;
            case 49: note = 7; isAccidental = true; break;
            case 50: note = 8; break;
            case 51: note = 8; isAccidental = true; break;
            case 52: note = 9; break;
            case 53: note = 10; break;
            case 54: note = 10; isAccidental = true; break;
            case 55: note = 11; break;
            case 56: note = 11; isAccidental = true; break;
            case 57: note = 12; break;
            case 58: note = 12; isAccidental = true; break;
            case 59: note = 13; break;
            case 60: note = 14; break;
            default: note = null
        }
    }
    if(appName === 'genshin'){
        //TODO add genshin notes
    }
    return {
        note: note,
        isAccidental: isAccidental
    }
}