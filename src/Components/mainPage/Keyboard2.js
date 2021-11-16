import React, { Component } from 'react'
import "./Keyboard.css"
import { delayMs, ComposerToRecording } from "../SongUtils"
import Note from "./Note"
import { keyNames, pitchArr, layoutImages, appName, layoutData } from "../../appConfig"
import { songStore } from './SongStore'
import { observe } from 'mobx'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSyncAlt, faStop, faLeaf } from '@fortawesome/free-solid-svg-icons'
class Keyboard extends Component {
    constructor(props) {
        super(props)
        let propKeyboard = this.props.data.keyboard
        propKeyboard.layout.forEach(note => { note.status = '' })
        this.state = {
            playTimestamp: new Date().getTime(),
            songToPractice: [],
            keyboard: propKeyboard.layout,
            sliderState: {
                position: 0,
                size: 0
            },
            thereIsSong: false
        }
        this.songTimestamp = 0
        this.disposeStore = () => { }
    }

    componentDidMount() {
        window.addEventListener('keydown', this.handleKeyboard)
        this.disposeStore = observe(songStore, (data) => {
            let value = data.object.data
            let type = value.eventType
            let lostReference = JSON.parse(JSON.stringify(value.song))
            if (lostReference.data?.isComposedVersion) {
                lostReference = ComposerToRecording(lostReference)
            }
            lostReference.timestamp = new Date().getTime()
            let hasSong = false
            if (type === 'play') {
                this.playSong(lostReference, value.start)
                hasSong = true
            }
            if (type === 'practice') {
                this.practiceSong(lostReference, value.start)
                hasSong = true
            }
            if (type === 'stop') this.stopSong()
            this.setState({ thereIsSong: hasSong })
        })
    }
    componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKeyboard)
        this.disposeStore()
        this.songTimestamp = 0
    }

    playSong = async (song, start = 0) => {
        this.songTimestamp = song.timestamp
        const { keyboard } = this.state
        let notes = song.notes
        if (notes.length === 0) return
        let previous = notes[0][1]
        let pastError = 0
        let previousTime = new Date().getTime()
        for (let i = start; i < notes.length; i++) {
            let delay = notes[i][1] - previous
            previous = notes[i][1]
            let note = notes[i][0]
            if (this.songTimestamp !== song.timestamp) break
            previousTime = new Date().getTime()
            if (delay > 16) await delayMs(delay - pastError)
            keyboard[note].status = 'clicked'
            this.handleClick(keyboard[note])
            this.setState({
                keyboard,
                sliderState: {
                    position: i,
                    size: notes.length
                }
            })
            pastError = new Date().getTime() - previousTime - delay
        }
        songStore.data = returnStopSong()
    }
    practiceSong = (song, start = 0) => {

        const { keyboard } = this.state
        let notes = song.notes
        let songLength = notes.length
        notes.splice(0, start)
        let chunks = []
        for (let i = 0; notes.length > 0; i++) {
            let chunk = {
                notes: [notes.shift()],
                delay: 0
            }
            let startTime = chunk.notes.length > 0 ? chunk.notes[0][1] : 0
            for (let j = 0; j < notes.length && j < 20; j++) {
                let difference = notes[j][1] - chunk.notes[0][1] - song.threshold
                if (difference < 0) {
                    chunk.notes.push(notes.shift())
                    j--
                }
            }
            chunk.delay = notes.length > 0 ? notes[0][1] - startTime : 0
            chunks.push(chunk)
        }
        if (chunks.length === 0) return
        let firstChunk = chunks[0]
        let secondChunk = chunks[1]
        firstChunk.notes.forEach(note => { keyboard[note[0]].status = 'toClick' })
        secondChunk?.notes.forEach(note => {
            let keyboardNote = keyboard[note[0]]
            if (keyboardNote.status === 'toClick') return keyboardNote.status = 'toClickAndNext'
            keyboardNote.status = 'toClickNext'
        })
        this.setState({
            songToPractice: chunks,
            keyboard,
            sliderState: {
                position: start,
                size: songLength
            }
        })
    }
    restartSong = () => {
        let lostReference = JSON.parse(JSON.stringify(songStore.data))
        this.stopSong()
        setTimeout(() => {
            let start = songStore.data.start
            if(songStore.data.eventType === 'practice')
                start = this.state.sliderState.position
            songStore.data = {
                ...lostReference,
                start
            }
        }, 400)
    }
    stopSong = () => {
        this.songTimestamp = 0
        const { keyboard } = this.state
        keyboard.forEach(note => { note.status = '' })
        this.setState({ keyboard, songToPractice: [], thereIsSong: false })
    }
    handleSliderEvent = (event) => {
        this.changeSliderState(Number(event.target.value))
    }
    changeSliderState = async (position, size = this.state.sliderState.size) => {
        this.setState({
            sliderState: {
                position,
                size
            }
        })
    }
    handleKeyboard = (event) => {
        const { keyboard } = this.state
        if (event.repeat) return
        if (document.activeElement.tagName === "INPUT") return
        let code = event.code?.replace("Key", "")
        let index = this.props.data.keyboard.getNoteFromCode(code)
        let note = keyboard[index]
        if (note) this.handleClick(note)
    }

    handleClick = (note, onlySound) => {
        const { keyboard, songToPractice, sliderState } = this.state
        keyboard[note.index].status = 'clicked'
        if (songToPractice.length > 0) {
            let indexClicked = songToPractice[0]?.notes.findIndex(e => e[0] === note.index)
            if (indexClicked !== -1) {
                songToPractice[0].notes.splice(indexClicked, 1)
                if (songToPractice[0].notes.length === 0) songToPractice.shift()
                if (songToPractice.length === 0) {
                    this.stopSong()
                    songStore.data = returnStopSong()
                } else {
                    let nextChunk = songToPractice[0]
                    let nextNextChunk = songToPractice[1]
                    nextChunk.notes.forEach(note => keyboard[note[0]].status = 'toClick')
                    nextNextChunk?.notes.forEach(note => {
                        let keyboardNote = keyboard[note[0]]
                        if (keyboardNote.status === 'toClick') return keyboardNote.status = 'toClickAndNext'
                        keyboardNote.status = 'toClickNext'
                    })
                }

                this.setState({
                    songToPractice: songToPractice,
                    sliderState: {
                        size: sliderState.size,
                        position: sliderState.position + 1
                    }
                })
            }
        }
        this.setState({ keyboard })
        setTimeout(() => {
            if (note.status !== 'clicked') return
            keyboard[note.index].status = ''
            this.setState({ keyboard })
        }, 200)
        this.props.functions.playSound(note)
    }
    render() {
        const { state, props } = this
        const { data } = props
        const { keyboard } = state
        let size = data.keyboardSize / 100
        if (size < 0.5) size = 0.5
        if (size > 1.5) size = 1.5
        let keyboardClass = "keyboard"
        if (keyboard.length === 15) keyboardClass += " keyboard-5"
        if (keyboard.length === 8) keyboardClass += " keyboard-4"
        return <>
            {state.thereIsSong &&
                <div className="upper-right">
                    <div className="slider-wrapper">
                        <button className="song-button" onClick={() => {
                            this.stopSong()
                            songStore.data = returnStopSong()
                        }
                        }>
                            <FontAwesomeIcon icon={faStop} />
                        </button>
                        <input
                            type="range"
                            className="slider"
                            min={0}
                            onChange={this.handleSliderEvent}
                            max={state.sliderState.size}
                            value={state.sliderState.position}
                        ></input>
                        <button className="song-button" onClick={() => {
                            this.restartSong()
                        }}>
                            <FontAwesomeIcon icon={faSyncAlt} />
                        </button>
                    </div>
                </div>
            }
            <div
                className={keyboardClass}
                style={{
                    transform: `scale(${size})`,
                    marginBottom: size * 30
                }}
            >
                {keyboard.length === 0 ? <div className="loading">Loading...</div> : null}
                {keyboard.map(note => {
                    let noteImage = layoutImages[keyboard.length][note.index]
                    return <Note
                        key={note.index}
                        fadeTime={0}
                        data={note}
                        status={note.status}
                        handleClick={this.handleClick}
                        instrument={this.props.data.keyboard.instrumentName}
                        noteText={getNoteText(data.noteNameType, note.index, data.pitch, keyboard.length)}
                        noteImage={`./assets/icons/keys/${noteImage}.svg`}
                    />

                })}
            </div>
        </>


    }
}
function returnStopSong() {
    return {
        song: {},
        eventType: 'stop',
        start: 0
    }
}

function getNoteText(noteNameType, index, pitch, layoutLength) {
    try {
        if (noteNameType === "Note name") return keyNames[appName][pitchArr.indexOf(pitch)][index]
        if (noteNameType === "Keyboard layout") return layoutData[layoutLength].keyboardLayout[index]
        if (noteNameType === "Do Re Mi") return layoutData[layoutLength].mobileLayout[index]
    } catch (e) { console.log(e) }
    return ''
}
export default Keyboard

