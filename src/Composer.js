import React, { Component } from 'react'
import ZangoDb from "zangodb"
import Menu from "./Components/Composer/menu/Menu"
import { ComposedSong, LoggerEvent, ColumnNote, Column, TempoChangers,
     ComposerSongSerialization, ComposerSongDeSerialization, getPitchChanger,RecordingToComposed } from "./Components/SongUtils"
import { faPlay, faPlus, faPause, faBars, faChevronLeft, faChevronRight, faLayerGroup } from "@fortawesome/free-solid-svg-icons"

import rotateImg from "./assets/icons/rotate.svg"
import ComposerKeyboard from "./Components/Composer/ComposerKeyboard"
import ComposerCanvas from "./Components/Composer/ComposerCanvas"
import Instrument from "./Components/audio/Instrument"
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { ComposerSettings } from "./Components/Composer/SettingsObj"
import addCell from "./assets/icons/addCell.svg"
import {asyncConfirm,asyncPrompt} from "./Components/AsyncPrompts"
import removeCell from "./assets/icons/removeCell.svg"
class Composer extends Component {
    constructor(props) {
        super(props)
        this.db = new ZangoDb.Db("Genshin", { songs: [] })
        this.dbCol = {
            songs: this.db.collection("songs")

        }
        let settings = this.getSettings()
        this.playbackInterval = undefined
        this.state = {
            instrument: new Instrument(),
            layers: [new Instrument(), new Instrument()],
            audioContext: new (window.AudioContext || window.webkitAudioContext)(),
            reverbAudioContext: new (window.AudioContext || window.webkitAudioContext)(), 
            songs: [],
            isPlaying: false,
            song: new ComposedSong("Untitled"),
            settings: settings,
            menuOpen: false,
            layer: 1
        }
        this.hasChanges = false
        this.syncSongs()
        this.loadInstrument("lyre", 1)
        this.loadInstrument("lyre", 2)
        this.loadInstrument("lyre", 3)
        try{
            this.loadReverb()
        }catch{
            console.log("Error with reverb")
        }
        this.previousTime = new Date().getTime()
    }
    componentDidMount() {
        window.addEventListener("keydown", this.handleKeyboard)
    }
    componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKeyboard)
    }
    componentDidCatch(){
        this.setState({
            song: new ComposedSong("Untitled")
        })
        new LoggerEvent("Warning", "There was an error with the song! Restoring default...").trigger()
    }
    loadReverb() {
        let audioCtx = this.state.audioContext
        fetch("./assets/audio/reverb4.wav")
        .then(r => r.arrayBuffer().catch(function(){console.log("Error with reverb ")}))
        .then(b => audioCtx.decodeAudioData(b, (impulse_response) => { 
            let convolver = audioCtx.createConvolver()
            let gainNode = audioCtx.createGain()
            gainNode.gain.value = 2.5
            convolver.buffer = impulse_response
            convolver.connect(gainNode)
            gainNode.connect(audioCtx.destination)
            this.setState({
                reverbAudioContext:convolver
            })
        })).catch(function(){
            console.log("Error with reverb")
        })
    }
    getSettings = () => {
        let storedSettings = localStorage.getItem("Genshin_Composer_Settings")
        try {
            storedSettings = JSON.parse(storedSettings)
        } catch (e) {
            storedSettings = null
        }
        if (storedSettings !== null) {
            if (storedSettings.settingVesion !== ComposerSettings.settingVesion) {
                this.updateSettings(ComposerSettings)
                return ComposerSettings
            }
            return storedSettings
        }
        return ComposerSettings
    }
    updateSettings = (override) => {
        let state
        if (override !== undefined) {
            state = override
        } else {
            state = this.state.settings
        }
        localStorage.setItem("Genshin_Composer_Settings", JSON.stringify(state))
    }
    handleSettingChange = (setting) => {
        let settings = this.state.settings
        let data = setting.data
        settings[setting.key].value = data.value
        if (data.songSetting) {
            this.state.song[setting.key] = data.value
        }
        if (setting.key === "instrument") this.loadInstrument(data.value, 1)
        if (setting.key === "layer2") this.loadInstrument(data.value, 2)
        if (setting.key === "layer3") this.loadInstrument(data.value, 3)
        this.setState({
            settings: settings,
            song: this.state.song
        }, () => {
            this.updateSettings()
            if (data.songSetting) this.updateSong(this.state.song)
        })
    }
    loadInstrument = async (name, layer) => {
        if (layer === 1) {
            let newInstrument = new Instrument(name)
            await newInstrument.load(this.state.audioContext)
            this.setState({
                instrument: newInstrument
            })
        } else {
            let newInstrument = new Instrument(name)
            let layers = this.state.layers
            layers[layer - 2] = newInstrument
            await layers[layer - 2].load(this.state.audioContext)
            this.setState({
                layers: layers
            })
        }


    }

    handleKeyboard = (event) => {
        let key = event.keyCode
        /*
            let note = this.state.instrument.layout.find(e => e.noteNames.keyboard === letter)
            if (note !== undefined) {
                this.handleClick(note)
            }
        */
       if(document.activeElement.tagName === "INPUT") return
        switch (key) {
            case 68: this.selectColumn(this.state.song.selected + 1)
                break;
            case 65: this.selectColumn(this.state.song.selected - 1)
                break;
            case 49: this.handleTempoChanger(TempoChangers[0])
                break;
            case 50: this.handleTempoChanger(TempoChangers[1])
                break;
            case 51: this.handleTempoChanger(TempoChangers[2])
                break;
            case 52: this.handleTempoChanger(TempoChangers[3])
                break;
            case 32: this.togglePlay()
                break;
            case 81: this.removeColumns(1,this.state.song.selected )
                break;
            case 69: this.addColumns(1,this.state.song.selected)
                break;

            case "":
                break;
        }
    }
    playSound = (note) => {
        const source = this.state.audioContext.createBufferSource()
        source.buffer = note.buffer
        source.playbackRate.value = getPitchChanger(this.state.settings.pitch.value)
        if (this.state.settings.caveMode.value) {
            source.connect(this.state.reverbAudioContext)
        } else {
            source.connect(this.state.audioContext.destination)
        }
        source.start(0)

    }
    handleClick = (note) => {
        let column = this.state.song.columns[this.state.song.selected]
        let index = column.notes.findIndex((n) => {
            return note.index === n.index
        })
        let layerIndex = this.state.layer - 1
        if (index < 0) { //if it doesn't exist, create a new one
            let columnNote = new ColumnNote(note.index)
            columnNote.layer = replaceAt(columnNote.layer, layerIndex, "1")
            column.notes.push(columnNote)
        } else { //if it exists, toggle the current layer and if it's 000 delete it
            let currentNote = column.notes[index]
            currentNote.layer = replaceAt(currentNote.layer, layerIndex, currentNote.layer[layerIndex] === "0" ? "1" : "0")
            if (currentNote.layer === "000") column.notes.splice(index, 1)
        }
        this.setState({
            song: this.state.song
        })
        this.hasChanges = true
        this.playSound(note)
    }
    syncSongs = async () => {
        let songs = await this.dbCol.songs.find().toArray()
        songs = songs.map(song => {
            if (song.data.isComposedVersion) {
                return ComposerSongDeSerialization(song)
            }
            return song
        })
        this.setState({
            composedSongs: songs,
            songs: songs
        })
    }
    addSong = async (song) => {
        if (await this.songExists(song.name)) {
            return new LoggerEvent("Warning", "A song with this name already exists! \n" + song.name).trigger()
        }
        await this.dbCol.songs.insert(ComposerSongSerialization(song))
        this.syncSongs()
    }
    updateSong = async (song) => {
        if (song.name === "Untitled") {
            let name = await this.askForSongName()
            if (name === null) return
            song.name = name
            return this.addSong(song)

        }
        return new Promise(async resolve => {
            if (await this.songExists(song.name)) {
                await this.dbCol.songs.update({ name: song.name }, ComposerSongSerialization(song))
                console.log("song saved:", song.name)
                this.hasChanges = false
                this.syncSongs()
            } else {
                console.log("song doesn't exist")
                song.name = "Untitled"
                this.updateSong(song)
            }
            resolve()
        })
    }
    askForSongName = () => {
        return new Promise(async resolve => {
            let promptString = "Write song name, press cancel to ignore"
            while (true) {
                let songName = await asyncPrompt(promptString)
                if (songName === null) return resolve(null)
                if (songName !== "") {
                    if (await this.songExists(songName)) {
                        promptString = "This song already exists: " + songName
                    } else {
                        return resolve(songName)
                    }
                } else {
                    promptString = "Write song name, press cancel to ignore"
                }
            }
        })

    }
    askForSongUpdate = () => {
        return new Promise(async resolve => {
            let result = await asyncConfirm(`You have unsaved changes to the song: "${this.state.song.name}" do you want to save now?`) 
            resolve(result)
        })
    }
    songExists = async (name) => {
        return await this.dbCol.songs.findOne({ name: name }) !== undefined
    }
    createNewSong = async () => {
        if (this.state.song.name !== "Untitled" && this.hasChanges) {
            let wantsToSave = await this.askForSongUpdate()
            if (wantsToSave) {
                await this.updateSong(this.state.song)
            }
        }
        let name = await this.askForSongName()
        if (name === null) return
        let song = new ComposedSong(name)
        this.hasChanges = false
        this.setState({
            song: song
        }, () => this.addSong(song))
    }
    removeSong = (name) => {
        this.dbCol.songs.remove({ name: name }, this.syncSongs)
    }
    loadSong = async (song) => {
        if(!song.data.isComposedVersion){
            song = RecordingToComposed(song)
            song.name += " - Composed"
        }
        let stateSong = this.state.song
        if (stateSong.notes.length > 0) {
            await this.updateSong(stateSong)
        }
        let settings = this.state.settings
        settings.bpm.value = song.bpm
        settings.pitch.value = song.pitch
        this.hasChanges = false
        this.setState({
            song: song,
            settings: settings
        })
    }
    addColumns = (amount = 1, position = "end") => {
        let columns = new Array(amount).fill().map(() => new Column())
        let songColumns = this.state.song.columns
        if (position === "end") {
            songColumns.push(...columns)
        } else {
            songColumns.splice(position + 1, 0, ...columns)
        }
        if(amount === 1) this.selectColumn(this.state.song.selected + 1)
        this.hasChanges = true
        this.setState({
            song: this.state.song
        })
    }
    removeColumns = (amount, position) => {
        let song = this.state.song
        if(song.columns.length < 16) return
        song.columns.splice(position, amount)
        if(song.columns.length <= song.selected) this.selectColumn(song.selected - 1)
        this.hasChanges = true
        this.setState({
            song: song
        })
    }
    //----------------------------------------------//

    togglePlay = async (override) => {
        let newState = typeof override === "boolean" ? override : !this.state.isPlaying
        this.setState({
            isPlaying: newState
        }, async () => {
            this.selectColumn(this.state.song.selected)
            while (this.state.isPlaying) {
                let state = this.state
                const { song, settings } = state
                let tempoChanger = TempoChangers[song.columns[song.selected]?.tempoChanger]
                let msPerBPM = Math.floor(60000 / settings.bpm.value * tempoChanger?.changer)
                await delayMs(msPerBPM)
                this.previousTime = new Date().getTime()
                this.handleTick()
            }
        })


    }
    handleTick = () => {
        let newIndex = this.state.song.selected + 1
        if (this.state.isPlaying && newIndex > this.state.song.columns.length - 1) {
            return this.togglePlay(false)
        }
        this.selectColumn(this.state.song.selected + 1)

    }
    toggleMenuVisible = () => {
        this.setState({
            menuOpen: !this.state.menuOpen
        })
    }
    toggleBreakpoint = () => {
        let song = this.state.song
        let index = song.selected

        let indexOfBreakpoint = song.breakpoints.indexOf(index)
        if (indexOfBreakpoint >= 0 && song.columns.length > index) {
            song.breakpoints.splice(indexOfBreakpoint, 1)
        } else if (song.columns.length > index) {
            song.breakpoints.push(index)
        }
        this.setState({
            song: song
        })
    }
    handleTempoChanger = (changer) => {
        let song = this.state.song
        song.columns[this.state.song.selected].tempoChanger = changer.id
        this.hasChanges = true
        this.setState({
            song: song
        })
    }
    selectColumn = (index, ignoreAudio) => {
        const state = this.state
        let song = state.song
        if (index < 0 || index > song.columns.length - 1) return
        let keyboard = state.instrument.layout
        let layers = state.layers.map(e => e.layout)
        let currentColumn = state.song.columns[index]
        song.selected = index
        this.setState({
            song: song
        })
        if (ignoreAudio) return
        currentColumn.notes.forEach(note => {
            if (note.layer[0] === "1") this.playSound(keyboard[note.index])
            if (note.layer[1] === "1") this.playSound(layers[0][note.index])
            if (note.layer[2] === "1") this.playSound(layers[1][note.index])
        })
    }
    changeLayer = (layer) => {
        this.setState({
            layer: layer
        })
    }
    render() {

        const { state, props } = this
        let song = state.song
        let menuData = {
            songs: state.songs,
            currentSong: state.song,
            settings: state.settings,
            hasChanges: this.hasChanges,
            menuOpen: state.menuOpen
        }
        let menuFunctions = {
            loadSong: this.loadSong,
            removeSong: this.removeSong,
            createNewSong: this.createNewSong,
            changePage: props.changePage,
            updateSong: this.updateSong,
            handleSettingChange: this.handleSettingChange,
            toggleMenuVisible: this.toggleMenuVisible
        }
        let keyboardFunctions = {
            handleClick: this.handleClick,
            handleTempoChanger: this.handleTempoChanger,
            changeLayer: this.changeLayer
        }
        let keyboardData = {
            keyboard: state.instrument,
            currentColumn: state.song.columns[state.song.selected],
            TempoChangers: TempoChangers,
            layer: state.layer
        }
        let canvasFunctions = {
            selectColumn: this.selectColumn,
            toggleBreakpoint: this.toggleBreakpoint
        }
        let canvasData = {
            columns: song.columns,
            selected: song.selected,
            settings: state.settings,
            breakpoints: state.song.breakpoints
        }
        return <div className="app">
            <div className="hamburger" onClick={this.toggleMenuVisible}>
                <FontAwesomeIcon icon={faBars} />

            </div>
            <div className="rotate-screen">
                <img src={rotateImg}>
                </img>
                    For a better experience, add the website to the home screen, and rotate your device
            </div>
            <div className="right-panel-composer">
                <div className="column fill-x">

                    <div className="top-panel-composer">
                        <div className="buttons-composer-wrapper">
                            <div className="tool" onClick={() => this.selectColumn(song.selected + 1)}>
                                <FontAwesomeIcon icon={faChevronRight} />
                            </div>
                            <div className="tool" onClick={() => this.selectColumn(song.selected - 1)}>
                                <FontAwesomeIcon icon={faChevronLeft} />
                            </div>

                            <div className="tool" onClick={this.togglePlay}>
                                <FontAwesomeIcon icon={this.state.isPlaying ? faPause : faPlay} />
                            </div>
                        </div>
                        <ComposerCanvas
                            key={this.state.settings.columnsPerCanvas.value}
                            functions={canvasFunctions}
                            data={canvasData}
                        />
                        <div className="buttons-composer-wrapper">

                            <div className="tool" onClick={() => this.addColumns(1, song.selected)}>
                                <img src={addCell} className="tool-icon" />
                            </div>
                            <div className="tool" onClick={() => this.removeColumns(1, song.selected)}>
                                <img src={removeCell} className="tool-icon" />
                            </div>
                            <div className="tool" onClick={() => this.addColumns(this.state.settings.beatMarks.value === 4 ? 20 : 15, "end")}>
                                <FontAwesomeIcon icon={faPlus} />
                            </div>
                        </div>
                    </div>
                </div>


                <ComposerKeyboard
                    functions={keyboardFunctions}
                    data={keyboardData}
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
                    {formatMillis(calculateLength(this.state.song, this.state.song.selected))}
                     /
                    {formatMillis(calculateLength(this.state.song, this.state.song.columns.length))}
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
function calculateLength(song, end) {
    let columns = song.columns
    let bpmPerMs = Math.floor(60000 / song.bpm)
    let totalLength = 0
    columns.forEach((column, i) => {
        if (i > end) return
        totalLength += bpmPerMs * TempoChangers[column.tempoChanger].changer
    })
    return totalLength
}
function delayMs(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms)
    })
}
function replaceAt(string, index, replacement) {
    if (index >= string.length) {
        return string.valueOf();
    }

    return string.substring(0, index) + replacement + string.substring(index + 1);
}
export default Composer