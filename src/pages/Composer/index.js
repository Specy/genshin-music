import React, { Component } from 'react'
import { FaPlay, FaPlus, FaPause, FaBars, FaChevronLeft, FaChevronRight, FaTools } from 'react-icons/fa';

import addCell from "assets/icons/addCell.svg"
import removeCell from "assets/icons/removeCell.svg"
import { appName, audioContext } from "appConfig"

import MidiImport from "./MidiParser"
import ComposerTools from "./Components/ComposerTools"
import ComposerKeyboard from "./ComposerKeyboard"
import ComposerCanvas from "./Canvas"
import Menu from "./Components/Menu"

import { asyncConfirm, asyncPrompt } from "components/AsyncPrompts"
import { ComposerSettings } from "lib/SettingsObj"
import Instrument from "lib/Instrument"
import {
    ComposedSong, LoggerEvent, ColumnNote, Column, TempoChangers,
    ComposerSongSerialization, ComposerSongDeSerialization, getPitchChanger, RecordingToComposed, delayMs
} from "lib/Utils"
import AudioRecorder from 'lib/AudioRecorder'
import { DB } from 'Database';

class Composer extends Component {
    constructor(props) {
        super(props)

        const settings = this.getSettings()
        this.playbackInterval = undefined
        this.audioContext = audioContext
        this.reverbNode = undefined
        this.reverbVolumeNode = undefined
        this.recorder = new AudioRecorder()
        this.state = {
            instrument: new Instrument(),
            layers: [new Instrument(), new Instrument()],
            songs: [],
            isPlaying: false,
            song: new ComposedSong("Untitled"),
            settings: settings,
            menuOpen: false,
            layer: 1,
            toolsColumns: [],
            toolsVisible: false,
            midiVisible: false,
            isRecordingAudio: false
        }
        this.state.song.bpm = settings.bpm.value
        this.mounted = false
        this.copiedColums = []
        this.changes = 0
        this.broadcastChannel = {}
    }

    componentDidMount() {
        this.mounted = true
        this.init()
        window.addEventListener("keydown", this.handleKeyboard)
        this.broadcastChannel = window.BroadcastChannel ? new BroadcastChannel(appName + '_composer') : {}
        this.broadcastChannel.onmessage = (event) => {
            if (!this.state.settings.syncTabs.value) return
            if (!['play', 'stop'].includes(event?.data)) return
            this.togglePlay(event.data === 'play')
        }
        if (window.location.hostname !== "localhost") {
            window.addEventListener("beforeunload", (event) => {
                event.preventDefault()
                event.returnValue = ''
            })
        }

    }
    componentWillUnmount() {
        this.mounted = false
        window.removeEventListener('keydown', this.handleKeyboard)
        const { instrument, layers } = this.state
        this.broadcastChannel?.close?.()
        const instruments = [instrument, layers[0], layers[1]]
        instruments.forEach(instrument => instrument.delete())
        this.reverbNode = undefined
        this.reverbVolumeNode = undefined
        this.audioContext = undefined
        let state = this.state
        state.isPlaying = false
    }

