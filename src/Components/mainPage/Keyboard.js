import React, { Component } from 'react'
import "./Keyboard.css"
import { getPitchChanger } from "../SongUtils"
import Instrument from "../Instrument"
import Note from "./Note"
import * as workerTimers from 'worker-timers';
import { keyNames, pitchArr , layoutImages, appName,layoutData} from "../../appConfig"
class Keyboard extends Component {
    constructor(props) {
        super(props)
        this.state = {
            instrument: new Instrument(),
            audioContext: new (window.AudioContext || window.webkitAudioContext)(),
            reverbAudioContext: new (window.AudioContext || window.webkitAudioContext)(),
            playTimestamp: new Date().getTime(),
            songToPractice: [],
            sliderState: {
                position: 0,
                size: 0
            }
        }
        console.log("Loaded:",props.data.instrument)
        this.loadInstrument(props.data.instrument)
        try {
            this.loadReverb()
        } catch(e) {
            console.log("Error with reverb0",e)
        }
    }
    handleKeyboard = (event) => {
        if(event.repeat) return
        if (document.activeElement.tagName === "INPUT") return
        let code = event.code?.replace("Key","")
        let index = this.state.instrument.getNoteFromCode(code)
        let note
        if (index !== null) {
            note = this.state.instrument.layout[index]
        }
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
        let state = this.state
        state.playTimestamp = new Date().getTime()
    }
    loadReverb() {
        let audioCtx = this.state.audioContext
        fetch("./assets/audio/reverb4.wav")
            .then(r => r.arrayBuffer())
            .then(b => {
                audioCtx.decodeAudioData(b, (impulse_response) => {
                    let convolver = audioCtx.createConvolver()
                    let gainNode = audioCtx.createGain()
                    gainNode.gain.value = 2.5
                    convolver.buffer = impulse_response
                    convolver.connect(gainNode)
                    gainNode.connect(audioCtx.destination)
                    this.setState({
                        reverbAudioContext: convolver
                    })
                })
            }).catch((e) => { 
                console.log("Error with reverb1",e)
            })
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
        await newInstrument.load(this.state.audioContext)

        this.setState({
            instrument: newInstrument
        })

    }
    practiceSong = (song) => {
        let notes = song.notes
        let songLength = notes.length
        if (song.start === undefined) song.start = 0
        notes.splice(0, song.start)
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
        }, () => this.props.functions.changeSliderState(this.state.sliderState))
    }
    setSlider = (state) => {
        this.setState({
            sliderState: state
        }, this.props.functions.changeSliderState(state))
    }
    playSong = async (song) => {
        let notes = song.notes
        let previous = 0
        this.setSlider({
            size: notes.length,
            position: 0
        })
        if (notes.length === 0) return
        for (let i = 0; i < notes.length; i++) {
            let delay = notes[i][1] - previous
            previous = notes[i][1]
            let note = notes[i][0]
            if (this.state.playTimestamp !== song.timestamp) break
            if (delay > 10) await delayMs(delay)
            this.changeSliderPosition(1)
            this.playSound(this.state.instrument.layout[note])
        }
        this.props.functions.stopSong()
    }
    handleClick = (note) => {
        let practiceSong = this.state.songToPractice
        if (practiceSong.length > 0) {
            let indexClicked = practiceSong[0]?.notes.findIndex(e => e[0] === note.index)
            if (indexClicked !== -1) {
                practiceSong[0].notes.splice(indexClicked, 1)
                if (practiceSong[0].notes.length === 0) practiceSong.shift()
                if (practiceSong.length === 0) this.props.functions.stopSong()
                this.setState({
                    songToPractice: practiceSong
                }, () => this.changeSliderPosition(1))
            }
        }

        this.playSound(note)

    }
    playSound = (note) => {
        const {state, props} = this
        if(note === undefined) return
        if (props.isRecording) props.functions.handleRecording(note)
        note.clicked = true
        setTimeout(() => {
            note.clicked = false
            this.setState({
                instrument: state.instrument
            })
        }, 200)
        const source = state.audioContext.createBufferSource()
        source.playbackRate.value = getPitchChanger(props.data.pitch)
        source.buffer = note.buffer
        if (props.data.caveMode) {
            source.connect(state.reverbAudioContext)
        } else {
            source.connect(state.audioContext.destination)
        }
        source.start(0)
        this.setState({
            instrument: state.instrument
        })
    }
    render() {
        const {state, props} = this
        const {data} = props
        let size = data.keyboardSize / 100
        if (size < 0.5) size = 0.5
        if (size > 1.5) size = 1.5
        let keyboardClass = "keyboard"
        if (state.instrument.layout.length === 15) keyboardClass += " keyboard-5"
        if (state.instrument.layout.length === 8) keyboardClass += " keyboard-4"
        return <div 
                    className={keyboardClass} 
                    style={{ 
                        transform: `scale(${size})`,
                        marginBottom:size * 30
                    }}
                >
             {state.instrument.layout.length === 0 ? <div className="loading">Loading...</div> : null}
            {state.instrument.layout.map(note => {
                let toBeClicked = state.songToPractice[0]?.notes.find(e => e[0] === note.index) !== undefined
                let toBeClickedNext = state.songToPractice[1]?.notes.find(e => e[0] === note.index) !== undefined
                let fadeTime = state.songToPractice[0]?.delay !== undefined ? state.songToPractice[0]?.delay / 1000 : 0.1
                let noteText = ""
                let noteImage = ""
                try{
                    noteImage = layoutImages[state.instrument.layout.length][note.index]
                    if(data.noteNameType === "Note name") noteText = keyNames[appName][pitchArr.indexOf(data.pitch)][note.index]                           
                    if(data.noteNameType === "Keyboard layout") noteText = layoutData[state.instrument.layout.length].keyboardLayout[note.index]
                    if(data.noteNameType === "Do Re Mi") noteText = layoutData[state.instrument.layout.length].mobileLayout[note.index]
                }catch(e){}

                return <Note
                    key={note.index}
                    toBeClicked={toBeClicked}
                    fadeTime={fadeTime}
                    toBeClickedNext={toBeClickedNext}
                    data={note}
                    noteText={noteText}
                    instrument={state.instrument.instrumentName}
                    noteImage={`./assets/icons/keys/${noteImage}.svg`}
                    clickAction={this.handleClick}
                >

                </Note>
            })}
        </div>
    }
}

function delayMs(ms) {
    return new Promise(resolve => {
        workerTimers.setTimeout(resolve, ms)
    })
}
export default Keyboard

