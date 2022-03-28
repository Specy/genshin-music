import { ChangeEvent, Component } from 'react'
import { observe } from 'mobx'
import { LAYOUT_IMAGES, APP_NAME, SPEED_CHANGERS, MIDI_STATUS, PitchesType } from "appConfig"
import Note from './Components/Note'
import { SongStore } from 'stores/SongStore'
import { Array2d, getNoteText, delay, clamp } from "lib/Utils/Tools"
import "./Keyboard.css"
import { getMIDISettings } from 'lib/BaseSettings'
import TopPage from './Components/TopPage'
import Analytics from 'lib/Analytics';
import LoggerStore from 'stores/LoggerStore'
import { SliderStore } from 'stores/SongSliderStore'
import { ApproachingNote, RecordedNote } from 'lib/Utils/SongClasses'
import { MIDISettings } from 'lib/BaseSettings'
import type { NoteData } from 'lib/Instrument'
import type Instrument from 'lib/Instrument'
import type { ApproachingScore, NoteNameType } from 'types/GeneralTypes'
import type { Song } from 'lib/Utils/Song'
import { MIDIEvent, MIDIListener } from 'lib/MIDIListener'

interface KeyboardProps {
    data: {
        isLoading: boolean
        keyboard: Instrument
        pitch: PitchesType
        keyboardSize: number
        noteNameType: NoteNameType
        hasSong: boolean
        hasAnimation: boolean
        approachRate: number
        keyboardYPosition: number
    }
    functions: {
        playSound: (note: NoteData) => void
        setHasSong: (override: boolean) => void
    }
}
interface KeyboardState{
    playTimestamp: number
    songToPractice: Chunk[]
    approachingNotes: ApproachingNote[][]
    outgoingAnimation: {
        key: number
    }[][]
    keyboard: NoteData[]
    approachingScore: ApproachingScore
    speedChanger: typeof SPEED_CHANGERS[number]
}
export default class Keyboard extends Component<KeyboardProps,KeyboardState> {
    state: KeyboardState
    approachRate: number
    approachingNotesList: ApproachingNote[]
    songTimestamp: number
    nextChunkDelay: number
    tickTime: number
    tickInterval: number
    mounted: boolean
    dispose: () => void

    constructor(props: KeyboardProps) {
        super(props)
        this.state = {
            playTimestamp: new Date().getTime(),
            songToPractice: [],
            approachingNotes: Array2d.from(APP_NAME === 'Sky' ? 15 : 21),
            outgoingAnimation: Array2d.from(APP_NAME === 'Sky' ? 15 : 21),
            keyboard: this.props.data.keyboard.layout.map(note => { 
                const cloned = note.clone()
                cloned.data.status = ''
                return cloned
            }),
            approachingScore: {
                correct: 1,
                wrong: 1,
                score: 0,
                combo: 0
            },
            speedChanger: SPEED_CHANGERS.find(e => e.name === 'x1') as typeof SPEED_CHANGERS[number],
        }        
        this.approachRate = 1500
        this.approachingNotesList = []
        this.songTimestamp = 0
        this.nextChunkDelay = 0
        this.dispose = () => { }
        this.tickTime = 50
        this.tickInterval = 0
        this.mounted = true
    }

