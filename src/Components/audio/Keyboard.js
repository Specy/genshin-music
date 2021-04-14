import React, { Component } from 'react'
import "./Keyboard.css"
import Instrument from "./Instrument"
import Note from "./Note"
class Keyboard extends Component{
    constructor(props){
        super(props)
        this.state = {
            instrument: new Instrument(),
            audioContext: new(window.AudioContext || window.webkitAudioContext)()
        }
        this.loadInstrument(props.data.instrument)
        window.addEventListener("keydown",this.handleKeyboard)
    }
    handleKeyboard = (event) => {
        let letter = event.key.toUpperCase()
        let note = this.state.instrument.layout.find(e => e.noteNames.keyboard === letter)
        if(note !== undefined){
            this.playSound(note)
        }
    }
    loadInstrument = async (name) =>{
        let newInstrument = new Instrument(name)
        let urls = newInstrument.layout.map(e => e.url)
        let buffers = await this.preload(urls)
        newInstrument.setBuffers(buffers)
        this.setState({
            instrument: newInstrument
        })

    }
    playSound = (note) => {
        note.clicked = true
        setTimeout(() =>{
            note.clicked = false
            this.setState({
                instrument: this.state.instrument
            })
        },200)
        const source = this.state.audioContext.createBufferSource()
        source.buffer = note.buffer
        source.connect(this.state.audioContext.destination)
        source.start(0)
        this.setState({
            instrument: this.state.instrument
        })
    }
    preload = (urls) =>{
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
    render(){
        let state = this.state
        return <div className="keyboard">
            {state.instrument.layout.map(note =>{
                return <Note 
                    data={note}
                    clickAction={this.playSound}
                >

                </Note>
            })}
        </div>
    }
}

export default Keyboard
