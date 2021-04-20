import React, { Component } from 'react'
import ZangoDb from "zangodb"
import Menu from "./Components/Composer/menu/Menu"
import { ComposedSong, LoggerEvent, ColumnNote,Column } from "./Components/SongUtils"
import {faPlay , faPlus, faPause} from "@fortawesome/free-solid-svg-icons"
import rotateImg from "./assets/icons/rotate.svg"
import ComposerKeyboard from "./Components/Composer/ComposerKeyboard"
import ComposerCanvas from "./Components/Composer/ComposerCanvas"
import Instrument from "./Components/audio/Instrument"
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
class Composer extends Component {
    constructor(props) {
        super(props)
        this.db = new ZangoDb.Db("Genshin", { songs: [] })
        this.dbCol = {
            songs: this.db.collection("songs")

        }
        this.playbackInterval = undefined
        this.state = {
            instrument: new Instrument(),
            audioContext: new (window.AudioContext || window.webkitAudioContext)(),
            songs: [],
            isPlaying: false,
            song: new ComposedSong("Untitled"),
            settings: {
                bpm: 400
            }
        }
        this.syncSongs()
        this.loadInstrument("lyre")
    }
    componentDidMount() {
        window.addEventListener("keydown", this.handleKeyboard)
    }
    componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKeyboard)
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
        switch(letter){
            case "ARROWRIGHT": this.selectColumn(this.state.song.selected + 1)
                break; 
            case "ARROWLEFT": this.selectColumn(this.state.song.selected - 1)
                break; 
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
    updateSong = async (song) => {
        return new Promise(async resolve => {
            if(this.songExists(song.name)){
                await this.dbCol.songs.update({name: song.name},song)
                console.log("song saved:",song.name)
                this.syncSongs()
            }else{
                console.log("song doesn't exist")
            } 
            resolve()
        })
    }
    handleScroll = () => {

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
    loadSong = async (song) => {
        let stateSong = this.state.song
        if(stateSong.notes.length > 0){
            await this.updateSong(stateSong)
        }
        this.setState({
            song: song
        },() => console.log(this.state))
    }
    addColumns = (amount = 1, position = "end") => {
        let columns = new Array(amount).fill().map(() => new Column())
        let songColumns = this.state.song.columns
        if(position === "end"){
            songColumns.push(...columns)
        }else{
            songColumns.splice(position, 0, ...columns);
        }
        this.setState({
            song: this.state.song
        })
    }
    //----------------------------------------------//

    togglePlay = (override) => {
        let interval = this.playbackInterval
        window.clearInterval(interval)
        let msPerBPM = Math.floor(60000 / this.state.settings.bpm)
        let newState = typeof override === "boolean" ? override : !this.state.isPlaying
        if(newState){
            this.selectColumn(this.state.song.selected)
            this.playbackInterval = setInterval(this.handleTick, msPerBPM)
        }
        this.setState({
            isPlaying: newState
        })
    }
    handleTick = () => {
        let newIndex = this.state.song.selected + 1
        if(this.state.isPlaying && newIndex > this.state.song.columns.length - 1){
           return  this.togglePlay(false)
        }
        this.selectColumn(this.state.song.selected + 1)
    }
    selectColumn = (index) => {
        let song = this.state.song
        if(index < 0 || index > song.columns.length - 1) return
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
            songs: this.state.songs,
            currentSong: this.state.song
        }
        let menuFunctions = {
            loadSong: this.loadSong,
            removeSong: this.removeSong,
            createNewSong: this.createNewSong,
            changePage: this.props.changePage,
            updateSong: this.updateSong
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
        let msPerBPM = Math.floor(60000 / this.state.settings.bpm)
        let scrollPosition = 0
        return <div className="app">
            <div className="rotate-screen">
                <img src={rotateImg}>
                </img>
                    For a better experience, add the website to the home screen, and rotate your device
            </div>
            <div className="right-panel-composer">
                <div className="column">
                    
                    <div className="top-panel-composer">
                    <div className="buttons-composer-wrapper">
                            <div className="tool" onClick={this.togglePlay}>
                                <FontAwesomeIcon  icon={this.state.isPlaying ? faPause : faPlay}/>
                            </div>
                        </div>
                        <ComposerCanvas
                            functions = {canvasFunctions}
                            data = {canvasData}
                        />
                        <div className="buttons-composer-wrapper">
                            <div className="tool-slim" onClick={() => this.addColumns(40,"end")}>
                                    <FontAwesomeIcon  icon={faPlus}/>
                            </div>
                        </div>
                    </div>
                    <div className="scroll-bar-outer">
                        <div className="scroll-bar-inner" style={{width : scrollPosition}}>

                        </div>
                    </div>
                </div>


                <ComposerKeyboard
                    functions = {keyboardFunctions}
                    data = {keyboardData}
                />
            </div>
            <Menu
                data={menuData}
                functions={menuFunctions}
            />
            <div className="song-info">
                <div>
                    {song.name}
                </div>
                <div>
                    {formatMillis(this.state.song.selected * msPerBPM) + " "}
                     / 
                    {" " + formatMillis(this.state.song.columns.length * msPerBPM)}
                </div>
            </div>
        </div>
    }
}
function formatMillis(millis) {
    var minutes = Math.floor(millis / 60000);
    var seconds = ((millis % 60000) / 1000).toFixed(0);
    return minutes + ":" + (seconds < 10 ? '0' : '') + seconds;
  }
  


export default Composer