import React, { Component } from 'react'
import "./Keyboard.css"
import {getPitchChanger} from "../SongUtils"
import Instrument from "./Instrument"
import Note from "./Note"
class Keyboard extends Component {
    constructor(props) {
        super(props)
        this.state = {
            instrument: new Instrument(),
            audioContext: new (window.AudioContext || window.webkitAudioContext)(),
            playTimestamp: new Date().getTime(),
            songToPractice: [],
            sliderState: {
                position: 0,
                size: 0
            }
        }
        this.loadInstrument(props.data.instrument)
    }
    handleKeyboard = (event) => {
        let letter = event.key.toUpperCase()
        let note = this.state.instrument.layout.find(e => e.noteNames.keyboard === letter)
        if (note !== undefined) {
            this.handleClick(note)
        }
    }
    componentDidMount() {
        window.addEventListener('keydown', this.handleKeyboard)
        window.addEventListener("playSong", this.handlePlayEvent)
        window.addEventListener("practiceSong", this.handlePracticeEvent)
    }
    componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKeyboard);
        window.removeEventListener("playSong", this.handlePlayEvent)
        window.removeEventListener("practiceSong", this.handlePracticeEvent)
    }
 
    handlePlayEvent = (event) => {
        let data = event.detail
        this.setState({
            playTimestamp: data.timestamp
        }, () => this.playSong(data))
    }
    handlePracticeEvent = (event) => {
        let data = event.detail
        this.practiceSong(JSON.parse(JSON.stringify(data)))
    }
    loadInstrument = async (name) => {
        let newInstrument = new Instrument(name)
        let urls = newInstrument.layout.map(e => e.url)
        let buffers = await this.preload(urls)
        newInstrument.setBuffers(buffers)
        this.setState({
            instrument: newInstrument
        })

    }
    practiceSong = (song) => {
        let notes = song.notes
        let songLength = notes.length
        if(song.start === undefined) song.start = 0
        notes.splice(0,song.start)
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
        this.setState({
            songToPractice: chunks
        })
        this.setSlider({
            size: songLength,
            position: song.start
        })
    }
    changeSliderPosition = (position) => {
        let sliderState = this.state.sliderState
        sliderState.position += position
        this.setState({
            sliderState: sliderState
        },() => this.props.functions.changeSliderState(this.state.sliderState))
    }
    setSlider = (state) => {
        this.setState({
            sliderState: state
        },this.props.functions.changeSliderState(state))
    }
    playSong = async (song) => {
        let notes = song.notes
        let previous = 0
        this.setSlider({
            size:notes.length,
            position: 0
        })
        if(notes.length === 0) return
        for (let i = 0; i < notes.length; i++) {
            let delay = notes[i][1] - previous
            previous = notes[i][1]
            let note = notes[i][0]
            if (this.state.playTimestamp !== song.timestamp) break
            await delayMs(delay)
            this.changeSliderPosition(1)
            this.playSound(this.state.instrument.layout[note])
        }
        this.props.functions.stopSong()
    }
    handleClick = (note) => {
        let practiceSong = this.state.songToPractice
        if(practiceSong.length > 0){
            let indexClicked = practiceSong[0]?.notes.findIndex(e => e[0] === note.index)
            if(indexClicked !== -1){
                practiceSong[0].notes.splice(indexClicked,1)
                if(practiceSong[0].notes.length === 0) practiceSong.shift()
                if(practiceSong.length === 0) this.props.functions.stopSong()
                this.setState({
                    songToPractice: practiceSong
                }, () => this.changeSliderPosition(1))
            }
        }

        this.playSound(note)

    }
    playSound = (note) => {
        if (this.props.isRecording) this.props.functions.handleRecording(note)
        note.clicked = true
        setTimeout(() => {
            note.clicked = false
            this.setState({
                instrument: this.state.instrument
            })
        }, 200)
        const source = this.state.audioContext.createBufferSource()
        source.playbackRate.value = getPitchChanger(this.props.settings.pitch.value)
        source.buffer = note.buffer
        source.connect(this.state.audioContext.destination)
        source.start(0)
        this.setState({
            instrument: this.state.instrument
        })
    }
    preload = (urls) => {
        const requests = urls.map(url => fetch(url)
            .then(result => result.arrayBuffer())
            .then(buffer => {
                return new Promise((resolve, reject) => {
                    this.state.audioContext.decodeAudioData(buffer, resolve, reject)
                })
            })
        )
        return Promise.all(requests)
    }
    render() {
        let state = this.state
        let size = this.props.settings.keyboardSize.value / 100
        return <div className="keyboard" style={{transform: `scale(${size})`}}>
            {state.instrument.layout.map(note => {
                let toBeClicked = state.songToPractice[0]?.notes.find(e => e[0] === note.index) !== undefined
                let toBeClickedNext = state.songToPractice[1]?.notes.find(e => e[0] === note.index) !== undefined
                let fadeTime = state.songToPractice[0]?.delay !== undefined ? state.songToPractice[0]?.delay / 1000 : 0.1
                return <Note
                    key={note.index}
                    toBeClicked={toBeClicked}
                    fadeTime={fadeTime}
                    toBeClickedNext={toBeClickedNext}
                    data={note}
                    clickAction={this.handleClick}
                >

                </Note>
            })}
        </div>
    }
}
const delayMs = ms => new Promise(res => setTimeout(res, ms))
export default Keyboard
