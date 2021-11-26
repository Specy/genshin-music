import React, { Component } from 'react'
import "./Keyboard.css"
import { delayMs, ComposerToRecording, NotesTable } from "../SongUtils"
import Note from "./Note"
import { keyNames, pitchArr, layoutImages, appName, layoutData,speedChangers } from "../../appConfig"
import { songStore } from './SongStore'
import { observe } from 'mobx'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSyncAlt, faStop } from '@fortawesome/free-solid-svg-icons'
class Keyboard extends Component {
    constructor(props) {
        super(props)
        let propKeyboard = this.props.data.keyboard
        propKeyboard.layout.forEach(note => { note.status = '' })
        this.state = {
            playTimestamp: new Date().getTime(),
            songToPractice: [],
            approachingNotes: NotesTable(appName === 'Sky' ? 15 : 21),
            outgoingAnimation: NotesTable(appName === 'Sky' ? 15 : 21),
            keyboard: propKeyboard.layout,
            sliderState: {
                position: 0,
                size: 0
            },
            approachingScore: {
                correct: 1,
                wrong: 1,
                score: 0,
                combo: 0
            },
			speedChanger: speedChangers.find(e => e.name === 'x1'),
        }
        this.approachRate = 1500
        this.approachingNotesList = []
        this.songTimestamp = 0
        this.nextChunkDelay = 0
        this.disposeStore = () => { }
        this.tickTime = 50
        this.tickInterval = 0
    }