    componentDidMount() {
        window.addEventListener('keydown', this.handleKeyboard)
        this.tickInterval = setInterval(this.tick, this.tickTime) as unknown as number
        this.dispose = observe(SongStore.state, async () => {
            const value = SongStore.state.data
            const song = SongStore.song
            const type = SongStore.eventType

            await this.stopSong()
            if (!this.mounted) return
            if (type === 'stop') {
                this.props.functions.setHasSong(false)
            } else {
                if (!song) return
                const lostReference = song.isComposed
                    ? song.toSong().clone()
                    : song.clone()

                lostReference.timestamp = new Date().getTime()
                const end = value.end || lostReference?.notes?.length || 0
                if (type === 'play') {
                    this.playSong(lostReference, value.start, end)
                }
                if (type === 'practice') {
                    this.practiceSong(lostReference, value.start, end)
                }
                if (type === 'approaching') {
                    this.approachingSong(lostReference, value.start, end)
                }
                this.props.functions.setHasSong(true)
                Analytics.songEvent({ type })
                SliderStore.setState({
                    size: lostReference?.notes?.length || 1,
                    position: value.start,
                    end,
                    current: value.start
                })

            }
            MIDIListener.addListener(this.handleMidi)
        })
    }
    componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKeyboard)
        MIDIListener.removeListener(this.handleMidi)
        this.dispose()
        this.songTimestamp = 0
        this.mounted = false
        clearInterval(this.tickInterval)
    }
    handleMidi = ([eventType, note, velocity]: MIDIEvent) => {
        if (!this.mounted) return
        const instrument = this.props.data.keyboard
        if (MIDI_STATUS.down === eventType && velocity !== 0) {
            const keyboardNotes = MIDIListener.settings.notes.filter(e => e.midi === note)
            keyboardNotes.forEach(keyboardNote => {
                this.handleClick(instrument.layout[keyboardNote.index])
            })
        }
    }
    approachingSong = async (song: Song, start = 0, end?: number) => {
        end = end ? end : song.notes.length
        const notes = []
        this.approachRate = this.props.data.approachRate || 1500
        const startDelay = this.approachRate
        const startOffset = song.notes[start] !== undefined ? song.notes[start][1] : 0
        for (let i = start; i < end && i < song.notes.length; i++) {
            const note = song.notes[i]
            const obj = new ApproachingNote({
                time: Math.floor((note[1] - startOffset) / this.state.speedChanger.value + startDelay),
                index: note[0]
            })
            notes.push(obj)
        }
        this.setState({
            approachingNotes: Array2d.from(APP_NAME === 'Sky' ? 15 : 21),
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
        const stateNotes = approachingNotes
        const notes = this.approachingNotesList
        notes.forEach(note => {
            note.time -= this.tickTime
        })
        let hasChanges = false
        let removed = 0
        for (let i = 0; i < notes.length; i++) {
            if (notes[i].time < this.approachRate) {
                const newNote = new ApproachingNote({
                    time: this.approachRate,
                    index: notes[i].index,
                    id: Math.floor(Math.random() * 10000)
                })
                stateNotes[notes[i].index].push(newNote)
                notes.splice(i, 1)
                i--
                hasChanges = true
            } else {
                break
            }
        }
        stateNotes.forEach(approachingNotes => {
            for (let i = 0; i < approachingNotes.length; i++) {
                const note = approachingNotes[i]
                note.time -= this.tickTime
                if (note.clicked) {
                    if (note.time < this.approachRate / 3) {
                        approachingScore.correct++
                        approachingScore.combo++
                        approachingScore.score += approachingScore.combo * speedChanger.value
                    } else {
                        approachingScore.wrong++
                        approachingScore.combo = 0
                    }
                    note.time = -1 //so that it can be removed after
                }
                if (note.time < 0) {
                    if (!note.clicked) {
                        approachingScore.wrong++
                        approachingScore.combo = 0
                    }
                    approachingNotes.splice(i, 1)
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

    playSong = async (song: Song, start = 0, end?: number) => {
        end = end ? end : song.notes.length
        this.songTimestamp = song.timestamp
        const { keyboard } = this.state
        const notes = this.applySpeedChange(song.notes)
        if (notes.length === 0 || notes.length <= start) return
        let previous = notes[start][1]
        let pastError = 0
        let previousTime = new Date().getTime()
        for (let i = start; i < end && i < song.notes.length; i++) {
            const delayTime = notes[i][1] - previous
            previous = notes[i][1]
            previousTime = new Date().getTime()
            if (delayTime > 16) await delay(delayTime - pastError)
            if (!this.mounted || this.songTimestamp !== song.timestamp) return
            this.handleClick(keyboard[notes[i][0]])
            SliderStore.setCurrent(i + 1)
            pastError = new Date().getTime() - previousTime - delayTime
        }
    }
    applySpeedChange = (notes: RecordedNote[]) => {
        return notes.map(note => {
            note[1] = note[1] / this.state.speedChanger.value
            return note
        })
    }
    practiceSong = (song: Song, start = 0, end?: number) => {
        //TODO move this to the song class
        end = end ? end : song.notes.length
        const { keyboard } = this.state
        const notes = this.applySpeedChange(song.notes).slice(start, end)
        const chunks = []
        let previousChunkDelay = 0
        for (let i = 0; notes.length > 0; i++) {
            const chunk = new Chunk(
                [notes.shift() as RecordedNote],
                0
            )
            const startTime = chunk.notes.length > 0 ? chunk.notes[0][1] : 0
            for (let j = 0; j < notes.length && j < 20; j++) {
                const difference = notes[j][1] - chunk.notes[0][1] - 50 //TODO add threshold here
                if (difference < 0) {
                    chunk.notes.push(notes.shift() as RecordedNote)
                    j--
                }
            }
            chunk.delay = previousChunkDelay
            previousChunkDelay = notes.length > 0 ? notes[0][1] - startTime : 0
            chunks.push(chunk)
        }
        if (chunks.length === 0) return
        this.nextChunkDelay = 0
        const firstChunk = chunks[0]
        firstChunk.notes.forEach(note => {
            keyboard[note[0]] = keyboard[note[0]].setState({
                status: 'toClick',
                delay: APP_NAME === 'Genshin' ? 100 : 200
            })
        })
        const secondChunk = chunks[1]
        secondChunk?.notes.forEach(note => {
            const keyboardNote = keyboard[note[0]]
            if (keyboardNote.status === 'toClick') return keyboard[note[0]] = keyboardNote.setStatus('toClickAndNext')
            keyboard[note[0]] = keyboardNote.setStatus('toClickNext')
        })
        this.props.functions.setHasSong(true)
        this.setState({
            songToPractice: chunks,
            keyboard
        })
    }
    handleSpeedChanger = (e: ChangeEvent<HTMLSelectElement>) => {
        const changer = SPEED_CHANGERS.find(el => el.name === e.target.value)
        if(!changer) return
        this.setState({
            speedChanger: changer
        }, this.restartSong)
    }
    restartSong = async (override?: number) => {
        await this.stopSong()
        if (!this.mounted) return 
        SongStore.restart((typeof override === 'number') ? override : SliderStore.position, SliderStore.end)
    }
    stopSong = (): Promise<void> => {
        return new Promise(res => {
            const { keyboard } = this.state
            this.songTimestamp = 0
            const resetNotes = keyboard.map(note => note.setState({
                status: '',
                delay: APP_NAME === 'Genshin' ? 100 : 200
            }))
            this.approachingNotesList = []
            this.setState({
                keyboard: resetNotes,
                songToPractice: [],
                approachingNotes: Array2d.from(APP_NAME === 'Sky' ? 15 : 21)
            }, res)
            this.props.functions.setHasSong(false)
        })
    }
    stopAndClear = () => {
        this.stopSong()
        SongStore.reset()
    }
    handleKeyboard = async (event: KeyboardEvent) => {
        const { keyboard } = this.state
        if (event.repeat) return
        if (document.activeElement?.tagName === "INPUT") return
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
            const code = event.code?.replace("Key", "")
            const index = this.props.data.keyboard.getNoteFromCode(code)
            if (index === null) return
            const note = keyboard[index]
            if (note) this.handleClick(note)

        }

    }

    handleApproachClick = (note: NoteData) => {
        const { approachingNotes } = this.state
        const approachingNote = approachingNotes[note.index][0]
        if (approachingNote) {
            approachingNote.clicked = true
            if (approachingNote.time < this.approachRate / 3) return "approach-correct"
        }
        return "approach-wrong"
    }
    handlePracticeClick = (note: NoteData) => {
        const { keyboard, songToPractice } = this.state
        if (songToPractice.length > 0) {
            const indexClicked = songToPractice[0]?.notes.findIndex(e => e[0] === note.index)
            if (indexClicked !== -1) {
                songToPractice[0].notes.splice(indexClicked, 1)
                if (songToPractice[0].notes.length === 0) songToPractice.shift()
                if (songToPractice.length > 0) {
                    const nextChunk = songToPractice[0]
                    const nextNextChunk = songToPractice[1]
                    nextChunk.notes.forEach(note => {
                        keyboard[note[0]] = keyboard[note[0]].setState({
                            status: 'toClick',
                            delay: nextChunk.delay
                        })
                    })
                    if (nextNextChunk) {
                        nextNextChunk?.notes.forEach(note => {
                            const keyboardNote = keyboard[note[0]]
                            if (keyboardNote.status === 'toClick') return keyboard[note[0]] = keyboardNote.setStatus('toClickAndNext')
                            keyboard[note[0]] = keyboardNote.setStatus('toClickNext')
                        })
                    }
                }
                SliderStore.incrementCurrent()
                this.setState({ songToPractice })
            }
        }
    }
    handleClick = (note: NoteData) => {
        const { keyboard, outgoingAnimation, approachingScore } = this.state
        const hasAnimation = this.props.data.hasAnimation
        const prevStatus = keyboard[note.index].status
        keyboard[note.index] = keyboard[note.index].setState({
            status: 'clicked',
            delay: APP_NAME === 'Genshin' ? 100 : 200
        })
        this.handlePracticeClick(note)
        this.props.functions.playSound(note)
        const approachStatus = this.handleApproachClick(note)
        if (SongStore.eventType === 'approaching') {
            keyboard[note.index] = keyboard[note.index].setStatus(approachStatus)
            if (approachStatus === 'approach-wrong') approachingScore.combo = 0
        }
        if (hasAnimation && SongStore.eventType !== 'approaching') {
            const key = Math.floor(Math.random() * 10000) + new Date().getTime()
            outgoingAnimation[note.index] = [...outgoingAnimation[note.index], { key }]
        }
        this.setState({
            keyboard,
            approachingScore,
            outgoingAnimation
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
            if (prevStatus === 'toClickNext') keyboard[note.index] = keyboard[note.index].setStatus(prevStatus)
            else keyboard[note.index] = keyboard[note.index].setStatus('')
            this.setState({ keyboard })
        }, APP_NAME === 'Sky' ? 200 : 100)
    }
    render() {
        const { state, props } = this
        const { data } = props
        const { keyboard, approachingScore, speedChanger } = state
        const size = clamp(data.keyboardSize / 100, 0.5, 1.5)
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
                        //@ts-ignore
                        const noteImage = LAYOUT_IMAGES[keyboard.length][note.index]
                        return <Note
                            key={note.index}
                            note={note}
                            data={{
                                approachRate: this.approachRate,
                                instrument: this.props.data.keyboard.name,
                                isAnimated: SongStore.eventType === 'approaching' ? false : data.hasAnimation
                            }}
                            approachingNotes={state.approachingNotes[note.index]}
                            outgoingAnimation={state.outgoingAnimation[note.index]}
                            fadeTime={note.data.delay}
                            handleClick={this.handleClick}
                            //@ts-ignore
                            noteText={getNoteText(data.noteNameType, note.index, data.pitch, keyboard.length)}
                            noteImage={noteImage}
                        />

                    })
                }
            </div>
        </>
    }
}

class Chunk {
    notes: RecordedNote[]
    delay: number
    constructor(notes: RecordedNote[], delay: number) {
        this.notes = notes
        this.delay = delay
    }
}