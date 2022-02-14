import React, { Component } from 'react'
import { observe } from 'mobx'
import { LAYOUT_IMAGES, appName, speedChangers, MIDI_STATUS } from "appConfig"
import Note from './Components/Note'
import { SongStore } from 'stores/SongStore'
import { delayMs, ComposerToRecording, NotesTable, getNoteText } from "lib/Utils"
import "./Keyboard.css"
import { getMIDISettings } from 'lib/BaseSettings'
import TopPage from './Components/TopPage'
import Analytics from 'lib/Analytics';
import LoggerStore from 'stores/LoggerStore'
import { SliderStore } from 'stores/SongSliderStore'
import cloneDeep from 'lodash.clonedeep'
export default class Keyboard extends Component {
    constructor(props) {
        super(props)
        const propKeyboard = this.props.data.keyboard
        propKeyboard.layout.forEach(note => { note.status = '' })
        this.state = {
            playTimestamp: new Date().getTime(),
            songToPractice: [],
            approachingNotes: NotesTable(appName === 'Sky' ? 15 : 21),
            outgoingAnimation: NotesTable(appName === 'Sky' ? 15 : 21),
            keyboard: propKeyboard.layout,
            approachingScore: {
                correct: 1,
                wrong: 1,
                score: 0,
                combo: 0
            },
            speedChanger: speedChangers.find(e => e.name === 'x1'),
            
        }
        this.MIDISettings = getMIDISettings()
        this.approachRate = 1500
        this.approachingNotesList = []
        this.songTimestamp = 0
        this.nextChunkDelay = 0
        this.disposeStore = () => { }
        this.tickTime = 50
        this.tickInterval = 0
        this.mounted = true
    }