    init = async () => {
        this.syncSongs()
        const { settings } = this.state
        const promises = [
            this.loadInstrument(settings.instrument.value, 1),
            this.loadInstrument(settings.layer2.value, 2),
            this.loadInstrument(settings.layer3.value, 3)
        ]
        if (this.mounted) await Promise.all(promises)
        if (this.mounted) await this.loadReverb()
        if (this.mounted) this.setupAudioDestination(settings.caveMode.value)
    }
    componentDidCatch() {
        this.setState({
            song: new ComposedSong("Untitled")
        })
        new LoggerEvent("Warning", "There was an error with the song! Restoring default...").trigger()
    }
    handleAutoSave = () => {
        this.changes++
        if (this.changes > 5 && this.state.settings.autosave.value) {
            if (this.state.song.name !== "Untitled") {
                this.updateSong(this.state.song)
            }

        }
    }
    loadReverb() {
        return new Promise(resolve => {
            fetch("./assets/audio/reverb4.wav")
                .then(r => r.arrayBuffer())
                .then(b => {
                    if (!this.mounted) return
                    this.audioContext.decodeAudioData(b, (impulse_response) => {
                        if (!this.mounted) return
                        let convolver = this.audioContext.createConvolver()
                        let gainNode = this.audioContext.createGain()
                        gainNode.gain.value = 2.5
                        convolver.buffer = impulse_response
                        convolver.connect(gainNode)
                        gainNode.connect(this.audioContext.destination)
                        this.reverbNode = convolver
                        this.reverbVolumeNode = gainNode
                        resolve()
                    })
                }).catch((e) => {
                    console.log("Error with reverb", e)
                })
        })
    }
    getSettings = () => {
        let storedSettings = localStorage.getItem(appName + "_Composer_Settings")
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
        localStorage.setItem(appName + "_Composer_Settings", JSON.stringify(state))
    }

    handleSettingChange = (setting) => {
        const { state } = this
        let settings = state.settings
        let data = setting.data
        settings[setting.key].value = data.value
        if (data.songSetting) {
            state.song[setting.key] = data.value
        }
        if (setting.key === "instrument") this.loadInstrument(data.value, 1)
        if (setting.key === "layer2") this.loadInstrument(data.value, 2)
        if (setting.key === "layer3") this.loadInstrument(data.value, 3)
        if (setting.key === "caveMode") this.setupAudioDestination(data.value)
        this.setState({
            settings: settings,
            song: this.state.song
        }, () => {
            this.updateSettings()
        })
    }

