import React, { Component } from 'react'
import "./Keyboard.css"
import Instrument from "./Instrument"
import Note from "./Note"
class Keyboard extends Component {
    constructor(props) {
        super(props)
        this.state = {
            instrument: new Instrument(),
            audioContext: new (window.AudioContext || window.webkitAudioContext)(),
            playTimestamp: new Date().getTime(),
        }
        this.loadInstrument(props.data.instrument)
    }
    handleKeyboard = (event) => {
        let letter = event.key.toUpperCase()
        let note = this.state.instrument.layout.find(e => e.noteNames.keyboard === letter)
        if (note !== undefined) {
            this.playSound(note)
        }
    }
    componentDidMount() {
        window.addEventListener('keydown', this.handleKeyboard);
        window.addEventListener("playSong",this.handlePlayEvent)
      }
    componentWillUnmount() {
        window.removeEventListener('click', this.handleKeyboard);
        window.removeEventListener("playSong",this.handlePlayEvent)
    }
    handlePlayEvent = (event) => {
        let data = event.detail
        this.setState({
            playTimestamp: data.timestamp
        },() => this.playSong(data))
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
    playSong = async (song) => {
        let notes = song.notes
        let previous = 0

        for(let i = 0; i< notes.length;i++){
            let delay = notes[i][1] - previous 
            previous = notes[i][1]
            let note = notes[i][0]
            if(this.state.playTimestamp !== song.timestamp) break
            await delayMs(delay)
            this.playSound(this.state.instrument.layout[note])
        }
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
        return <div className="keyboard">
            {state.instrument.layout.map(note => {
                return <Note
                    key={note.index}
                    data={note}
                    clickAction={this.playSound}
                >

                </Note>
            })}
        </div>
    }
}
const delayMs = ms => new Promise(res => setTimeout(res, ms))
export default Keyboard