    componentDidMount() {
        window.addEventListener('keydown', this.handleKeyboard)
        this.tickInterval = setInterval(this.tick, this.tickTime)
        this.disposeStore = observe(SongStore.state, async (data) => {
            const value = data.object.data
            const type = value.eventType
            let lostReference = cloneDeep(value.song)
            if (lostReference.data?.isComposedVersion) {
                lostReference = ComposerToRecording(lostReference)
            }
            lostReference.timestamp = new Date().getTime()
            let hasSong = false
            const end = value.end || lostReference?.notes?.length || 0
            if (type === 'play') {
                await this.stopSong()
                this.playSong(lostReference, value.start, end)
                hasSong = true
            }
            if (type === 'practice') {
                await this.stopSong()
                this.practiceSong(lostReference, value.start, end)
                hasSong = true
            }
            if (type === 'approaching') {
                await this.stopSong()
                this.approachingSong(lostReference, value.start, end)
                hasSong = true
            }
            if (type === 'stop') await this.stopSong()
            if (!this.mounted) return
            this.props.functions.setHasSong(hasSong)
            if(type !== 'stop') {
                Analytics.songEvent({type})
                SliderStore.setState({
                    size: lostReference?.notes?.length || 1,
                    position: value.start,
                    end: end,
                    current: value.start
                })
            }
        })
        if (this.MIDISettings.enabled) {
            if (navigator.requestMIDIAccess) {
                navigator.requestMIDIAccess().then(this.initMidi, () => {
                    LoggerStore.error('MIDI permission not accepted')
                })
            } else {
                LoggerStore.error('MIDI is not supported on this browser')
            }
        }
    }
    componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKeyboard)
        this.disposeStore()
        this.songTimestamp = 0
        this.mounted = false
        if (this.MidiAccess) this.MidiAccess.onstatechange = null
        if (this.currentMidiSource) this.currentMidiSource.onmidimessage = null
        clearInterval(this.tickInterval)
    }
    initMidi = (e) => {
        e.onstatechange = () => this.initMidi(this.MidiAccess)
        this.MidiAccess = e
        const midiInputs = this.MidiAccess.inputs.values()
        const inputs = []
        for (let input = midiInputs.next(); input && !input.done; input = midiInputs.next()) {
            inputs.push(input.value)
        }
        if (this.currentMidiSource) this.currentMidiSource.onmidimessage = null
        this.currentMidiSource = inputs.find(input => {
            return input.name + " " + input.manufacturer === this.MIDISettings.currentSource
        })
        if (this.currentMidiSource) this.currentMidiSource.onmidimessage = this.handleMidi
    }
    handleMidi = (e) => {
        if (!this.mounted) return
        const instrument = this.props.data.keyboard
        const { data } = e
        const [eventType, note, velocity] = data
        if (MIDI_STATUS.down === eventType && velocity !== 0) {
            const keyboardNotes = this.MIDISettings.notes.filter(e => e.midi === note)
            keyboardNotes.forEach(keyboardNote => {
                this.handleClick(instrument.layout[keyboardNote.index])
            })
        }
    }
    approachingSong = async (song,start = 0, end) => {
        end = end ? end : song.notes.length
        let notes = []
        this.approachRate = this.props.data.approachRate || 1500
        let startDelay = this.approachRate
        const startOffset = song.notes[start] !== undefined ? song.notes[start][1] : 0
        for(let i = start; i < end && i < song.notes.length; i++){
            const note = song.notes[i]
            let obj = {
                time: Math.floor((note[1] - startOffset )/ this.state.speedChanger.value + startDelay),
                index: note[0]
            }
            notes.push(obj)
        }
        this.setState({
            approachingNotes: NotesTable(appName === 'Sky' ? 15 : 21),
            approachingScore: {
                correct: 1,
                wrong: 1,
                score: 0,
                combo: 0
            }
        })
        this.approachingNotesList = notes
    }

    tick = () => {
        if (!this.props.data.hasSong) return
        const { approachingNotes, approachingScore, speedChanger } = this.state
        let stateNotes = approachingNotes
        let notes = this.approachingNotesList
        notes.forEach(note => {
            note.time -= this.tickTime
        })
        let hasChanges = false
        let removed = 0
        for (let i = 0; i < notes.length; i++) {
            if (notes[i].time < this.approachRate) {
                stateNotes[notes[i].index].push({
                    clicked: false,
                    time: this.approachRate,
                    id: Math.floor(Math.random() * 10000)
                })
                notes.splice(i, 1)
                i--
                hasChanges = true
            } else {
                break
            }
        }
        stateNotes.forEach(note => {
            for (let i = 0; i < note.length; i++) {
                let apNote = note[i]
                apNote.time -= this.tickTime
                if (apNote.clicked) {
                    if (apNote.time < this.approachRate / 3) {
                        approachingScore.correct++
                        approachingScore.combo++
                        approachingScore.score += approachingScore.combo * speedChanger.value
                    } else {
                        approachingScore.wrong++
                        approachingScore.combo = 0
                    }
                    apNote.time = -1 //so that it can be removed after
                }
                if (apNote.time < 0) {
                    if (!apNote.clicked) {
                        approachingScore.wrong++
                        approachingScore.combo = 0
                    }
                    note.splice(i, 1)
                    i--
                    hasChanges = true
                    removed++
                }
            }
        })
        if (!hasChanges) return
        SliderStore.setCurrent(SliderStore.current + removed)
        this.setState({
            approachingNotes: stateNotes.map(arr => arr.slice()), //removes ref
            approachingScore: approachingScore
        })
    }

    playSong = async (song, start = 0, end) => {
        end = end ? end : song.notes.length
        this.songTimestamp = song.timestamp
        const { keyboard } = this.state
        const notes = this.applySpeedChange(song.notes)
        if (notes.length === 0 || notes.length <= start) return
        let previous = notes[start][1]
        let pastError = 0
        let previousTime = new Date().getTime()
        for (let i = start; i < end && i < song.notes.length; i++) {
            let delay = notes[i][1] - previous
            previous = notes[i][1]
            previousTime = new Date().getTime()
            if (delay > 16) await delayMs(delay - pastError)
            if (!this.mounted || this.songTimestamp !== song.timestamp) return
            this.handleClick(keyboard[notes[i][0]])
            SliderStore.setCurrent(i+1)
            pastError = new Date().getTime() - previousTime - delay
        }
    }
    applySpeedChange = (notes) => {
        return notes.map(note => {
            note[1] = note[1] / this.state.speedChanger.value
            return note
        })
    }
    practiceSong = (song, start = 0, end) => {
        end = end ? end : song.notes.length
        const { keyboard } = this.state
        let notes = this.applySpeedChange(song.notes)
        let songLength = notes.length
        notes = notes.slice(start, end)
        let chunks = [] 
        let previousChunkDelay = 0
        for (let i = 0; notes.length > 0; i++) {
            let chunk = {
                notes: [notes.shift()],
                delay: 0
            }
            let startTime = chunk.notes.length > 0 ? chunk.notes[0][1] : 0
            for (let j = 0; j < notes.length && j < 20; j++) {
                let difference = notes[j][1] - chunk.notes[0][1] - 50 //TODO add threshold here
                if (difference < 0) {
                    chunk.notes.push(notes.shift())
                    j--
                }
            }
            chunk.delay = previousChunkDelay
            previousChunkDelay = notes.length > 0 ? notes[0][1] - startTime : 0
            chunks.push(chunk)
        }
        if (chunks.length === 0) return
        let firstChunk = chunks[0]
        this.nextChunkDelay = 0
        let secondChunk = chunks[1]
        firstChunk.notes.forEach(note => {
            keyboard[note[0]].status = 'toClick'
            keyboard[note[0]].delay = appName === 'Genshin' ? 100 : 200
        })
        secondChunk?.notes.forEach(note => {
            let keyboardNote = keyboard[note[0]]
            if (keyboardNote.status === 'toClick') return keyboardNote.status = 'toClickAndNext'
            keyboardNote.status = 'toClickNext'
        })
        this.props.functions.setHasSong(true)
        this.setState({
            songToPractice: chunks,
            keyboard,
            sliderState: {
                position: start,
                size: songLength
            }
        })
    }
    handleSpeedChanger = (e) => {
        let changer = speedChangers.find(el => el.name === e.target.value)
        this.setState({
            speedChanger: changer
        }, this.restartSong)
    }
    restartSong = async (override) => {
        //TODO why did i lose reference here?
        await this.stopSong()
        if (!this.mounted) return
        SongStore.restart(Number.isInteger(override) ? override : SliderStore.position, SliderStore.end)
    }
    stopSong = () => {
        return new Promise(res => {
            this.songTimestamp = 0
            const { keyboard } = this.state
            keyboard.forEach(note => {
                note.status = ''
                note.delay = appName === 'Genshin' ? 100 : 200
            })
            this.approachingNotesList = []
            this.setState({
                keyboard,
                songToPractice: [],
                approachingNotes: NotesTable(appName === 'Sky' ? 15 : 21)
            }, res)
            this.props.functions.setHasSong(false)
        })
    }
    stopAndClear = () => {
        this.stopSong()
        SongStore.reset()
    }
    handleKeyboard = async (event) => {
        const { keyboard } = this.state
        if (event.repeat) return
        if (document.activeElement.tagName === "INPUT") return
        if (event.shiftKey) {
            switch (event.code) {
                case "KeyR": {
                    if (!this.props.data.hasSong) return
                    if (['practice', 'play', 'approaching'].includes(SongStore.eventType)) {
                        return this.restartSong(0)
                    }
                    break;
                }
                case "KeyS": {
                    if (!this.props.data.hasSong) return
                    return this.stopAndClear()
                }
                default: break;
            }
        } else {
            let code = event.code?.replace("Key", "")
            let index = this.props.data.keyboard.getNoteFromCode(code)
            let note = keyboard[index]
            if (note) this.handleClick(note)
        }

    }

    handleApproachClick = (note) => {
        const { approachingNotes } = this.state
        let approachingNote = approachingNotes[note.index][0]
        if (approachingNote) {
            approachingNote.clicked = true
            if (approachingNote.time < this.approachRate / 3) return "approach-correct"
        }
        return "approach-wrong"
    }
    handlePracticeClick = (note) => {
        const { keyboard, songToPractice } = this.state
        if (songToPractice.length > 0) {
            let indexClicked = songToPractice[0]?.notes.findIndex(e => e[0] === note.index)
            if (indexClicked !== -1) {
                songToPractice[0].notes.splice(indexClicked, 1)
                if (songToPractice[0].notes.length === 0) songToPractice.shift()
                if (songToPractice.length > 0) {
                    let nextChunk = songToPractice[0]
                    let nextNextChunk = songToPractice[1]
                    nextChunk.notes.forEach(note => {
                        keyboard[note[0]].status = 'toClick'
                        keyboard[note[0]].delay = nextChunk.delay
                    })
                    if (nextNextChunk) {
                        nextNextChunk?.notes.forEach(note => {
                            let keyboardNote = keyboard[note[0]]
                            if (keyboardNote.status === 'toClick') return keyboardNote.status = 'toClickAndNext'
                            keyboardNote.status = 'toClickNext'
                        })
                    }
                }
                SliderStore.incrementCurrent()
                this.setState({songToPractice})
            }
        }
    }
    handleClick = (note) => {
        const { keyboard, outgoingAnimation, approachingScore } = this.state
        const hasAnimation = this.props.data.hasAnimation
        const prevStatus = keyboard[note.index].status
        keyboard[note.index].status = 'clicked'
        keyboard[note.index].delay = appName === 'Genshin' ? 100 : 200
        this.handlePracticeClick(note)
        this.props.functions.playSound(note)
        const approachStatus = this.handleApproachClick(note)
        if (SongStore.eventType === 'approaching') {
            keyboard[note.index].status = approachStatus
            if(approachStatus === 'approach-wrong') approachingScore.combo = 0
        }
        if (hasAnimation && SongStore.eventType !== 'approaching') {
            let key = Math.floor(Math.random() * 10000) + new Date().getTime()
            outgoingAnimation[note.index] = [...outgoingAnimation[note.index], { key }]
        }
        this.setState({
            keyboard,
            ...(SongStore.eventType === 'approaching' ? approachingScore: {}),
            ...(hasAnimation ? outgoingAnimation : {})
        }, () => {
            if (!hasAnimation || SongStore.eventType === 'approaching') return
            setTimeout(() => {
                const { outgoingAnimation } = this.state
                outgoingAnimation[note.index].shift()
                outgoingAnimation[note.index] = [...outgoingAnimation[note.index]]
                this.setState({ outgoingAnimation })
            }, 750)
        })
        setTimeout(() => {
            if (!['clicked', 'approach-wrong', 'approach-correct'].includes(keyboard[note.index].status)) return
            if(prevStatus === 'toClickNext') keyboard[note.index].status = prevStatus
            else keyboard[note.index].status = ''
            this.setState({ keyboard })
        }, appName === 'Sky' ? 200 : 100)
    }
    render() {
        const { state, props } = this
        const { data } = props
        const { keyboard, approachingScore, speedChanger } = state
        let size = data.keyboardSize / 100
        if (size < 0.5) size = 0.5
        if (size > 1.5) size = 1.5
        let keyboardClass = "keyboard"
        if (keyboard.length === 15) keyboardClass += " keyboard-5"
        if (keyboard.length === 8) keyboardClass += " keyboard-4"
        return <>
            {<TopPage
                hasSong={data.hasSong}
                restart={this.restartSong}
                handleSpeedChanger={this.handleSpeedChanger}
                speedChanger={speedChanger}
                approachingScore={approachingScore}
            />}
            <div
                className={keyboardClass}
                style={{
                    transform: `scale(${size})`,
                    marginBottom: `${size * 6 + (data.keyboardYPosition / 10)}vh`
                }}
            >
                {data.isLoading
                    ? <div className="loading">Loading...</div>

                    : keyboard.map(note => {
                        let noteImage = LAYOUT_IMAGES[keyboard.length][note.index]
                        let noteData = {
                            ...note,
                            approachRate: this.approachRate,
                            instrument: this.props.data.keyboard.instrumentName,
                            isAnimated: SongStore.eventType === 'approaching' ? false : this.props.data.hasAnimation
                        }
                        return <Note
                            key={note.index}
                            data={noteData}
                            approachingNotes={state.approachingNotes[note.index]}
                            outgoingAnimation={state.outgoingAnimation[note.index]}
                            fadeTime={note.delay}
                            handleClick={this.handleClick}
                            noteText={getNoteText(data.noteNameType, note.index, data.pitch, keyboard.length)}
                            noteImage={noteImage}
                        />

                    })
                }
            </div>
        </>
    }
}

