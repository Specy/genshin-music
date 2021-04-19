import React, { Component } from 'react'
import ZangoDb from "zangodb"
import Menu from "./Components/Composer/menu/Menu"
import { ComposedSong, LoggerEvent, ColumnNote } from "./Components/SongUtils"
import rotateImg from "./assets/icons/rotate.svg"
import ComposerKeyboard from "./Components/Composer/ComposerKeyboard"
import ComposerCanvas from "./Components/Composer/ComposerCanvas"
import Instrument from "./Components/audio/Instrument"

class Composer extends Component {
    constructor(props) {
        super(props)
        this.db = new ZangoDb.Db("Genshin", { songs: [] })
        this.dbCol = {
            songs: this.db.collection("songs")

        }
        this.state = {
            instrument: new Instrument(),
            audioContext: new (window.AudioContext || window.webkitAudioContext)(),
            songs: [],
            song: new ComposedSong("")
        }
        this.syncSongs()
        this.loadInstrument("lyre")
    }
    componentDidMount() {
        window.addEventListener('keydown', this.handleKeyboard)
    }
    componentWillUnmount() {
        window.removeEventListener('click', this.handleKeyboard)
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
    handleKeyboard = (event) => {
        let letter = event.key.toUpperCase()
        let note = this.state.instrument.layout.find(e => e.noteNames.keyboard === letter)
        if (note !== undefined) {
            this.handleClick(note)
        }
    }
    playSound = (note) => {
        const source = this.state.audioContext.createBufferSource()
        source.buffer = note.buffer
        source.connect(this.state.audioContext.destination)
        source.start(0)
        this.setState({
            instrument: this.state.instrument
        })
    }
    handleClick = (note) => {
        let instrument = this.state.instrument
        let column = this.state.song.columns[this.state.song.selected]
        let index = column.notes.findIndex((n) => {
            return note.index === n.index
        })
        if(index < 0){
            column.notes.push(new ColumnNote(note.index))
        }else{
            column.notes.splice(index,1)
        }
        instrument.layout[note.index].clicked = true
        this.playSound(note)
    }
    syncSongs = async () => {
        let songs = await this.dbCol.songs.find().toArray()
        this.setState({
            composedSongs: songs,
            songs: songs
        })
    }
    addSong = async (song) => {
        if (await this.songExists(song.name)) {
            return new LoggerEvent("Warning", "A song with this name already exists! \n" + song.name).trigger()
        }
        await this.dbCol.songs.insert(song)
        this.syncSongs()
    }
    songExists = async (name) => {
        return await this.dbCol.songs.findOne({ name: name }) !== undefined
    }
    createNewSong = () => {
        let name = prompt("Write song name:")
        let song = new ComposedSong(name)
        this.setState({
            song: song
        }, () => this.addSong(song))
    }
    removeSong = (name) => {
        this.dbCol.songs.remove({ name: name }, this.syncSongs)
    }
    loadSong = (song) => {
        this.setState({
            song: song
        },() => console.log(this.state))
    }
    //----------------------------------------------//
    selectColumn = (index) => {
        let song = this.state.song
        let keyboard = this.state.instrument.layout
        keyboard.forEach(note => {
            note.clicked = false
        })
        let currentColumn = this.state.song.columns[index]

        song.selected = index
        this.setState({
            song: song,
            instrument: this.state.instrument
        },() => {
            currentColumn.notes.forEach(note => {
                this.playSound(keyboard[note.index])
             })
        })
    }
    render() {
        let song = this.state.song
        let menuData = {
            songs: this.state.songs
        }
        let menuFunctions = {
            loadSong: this.loadSong,
            removeSong: this.removeSong,
            createNewSong: this.createNewSong,
            changePage: this.props.changePage
        }
        let keyboardFunctions = {
            handleClick: this.handleClick
        }
        let keyboardData = {
            keyboard: this.state.instrument,
            currentColumn: this.state.song.columns[this.state.song.selected]
        }
        let canvasFunctions = {
            selectColumn: this.selectColumn
        }
        let canvasData = {
            columns: song.columns,
            selected: song.selected
        }
        return <div className="app">
            <div className="rotate-screen">
                <img src={rotateImg}>
                </img>
                    For a better experience, add the website to the home screen, and rotate your device
            </div>
            <div className="right-panel-composer">
                <ComposerCanvas
                    functions = {canvasFunctions}
                    data = {canvasData}
                />
                <ComposerKeyboard
                    functions = {keyboardFunctions}
                    data = {keyboardData}
                />
            </div>
            <Menu
                data={menuData}
                functions={menuFunctions}
            />
            <div className="songName">
                {song.name}
            </div>
        </div>
    }
}



export default Composer