    componentDidMount() {
        window.addEventListener('keydown', this.handleKeyboard)
        this.tickInterval = setInterval(this.tick, this.tickTime)
        this.disposeStore = observe(songStore, async (data) => {
            let value = data.object.data
            let type = value.eventType
            let lostReference = JSON.parse(JSON.stringify(value.song))
            if (lostReference.data?.isComposedVersion) {
                lostReference = ComposerToRecording(lostReference)
            }
            lostReference.timestamp = new Date().getTime()
            let hasSong = false
            if (type === 'play') {
                await this.stopSong()
                this.playSong(lostReference, value.start)
                hasSong = true
            }
            if (type === 'practice') {
                await this.stopSong()
                this.practiceSong(lostReference, value.start)
                hasSong = true
            }
            if (type === 'approaching') {
                await this.stopSong()
                this.approachingSong(lostReference, value.start)
                hasSong = true
            }
            if (type === 'stop') await this.stopSong()
            this.props.functions.setHasSong(hasSong)
        })
    }
    componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKeyboard)
        this.disposeStore()
        this.songTimestamp = 0
        clearInterval(this.tickInterval)
    }

    approachingSong = async (song) => {
        let notes = []
        this.approachRate = this.props.data.approachRate || 1500 
        let startDelay = this.approachRate
        song.notes.forEach(note => {
            let obj = {
                time: Math.floor(note[1] / this.state.speedChanger.value + startDelay),
                index: note[0]
            }
            notes.push(obj)
        })
        this.setState({
            approachingNotes: NotesTable(appName === 'Sky' ? 15 : 21),
            approachingScore: {
                correct: 1,
                wrong: 1,
                score: 0,
                combo: 0
            }
        })
        this.changeSliderState(0, notes.length)
        this.approachingNotesList = notes
    }

    tick = () => {
        if (!this.props.data.hasSong) return
        const { approachingNotes, sliderState, approachingScore , speedChanger} = this.state
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
        this.changeSliderState(sliderState.position + removed)
        this.setState({
            approachingNotes: stateNotes,
            approachingScore: approachingScore
        })
    }

    playSong = async (song, start = 0) => {
        this.songTimestamp = song.timestamp
        const { keyboard } = this.state
        let notes = this.applySpeedChange(song.notes)
        if (notes.length === 0) return
        let previous = notes[0][1]
        let pastError = 0
        let previousTime = new Date().getTime()
        for (let i = start; i < notes.length; i++) {
            let delay = notes[i][1] - previous
            previous = notes[i][1]
            let note = notes[i][0]
            if (this.songTimestamp !== song.timestamp) return
            previousTime = new Date().getTime()
            if (delay > 16) await delayMs(delay - pastError)
            keyboard[note].status = 'clicked'
            this.handleClick(keyboard[note])
            this.setState({
                keyboard,
                sliderState: {
                    position: i,
                    size: notes.length
                }
            })
            pastError = new Date().getTime() - previousTime - delay
        }
        songStore.data = returnStopSong()
    }
    applySpeedChange = (notes) => {
        return notes.map(note => {
            note[1] = note[1] / this.state.speedChanger.value
            return note
        })
    }
    practiceSong = (song, start = 0) => {
        const { keyboard } = this.state
        let notes = this.applySpeedChange(song.notes)
        let songLength = notes.length
        notes.splice(0, start)
        let chunks = []
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
            chunk.delay = notes.length > 0 ? notes[0][1] - startTime : 0
            chunks.push(chunk)
        }
        if (chunks.length === 0) return
        let firstChunk = chunks[0]
        this.nextChunkDelay = firstChunk.delay
        let secondChunk = chunks[1]
        firstChunk.notes.forEach(note => { keyboard[note[0]].status = 'toClick' })
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
    handleSpeedChanger = (value) =>{
        let changer = speedChangers.find(e => e.name === value)
        this.setState({
            speedChanger: changer
        },this.restartSong)
    }
    restartSong = () => {
        let lostReference = JSON.parse(JSON.stringify(songStore.data))
        this.stopSong()
        setTimeout(() => {
            let start = songStore.data.start
            if (songStore.data.eventType === 'practice')
                start = this.state.sliderState.position
            songStore.data = {
                ...lostReference,
                start
            }
        }, 400)
    }
    stopSong = () => {
        return new Promise(res => {
            this.songTimestamp = 0
            const { keyboard } = this.state
            keyboard.forEach(note => {
                note.status = ''
                note.delay = 200
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
    handleSliderEvent = (event) => {
        this.changeSliderState(Number(event.target.value))
    }
    changeSliderState = async (position, size = this.state.sliderState.size) => {
        this.setState({
            sliderState: {
                position,
                size
            }
        })
    }
    handleKeyboard = (event) => {
        const { keyboard } = this.state
        if (event.repeat) return
        if (document.activeElement.tagName === "INPUT") return
        let code = event.code?.replace("Key", "")
        let index = this.props.data.keyboard.getNoteFromCode(code)
        let note = keyboard[index]
        if (note) this.handleClick(note)
    }

    handleApproachClick = (note) => {
        const { approachingNotes } = this.state
        let approachingNote = approachingNotes[note.index][0]
        if (approachingNote) {
            approachingNote.clicked = true
            if(approachingNote.time < this.approachRate / 3) return "approach-correct"
        }
        return "approach-wrong"
    }
    handlePracticeClick = (note) => {
        const { keyboard, songToPractice, sliderState } = this.state
        if (songToPractice.length > 0) {
            let indexClicked = songToPractice[0]?.notes.findIndex(e => e[0] === note.index)
            if (indexClicked !== -1) {
                songToPractice[0].notes.splice(indexClicked, 1)
                if (songToPractice[0].notes.length === 0) songToPractice.shift()
                if (songToPractice.length === 0) {
                    this.stopSong()
                    songStore.data = returnStopSong()
                } else {
                    let nextChunk = songToPractice[0]
                    let nextNextChunk = songToPractice[1]
                    nextChunk.notes.forEach(note => {
                        keyboard[note[0]].status = 'toClick'
                    })
                    this.nextChunkDelay = nextChunk.delay
                    nextNextChunk?.notes.forEach(note => {
                        let keyboardNote = keyboard[note[0]]
                        keyboard[note[0]].delay = nextChunk.delay
                        if (keyboardNote.status === 'toClick') return keyboardNote.status = 'toClickAndNext'
                        keyboardNote.status = 'toClickNext'
                    })
                }
                this.setState({
                    songToPractice: songToPractice,
                    sliderState: {
                        size: sliderState.size,
                        position: sliderState.position + 1
                    }
                })
            }
        }
    }
    handleClick = (note, onlySound) => {
        const { keyboard, outgoingAnimation} = this.state
        const hasAnimation = this.props.data.hasAnimation
        keyboard[note.index].status = 'clicked'
        keyboard[note.index].delay = 200
        this.handlePracticeClick(note)
        let approachStatus = this.handleApproachClick(note)
        if(songStore.data.eventType === 'approaching'){
            keyboard[note.index].status = approachStatus
        }
        if(hasAnimation && songStore.data.eventType !=='approaching'){
            let key = Math.floor(Math.random() * 10000) + new Date().getTime()
            outgoingAnimation[note.index].push({key})
        }
        this.setState({ keyboard,
            ...(hasAnimation? outgoingAnimation : {})
        },() => {
            setTimeout(() => {
                if(!hasAnimation || songStore.data.eventType === 'approaching') return
                const {outgoingAnimation} = this.state
                outgoingAnimation[note.index].shift()
                this.setState({outgoingAnimation})
            },750)
        })
        setTimeout(() => {
            if (!['clicked','approach-wrong','approach-correct'].includes(keyboard[note.index].status)) return
            keyboard[note.index].status = ''
            this.setState({ keyboard })
        },appName === 'Sky' ? 250 : 100)
        this.props.functions.playSound(note)
    }
    render() {
        const { state, props } = this
        const { data } = props
        const { keyboard, approachingScore } = state
        let size = data.keyboardSize / 100
        if (size < 0.5) size = 0.5
        if (size > 1.5) size = 1.5
        let keyboardClass = "keyboard"
        if (keyboard.length === 15) keyboardClass += " keyboard-5"
        if (keyboard.length === 8) keyboardClass += " keyboard-4"
        return <>
            {data.hasSong &&
                <div className="upper-right">
                    {songStore.data.eventType === 'approaching' &&
                        <Score data={approachingScore} />
                    }

                    <div className="slider-wrapper">
                        <button className="song-button" onClick={() => {
                            this.stopSong()
                            songStore.data = returnStopSong()
                        }
                        }>
                            <FontAwesomeIcon icon={faStop} />
                        </button>
                        <input
                            type="range"
                            className="slider"
                            min={0}
                            onChange={this.handleSliderEvent}
                            max={state.sliderState.size}
                            value={state.sliderState.position}
                        ></input>
                        <button className="song-button" onClick={() => {
                            this.restartSong()
                        }}>
                            <FontAwesomeIcon icon={faSyncAlt} />
                        </button>
                        <select 
                            className='slider-select'
                            onChange={(e) => this.handleSpeedChanger(e.target.value)}
                            value={state.speedChanger.name}
                        >
                            <option disabled>Speed</option>
                            {speedChangers.map(e => {
                                return <option value={e.name} key={e.name}>
                                    {e.name}
                                </option>
                            })}
                        </select>
                    </div>
                </div>
            }
            <div
                className={keyboardClass}
                style={{
                    transform: `scale(${size})`,
                    marginBottom: size * 30 - 15
                }}
            >
                {keyboard.length === 0 ? <div className="loading">Loading...</div> : null}
                {keyboard.map(note => {
                    let noteImage = layoutImages[keyboard.length][note.index]
                    let noteData = {
                        ...note,
                        approachRate:this.approachRate,
                        instrument: this.props.data.keyboard.instrumentName,
                        isAnimated: songStore.data.eventType === 'approaching' ? false : this.props.data.hasAnimation
                    }
                    return <Note
                        key={note.index}
                        data={noteData}
                        approachingNotes={state.approachingNotes[note.index]}
                        outgoingAnimation={state.outgoingAnimation[note.index]}
                        handleClick={this.handleClick}
                        noteText={getNoteText(data.noteNameType, note.index, data.pitch, keyboard.length)}
                        noteImage={`./assets/icons/keys/${noteImage}.svg`}
                    />

                })}
            </div>
        </>


    }
}
function Score(props) {
    const { combo, score, correct, wrong} = props.data
    return <div className='approaching-accuracy'>
        <table>
            <tbody>
                <tr>
                    <td className='sc-2'>Accuracy</td>
                    <td className='sc-1'>{(correct / (correct + wrong - 1) * 100 ).toFixed(1)}%</td>
                </tr>
                <tr>
                    <td className='sc-2'>Score</td>
                    <td className='sc-1'>{score}</td>
                </tr>
                <tr>
                    <td className='sc-2'>Combo</td>
                    <td className='sc-1'>{combo}</td>
                </tr>
            </tbody>
        </table>
    </div>



}
function returnStopSong() {
    return {
        song: {},
        eventType: 'stop',
        start: 0
    }
}

function getNoteText(noteNameType, index, pitch, layoutLength) {
    try {
        if (noteNameType === "Note name") return keyNames[appName][pitchArr.indexOf(pitch)][index]
        if (noteNameType === "Keyboard layout") return layoutData[layoutLength].keyboardLayout[index]
        if (noteNameType === "Do Re Mi") return layoutData[layoutLength].mobileLayout[index]
    } catch (e) { }
    return ''
}
export default Keyboard



