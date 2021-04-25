import React, { Component } from 'react'
import ZangoDb from "zangodb"
import Menu from "./Components/Composer/menu/Menu"
import { ComposedSong, LoggerEvent, ColumnNote, Column, TempoChangers, ComposerSongSerialization, ComposerSongDeSerialization, getPitchChanger } from "./Components/SongUtils"
import { faPlay, faPlus, faPause, faBars, faChevronLeft, faChevronRight} from "@fortawesome/free-solid-svg-icons"

import rotateImg from "./assets/icons/rotate.svg"
import ComposerKeyboard from "./Components/Composer/ComposerKeyboard"
import ComposerCanvas from "./Components/Composer/ComposerCanvas"
import Instrument from "./Components/audio/Instrument"
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { ComposerSettings } from "./Components/Composer/SettingsObj"
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
            audioContext: new (window.AudioContext || window.webkitAudioContext)(),
            songs: [],
            isPlaying: false,
            song: new ComposedSong("Untitled"),
            settings: settings,
            menuOpen: false,
            layer:1
        }
        this.hasChanges = false
        this.syncSongs()
        this.loadInstrument("lyre")
    }
    componentDidMount() {
        window.addEventListener("keydown", this.handleKeyboard)
    }
    componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKeyboard)
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
        if (setting.key === "instrument") {
            this.loadInstrument(data.value)
        }
        this.setState({
            settings: settings,
            song: this.state.song
        }, () => {
            this.updateSettings()
            if (data.songSetting) this.updateSong(this.state.song)
        })
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
        /*
            let note = this.state.instrument.layout.find(e => e.noteNames.keyboard === letter)
            if (note !== undefined) {
                this.handleClick(note)
            }
        */
        switch (letter) {
            case "D": this.selectColumn(this.state.song.selected + 1)
                break;
            case "A": this.selectColumn(this.state.song.selected - 1)
                break;
            case "1": this.handleTempoChanger(TempoChangers[0])
                break;
            case "2": this.handleTempoChanger(TempoChangers[1])
                break;
            case "3": this.handleTempoChanger(TempoChangers[2])
                break;
            case "4": this.handleTempoChanger(TempoChangers[3])
                break;
            case " ": this.togglePlay()
                break;
            case "":
                break;
        }
    }
    playSound = (note) => {
        const source = this.state.audioContext.createBufferSource()
        source.buffer = note.buffer
        source.playbackRate.value = getPitchChanger(this.state.settings.pitch.value)
        source.connect(this.state.audioContext.destination)
        source.start(0)

    }
    handleClick = (note) => {
        let instrument = this.state.instrument
        let column = this.state.song.columns[this.state.song.selected]
        let index = column.notes.findIndex((n) => {
            return note.index === n.index
        })
        if (index < 0) {
            column.notes.push(new ColumnNote(note.index))
        } else {
            column.notes.splice(index, 1)
        }
        instrument.layout[note.index].clicked = true
        this.setState({
            instrument: this.state.instrument
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
                let songName = prompt(promptString)
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
        return new Promise(resolve => {
            let prompt = window.confirm(`You have unsaved changes to the song: ${this.state.song.name} do you want to save now?`)
            resolve(prompt)
        })
    }
    songExists = async (name) => {
        return await this.dbCol.songs.findOne({ name: name }) !== undefined
    }
    createNewSong = async () => {
        if (this.state.song.name !== "Untitled" && this.hasChanges) {
            let wantsToSave = this.askForSongUpdate()
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
            songColumns.splice(position, 0, ...columns);
        }
        this.hasChanges = true
        this.setState({
            song: this.state.song
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
        console.log(indexOfBreakpoint, song.breakpoints)
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
        let song = this.state.song
        if (index < 0 || index > song.columns.length - 1) return
        let keyboard = this.state.instrument.layout
        keyboard.forEach(note => {
            note.clicked = false
        })
        let currentColumn = this.state.song.columns[index]

        song.selected = index
        this.setState({
            song: song,
            instrument: this.state.instrument
        }, () => {
            if (ignoreAudio) return
            currentColumn.notes.forEach(note => {
                this.playSound(keyboard[note.index])
            })
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
        let scrollPosition = 0
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
                <div className="column">

                    <div className="top-panel-composer">
                        <div className="buttons-composer-wrapper">
                            <div className="tool" onClick={() => this.selectColumn(this.state.song.selected - 1)}>
                                <FontAwesomeIcon icon={faChevronLeft} />
                            </div>
                            <div className="tool" onClick={() => this.selectColumn(this.state.song.selected + 1)}>
                                <FontAwesomeIcon icon={faChevronRight} />
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
                            <div className="tool-slim" onClick={() => this.addColumns(this.state.settings.beatMarks.value * 5 * 2, "end")}>
                                <FontAwesomeIcon icon={faPlus} />
                            </div>
                        </div>
                    </div>
                    <div className="scroll-bar-outer">
                        <div className="scroll-bar-inner" style={{ width: scrollPosition }}>

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

export default Composer