    loadInstrument = async (name, layer) => {
        if (!this.mounted) return
        const { settings } = this.state
        if (layer === 1) {
            this.state.instrument.delete()
            let newInstrument = new Instrument(name)
            await newInstrument.load()
            if (!this.mounted) return
            newInstrument.changeVolume(settings.instrument.volume)
            this.setState({
                instrument: newInstrument
            })
        } else {
            let newInstrument = new Instrument(name)
            let layers = this.state.layers
            layers[layer - 2].delete()
            layers[layer - 2] = newInstrument
            await newInstrument.load()
            if (!this.mounted) return
            newInstrument.changeVolume(settings[`layer${layer}`]?.volume)
            this.setState({
                layers: layers
            })
        }
        this.setupAudioDestination(settings.caveMode.value)
    }
    changeVolume = (obj) => {
        let settings = this.state.settings
        if (obj.key === "instrument") {
            settings.instrument.volume = obj.value
            this.state.instrument.changeVolume(obj.value)
        }
        if (obj.key === "layer2") {
            settings.layer2.volume = obj.value
            this.state.layers[0].changeVolume(obj.value)
        }
        if (obj.key === "layer3") {
            settings.layer3.volume = obj.value
            this.state.layers[1].changeVolume(obj.value)
        }
        this.setState({
            settings: settings
        }, () => this.updateSettings())
    }
    setupAudioDestination = (hasReverb) => {
        if (!this.mounted) return
        const { instrument, layers } = this.state
        const instruments = [instrument, layers[0], layers[1]]
        instruments.forEach(ins => {
            if (hasReverb) {
                if (!this.reverbNode) return console.log("Couldn't connect to reverb")
                ins.disconnect()
                ins.connect(this.reverbNode)
            } else {
                ins.disconnect()
                ins.connect(this.audioContext.destination)
            }
        })
    }
    startRecordingAudio = async (override) => { //will record untill the song stops
        if (!this.mounted) return
        if (!override) {
            this.setState({ isRecordingAudio: false })
            return this.togglePlay(false)
        }
        const { instrument, layers } = this.state
        const instruments = [instrument, layers[0], layers[1]]
        const hasReverb = this.state.settings.caveMode.value
        const { recorder } = this
        if (hasReverb) {
            this.reverbVolumeNode.connect(recorder.node)
        } else {
            instruments.forEach(instrument => {
                instrument.connect(recorder.node)
            })
        }
        recorder.start()
        this.setState({ isRecordingAudio: true })
        await this.togglePlay(true) //wait till song finishes
        if (!this.mounted) return
        let recording = await recorder.stop()
        this.setState({ isRecordingAudio: false })
        let fileName = await asyncPrompt("Write the song name, press cancel to ignore")
        if (fileName) recorder.download(recording.data, fileName + '.wav')
        if (!this.mounted) return
        this.reverbVolumeNode.disconnect()
        this.reverbVolumeNode.connect(audioContext.destination)
        this.setupAudioDestination(hasReverb)
    }
    handleKeyboard = (event) => {
        if (document.activeElement.tagName === "INPUT") return
        const { instrument, layer, layers, isPlaying } = this.state
        let key = event.code
        const shouldEditKeyboard = isPlaying || event.shiftKey
        if (shouldEditKeyboard) {
            let letter = key?.replace("Key", "")
            let note = instrument.getNoteFromCode(letter)
            if (note !== null) this.handleClick(instrument.layout[note])
            switch (key) {
                case "Space": {
                    this.togglePlay()
                    if (!this.state.settings.syncTabs.value) break;
                    this.broadcastChannel?.postMessage?.("stop")
                    break;
                }
                default: break;
            }
        } else {
            switch (key) {
                case "KeyD": this.selectColumn(this.state.song.selected + 1); break;
                case "KeyA": this.selectColumn(this.state.song.selected - 1); break;
                case "Digit1": this.handleTempoChanger(TempoChangers[0]); break;
                case "Digit2": this.handleTempoChanger(TempoChangers[1]); break;
                case "Digit3": this.handleTempoChanger(TempoChangers[2]); break;
                case "Digit4": this.handleTempoChanger(TempoChangers[3]); break;
                case "Space": {
                    this.togglePlay()
                    if (!this.state.settings.syncTabs.value) break;
                    this.broadcastChannel?.postMessage?.("play")
                    break;
                }
                case "ArrowUp": {
                    let nextLayer = layer - 1
                    if (nextLayer > 0) this.changeLayer(nextLayer)
                    break;
                }
                case "ArrowDown": {
                    let nextLayer = layer + 1
                    if (nextLayer < layers.length + 2) this.changeLayer(nextLayer)
                    break;
                }
                case "KeyQ": this.removeColumns(1, this.state.song.selected); break;
                case "KeyE": this.addColumns(1, this.state.song.selected); break;
                default: break;
            }
        }

    }
    playSound = (instrument, index) => {
        try {
            let note = instrument.layout[index]
            if (note === undefined) return
            instrument.play(note.index, getPitchChanger(this.state.settings.pitch.value))
        } catch (e) {

        }
    }
    changePitch = (value) => {
        const { settings } = this.state
        settings.pitch.value = value
        this.setState({
            settings: settings
        }, () => this.updateSettings())
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
        this.handleAutoSave()
        let instrument = this.state.instrument
        if (this.state.layer > 1) {
            instrument = this.state.layers[this.state.layer - 2]
        }
        this.playSound(instrument, note.index)
    }
    syncSongs = async () => {
        let songs = await DB.getSongs()
        if (!this.mounted) return
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
        await DB.addSong(ComposerSongSerialization(song))
        this.syncSongs()
    }
    updateSong = async (song) => {
        if (song.name === "Untitled") {
            let name = await this.askForSongName()
            if (!this.mounted) return
            if (name === null) return
            song.name = name
            return this.addSong(song)
        }
        return new Promise(async resolve => {
            let settings = this.state.settings
            if (await this.songExists(song.name)) {
                song.instruments[0] = settings.instrument.value
                song.instruments[1] = settings.layer2.value
                song.instruments[2] = settings.layer3.value
                await DB.updateSong({ name: song.name }, ComposerSongSerialization(song))
                console.log("song saved:", song.name)
                this.changes = 0
                this.syncSongs()
            } else {
                if (song.name.includes("- Composed")) {
                    let name = await this.askForSongName("Write composed song name, press cancel to ignore")
                    if (name === null) return resolve()
                    song.name = name
                    await DB.addSong(ComposerSongSerialization(song))
                    this.syncSongs()
                    return resolve()
                }
                console.log("song doesn't exist")
                song.name = "Untitled"
                this.updateSong(song)
            }
            resolve()
        })
    }
    askForSongName = (question) => {
        return new Promise(async resolve => {
            let promptString = question || "Write song name, press cancel to ignore"
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
                    promptString = question || "Write song name, press cancel to ignore"
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
        return await DB.existsSong({ name: name })
    }
    createNewSong = async () => {
        if (this.state.song.name !== "Untitled" && this.changes > 0) {
            let wantsToSave = await this.askForSongUpdate()
            if (wantsToSave) {
                await this.updateSong(this.state.song)
            }
        }
        let name = await this.askForSongName("Write new song name, press cancel to ignore")
        if (name === null) return
        let song = new ComposedSong(name)
        this.changes = 0
        if (!this.mounted) return
        this.setState({
            song: song
        }, () => this.addSong(song))
    }
    removeSong = async (name) => {
        let confirm = await asyncConfirm("Are you sure you want to delete the song: " + name)
        if (confirm) await DB.removeSong({ name: name })
        this.syncSongs()
    }

    loadSong = async (song) => {
        const state = this.state
        song = JSON.parse(JSON.stringify(song)) //lose reference
        if (!song.data.isComposedVersion) {
            //if(song.bpm <= 220)  song.bpm *= 2
            song = RecordingToComposed(song, 4)
            song.name += " - Composed"
        }
        if (this.changes !== 0) {
            let confirm = state.settings.autosave.value && state.song.name !== "Untitled"
            if (!confirm && state.song.columns.length > 0) {
                confirm = await asyncConfirm(`You have unsaved changes to the song: "${state.song.name}" do you want to save? UNSAVED CHANGES WILL BE LOST`)
            }
            if (confirm) await this.updateSong(state.song)
        }
        let settings = this.state.settings
        settings.bpm.value = song.bpm
        settings.pitch.value = song.pitch
        if (settings.instrument.value !== song.instruments[0]) {
            this.loadInstrument(song.instruments[0], 1)
            settings.instrument.value = song.instruments[0]
        }
        if (settings.layer2.value !== song.instruments[1]) {
            this.loadInstrument(song.instruments[1], 2)
            settings.layer2.value = song.instruments[1]
        }
        if (settings.layer3.value !== song.instruments[2]) {
            this.loadInstrument(song.instruments[2], 3)
            settings.layer3.value = song.instruments[2]
        }
        this.changes = 0
        console.log("song loaded")
        if (!this.mounted) return
        this.setState({
            song: song,
            settings: settings,
            toolsColumns: []
        })
    }

    addColumns = (amount = 1, position = "end") => {
        return new Promise(resolve => {
            let columns = new Array(amount).fill().map(() => new Column())
            let songColumns = this.state.song.columns
            if (position === "end") {
                songColumns.push(...columns)
            } else {
                songColumns.splice(position + 1, 0, ...columns)
            }
            if (amount === 1) this.selectColumn(this.state.song.selected + 1)
            this.handleAutoSave()
            this.setState({ song: this.state.song }, resolve)
        })

    }
    removeColumns = (amount, position) => {
        let song = this.state.song
        if (song.columns.length < 16) return
        let indexes = new Array(amount).fill().map((e, i) => position + i)
        indexes.forEach(index => {
            if (song.breakpoints.includes(index)) this.toggleBreakpoint(index)
        })
        song.columns.splice(position, amount)
        if (song.columns.length <= song.selected) this.selectColumn(song.selected - 1)
        this.handleAutoSave()
        this.setState({ song: song })
    }
    //----------------------------------------------//

    togglePlay = async (override) => {
        return new Promise(resolve => {
            let newState = typeof override === "boolean" ? override : !this.state.isPlaying
            this.setState({
                isPlaying: newState
            }, async () => {
                if (this.state.isPlaying) this.selectColumn(this.state.song.selected)
                let pastError = 0
                let previousTime = new Date().getTime()
                while (this.state.isPlaying) {
                    const { song, settings } = this.state
                    let tempoChanger = TempoChangers[song.columns[song.selected].tempoChanger]
                    let msPerBPM = Math.floor(60000 / settings.bpm.value * tempoChanger.changer) + pastError
                    previousTime = new Date().getTime()
                    await delayMs(msPerBPM)
                    if (!this.state.isPlaying || !this.mounted) break
                    this.handleTick()
                    pastError = previousTime + msPerBPM - new Date().getTime()
                }
                resolve()
            })
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
        this.setState({ menuOpen: !this.state.menuOpen })
    }
    toggleBreakpoint = (override) => {
        let song = this.state.song
        let index = typeof override === "number" ? override : song.selected
        let indexOfBreakpoint = song.breakpoints.indexOf(index)
        if (indexOfBreakpoint >= 0 && song.columns.length > index) {
            song.breakpoints.splice(indexOfBreakpoint, 1)
        } else if (song.columns.length > index) {
            song.breakpoints.push(index)
        }
        this.validateBreakpoints()
        this.setState({ song: song })
    }
    handleTempoChanger = (changer) => {
        let song = this.state.song
        song.columns[this.state.song.selected].tempoChanger = changer.id
        this.handleAutoSave()
        this.setState({ song: song })
    }
    changePage = async (page) => {
        if (this.changes !== 0) {
            if (this.state.settings.autosave.value) {
                await this.updateSong(this.state.song)
            } else {
                let confirm = await asyncConfirm(`You have unsaved changes to the song: "${this.state.song.name}" do you want to save? UNSAVED CHANGES WILL BE LOST`,false)
                if (confirm) {
                    await this.updateSong(this.state.song)
                }
            }

        }
        this.props.changePage(page)
    }
    selectColumn = (index, ignoreAudio) => {
        const state = this.state
        let song = state.song
        if (index < 0 || index > song.columns.length - 1) return
        let currentColumn = state.song.columns[index]
        song.selected = index
        let toolsColumns = state.toolsColumns
        if (state.toolsVisible && this.copiedColums.length === 0) {
            toolsColumns.push(index)
            let min = Math.min(...toolsColumns)
            let max = Math.max(...toolsColumns)
            toolsColumns = new Array(max - min + 1).fill().map((e, i) => min + i)
        }
        this.setState({
            song: song,
            toolsColumns: toolsColumns
        })

        if (ignoreAudio) return
        currentColumn.notes.forEach(note => {
            if (note.layer[0] === "1") this.playSound(state.instrument, note.index)
            if (note.layer[1] === "1") this.playSound(state.layers[0], note.index)
            if (note.layer[2] === "1") this.playSound(state.layers[1], note.index)
        })
    }
    changeLayer = (layer) => {
        this.setState({
            layer: layer
        })
    }
    //-----------------------TOOLS---------------------//
    toggleTools = () => {
        this.setState({
            toolsVisible: !this.state.toolsVisible,
            toolsColumns: this.state.toolsVisible ? [] : [this.state.song.selected]
        })
        this.copiedColums = []
    }
    copyColumns = (layer) => {
        this.copiedColums = []
        this.state.toolsColumns.forEach((index) => {
            let column = this.state.song.columns[index]
            if (column !== undefined) this.copiedColums.push(column)
        })
        this.copiedColums = JSON.parse(JSON.stringify(this.copiedColums)) // removing reference
        if (layer !== 'all') {
            this.copiedColums = this.copiedColums.map(column => {
                column.notes = column.notes.filter(e => e.layer[layer - 1] === '1')
                column.notes = column.notes.map(e => {
                    e.layer = '000'
                    e.layer = replaceAt(e.layer, layer - 1, '1')
                    return e
                })
                return column
            })
        }
        this.setState({ toolsColumns: [] })
    }
    pasteColumns = async (insert) => {
        let song = this.state.song
        let copiedColumns = JSON.parse(JSON.stringify(this.copiedColums))
        if (!insert) {
            song.columns.splice(song.selected, 0, ...copiedColumns)
        } else {
            copiedColumns.forEach((copiedColumn, i) => {
                let column = song.columns[song.selected + i]
                if (column !== undefined) {
                    copiedColumn.notes.forEach(copiedNote => {
                        let index = column.notes.findIndex(note => copiedNote.index === note.index)
                        if (index < 0) {
                            column.notes.push(copiedNote)
                        } else {
                            for (let j = 0; j < 3; j++) {
                                if (copiedNote.layer[j] === '1') {
                                    column.notes[index].layer = replaceAt(column.notes[index].layer, j, 1)
                                }
                            }
                        }
                    })
                }
            })
        }
        this.setState({ song: song })
    }
    eraseColumns = (layer) => {
        let song = this.state.song
        if (layer === 'all') {
            this.state.toolsColumns.forEach(columnIndex => {
                let column = song.columns[columnIndex]
                if (column !== undefined) song.columns[columnIndex].notes = []
            })
        } else {
            this.state.toolsColumns.forEach(columnIndex => {
                let column = song.columns[columnIndex]
                if (column !== undefined) {
                    song.columns[columnIndex].notes.forEach(note => {
                        note.layer = replaceAt(note.layer, layer - 1, '0')
                    })
                }
            })
        }

        this.setState({ song: song })
    }
    validateBreakpoints = () => {
        const breakpoints = this.state.song.breakpoints.filter(breakpoint => breakpoint < this.state.song.columns.length)
        const song = this.state.song
        song.breakpoints = breakpoints
        this.setState({ song: song })
    }
    deleteColumns = async () => {
        const song = this.state.song
        song.columns = song.columns.filter((e, i) => !this.state.toolsColumns.includes(i))
        if (song.selected > song.columns.length - 1) song.selected = song.columns.length - 1
        if (song.selected <= 0) song.selected = 0
        if (song.columns.length === 0) await this.addColumns(12, 0)
        this.setState({
            song: song,
            toolsColumns: []
        }, this.validateBreakpoints)
    }
    changeMidiVisibility = (visibility) => {
        this.setState({ midiVisible: visibility })
    }
    render() {
        const { state } = this
        const { midiVisible, song } = state
        //TODO export the menu outside this component so it doesnt get re rendered at every change
        const songLength = calculateLength(song.columns, state.settings.bpm.value, song.selected)
        const menuData = {
            songs: state.songs,
            currentSong: state.song,
            settings: state.settings,
            hasChanges: this.changes,
            menuOpen: state.menuOpen,
            isRecordingAudio: state.isRecordingAudio
        }
        const menuFunctions = {
            loadSong: this.loadSong,
            removeSong: this.removeSong,
            createNewSong: this.createNewSong,
            changePage: this.changePage,
            updateSong: this.updateSong,
            handleSettingChange: this.handleSettingChange,
            toggleMenuVisible: this.toggleMenuVisible,
            changeVolume: this.changeVolume,
            changeMidiVisibility: this.changeMidiVisibility,
            startRecordingAudio: this.startRecordingAudio
        }
        const keyboardFunctions = {
            handleClick: this.handleClick,
            handleTempoChanger: this.handleTempoChanger,
            changeLayer: this.changeLayer
        }
        const keyboardData = {
            keyboard: state.instrument,
            currentColumn: state.song.columns[state.song.selected],
            TempoChangers: TempoChangers,
            layer: state.layer,
            pitch: state.settings.pitch.value,
            isPlaying: state.isPlaying,
            noteNameType: state.settings.noteNameType.value,
        }
        const canvasFunctions = {
            selectColumn: this.selectColumn,
            toggleBreakpoint: this.toggleBreakpoint
        }
        const canvasData = {
            columns: song.columns,
            selected: song.selected,
            settings: state.settings,
            breakpoints: state.song.breakpoints,
            toolsColumns: state.toolsColumns
        }
        const toolsData = {
            visible: this.state.toolsVisible,
            copiedColumns: this.copiedColums,
            layer: this.state.layer
        }
        const toolsFunctions = {
            toggleTools: this.toggleTools,
            eraseColumns: this.eraseColumns,
            deleteColumns: this.deleteColumns,
            copyColumns: this.copyColumns,
            pasteColumns: this.pasteColumns
        }
        const midiParserFunctions = {
            loadSong: this.loadSong,
            changeMidiVisibility: this.changeMidiVisibility,
            changePitch: this.changePitch,
        }
        const midiParserData = {
            instruments: [state.instrument, ...state.layers].map(layer => layer.instrumentName),
            selectedColumn: song.selected,

        }
        return <div className="app bg-image" style={{ backgroundImage: `url(${state.settings.backgroundImage.value})` }}>
            {midiVisible && <MidiImport functions={midiParserFunctions} data={midiParserData} />}
            <div className="hamburger" onClick={this.toggleMenuVisible}>
                <FaBars />
            </div>
            <div className="right-panel-composer">
                <div className="column fill-x">
                    <div className="top-panel-composer">
                        <div className="buttons-composer-wrapper">
                            <div className="tool" onPointerDown={() => this.selectColumn(song.selected + 1)}>
                                <FaChevronRight />
                            </div>
                            <div className="tool" onClick={() => this.selectColumn(song.selected - 1)}>
                                <FaChevronLeft />
                            </div>

                            <div className="tool" onClick={this.togglePlay}>
                                {this.state.isPlaying ? <FaPause /> : <FaPlay />}
                            </div>
                        </div>
                        <ComposerCanvas
                            key={this.state.settings.columnsPerCanvas.value}
                            functions={canvasFunctions}
                            data={canvasData}
                        />
                        <div className="buttons-composer-wrapper-right">

                            <div className="tool" onClick={() => this.addColumns(1, song.selected)}>
                                <img src={addCell} className="tool-icon" alt="Add a new cell" />
                            </div>
                            <div className="tool" onClick={() => this.removeColumns(1, song.selected)}>
                                <img src={removeCell} className="tool-icon" alt="Remove a cell" />
                            </div>
                            <div className="tool" onClick={() => this.addColumns(this.state.settings.beatMarks.value * 4, "end")}>
                                <FaPlus />
                            </div>
                            <div className="tool" onClick={this.toggleTools}>
                                <FaTools />
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
            <ComposerTools
                data={toolsData}
                functions={toolsFunctions}
            />
            <div className="song-info">
                <div>
                    {song.name}
                </div>
                <div>
                    {formatMillis(songLength.current)}
                    /
                    {formatMillis(songLength.total)}
                </div>
            </div>
        </div>
    }
}
function formatMillis(millis) {
    let minutes = Math.floor(millis / 60000);
    let seconds = ((millis % 60000) / 1000).toFixed(0);
    return (
        seconds === 60
            ? (minutes + 1) + ":00"
            : minutes + ":" + (seconds < 10 ? "0" : "") + seconds
    )
}
function calculateLength(columns, bpm, end) {
    const bpmPerMs = Math.floor(60000 / bpm)
    let totalLength = 0
    let currentLength = 0
    let increment = 0
    for(let i = 0; i< columns.length; i++){
        increment = bpmPerMs * TempoChangers[columns[i].tempoChanger].changer
        if(i < end) currentLength += increment
        totalLength += increment
    }
    return {
        total: totalLength,
        current: currentLength
    }
}

function replaceAt(string, index, replacement) {
    if (index >= string.length) {
        return string.valueOf();
    }
    return string.substring(0, index) + replacement + string.substring(index + 1);
}
export default Composer

