import { ChangeEvent, Component } from 'react'
import { APP_NAME, SPEED_CHANGERS, MIDI_STATUS, Pitch } from "$/appConfig"
import Note from '$cmp/Player/Note'
import { playerStore } from '$stores/PlayerStore'
import { Array2d, getNoteText, delay, clamp, groupArrayEvery } from "$lib/Utilities"
import "./Keyboard.css"
import Analytics from '$lib/Analytics';
import { playerControlsStore } from '$stores/PlayerControlsStore'
import { ApproachingNote, RecordedNote } from '$lib/Songs/SongClasses'
import type { NoteData } from '$lib/Instrument'
import type Instrument from '$lib/Instrument'
import type { NoteNameType } from '$types/GeneralTypes'
import { Chunk, RecordedSong } from '$lib/Songs/RecordedSong'
import { MIDIEvent, MIDIProvider } from '$lib/Providers/MIDIProvider'
import { KeyboardEventData, KeyboardProvider } from '$lib/Providers/KeyboardProvider'
import { NoteLayer } from '$lib/Layer'
import { subscribeObeservableObject, subscribeObservableArray } from '$lib/Hooks/useObservable'

interface KeyboardPlayerProps {
    data: {
        isLoading: boolean
        instrument: Instrument
        pitch: Pitch
        keyboardSize: number
        noteNameType: NoteNameType
        hasSong: boolean
        hasAnimation: boolean
        approachRate: number
        keyboardYPosition: number
        speedChanger: typeof SPEED_CHANGERS[number]
    }
    functions: {
        playSound: (index: number, layer?: NoteLayer) => void
        setHasSong: (override: boolean) => void
    }
}
interface KeyboardPlayerState {
    playTimestamp: number
    songToPractice: Chunk[]
    approachingNotes: ApproachingNote[][]
    keyboard: NoteData[]
}
export default class KeyboardPlayer extends Component<KeyboardPlayerProps, KeyboardPlayerState> {
    state: KeyboardPlayerState
    approachRate: number
    approachingNotesList: ApproachingNote[]
    nextChunkDelay: number
    tickTime: number
    tickInterval: number
    mounted: boolean
    songTimestamp = 0
    toDispose: (() => void)[]

    constructor(props: KeyboardPlayerProps) {
        super(props)
        this.state = {
            playTimestamp: Date.now(),
            songToPractice: [],
            approachingNotes: Array2d.from(APP_NAME === 'Sky' ? 15 : 21),
            keyboard: playerStore.keyboard
        }
        this.approachRate = 1500
        this.approachingNotesList = []
        this.nextChunkDelay = 0
        this.toDispose = []
        this.tickTime = 50
        this.tickInterval = 0
        this.mounted = true
    }

    componentDidMount() {
        const id = 'keyboard-player'
        this.tickInterval = setInterval(this.tick, this.tickTime) as unknown as number
        KeyboardProvider.registerLetter('S', () => {
            if (this.props.data.hasSong) this.stopAndClear()
        }, { shift: true, id })
        KeyboardProvider.registerLetter('R', () => {
            if (!this.props.data.hasSong) return
            if (['practice', 'play', 'approaching'].includes(playerStore.eventType)) {
                this.restartSong(0)
            }
        }, { shift: true, id })
        KeyboardProvider.listen(this.handleKeyboard, { id })
        MIDIProvider.addListener(this.handleMidi)
        this.toDispose.push(subscribeObeservableObject(playerStore.state, async () => {
            const value = playerStore.state
            const song = playerStore.song
            const type = playerStore.eventType
            await this.stopSong()
            if (!this.mounted) return
            if (type === 'stop') {
                this.props.functions.setHasSong(false)
            } else {
                if (!song) return
                const lostReference = song.isComposed
                    ? song.toRecordedSong().clone()
                    : song.clone()

                lostReference.timestamp = Date.now()
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
                playerControlsStore.setState({
                    size: lostReference?.notes?.length || 1,
                    position: value.start,
                    end,
                    current: value.start
                })
            }
        }))
        this.toDispose.push(subscribeObservableArray(playerStore.keyboard, () => {
            this.setState({ keyboard: playerStore.keyboard })
        }))
    }
    componentWillUnmount() {
        MIDIProvider.removeListener(this.handleMidi)
        this.toDispose.forEach(d => d())
        KeyboardProvider.unregisterById('keyboard-player')
        this.songTimestamp = 0
        playerStore.resetSong()
        this.mounted = false
        clearInterval(this.tickInterval)
    }
    handleMidi = ([eventType, note, velocity]: MIDIEvent) => {
        if (!this.mounted) return
        const instrument = this.props.data.instrument
        if (MIDI_STATUS.down === eventType && velocity !== 0) {
            const keyboardNotes = MIDIProvider.settings.notes.filter(e => e.midi === note)
            keyboardNotes.forEach(keyboardNote => {
                this.handleClick(instrument.layout[keyboardNote.index])
            })
        }
    }
    handleKeyboard = async ({ letter, shift, event }: KeyboardEventData) => {
        if (event.repeat) return
        const { keyboard } = this.state
        if (!shift) {
            const index = this.props.data.instrument.getNoteFromCode(letter)
            if (index === null) return
            const note = keyboard[index]
            if (note) this.handleClick(note)
        }
    }
    approachingSong = async (song: RecordedSong, start = 0, end?: number) => {
        end = end ? end : song.notes.length
        const { speedChanger } = this.props.data
        const notes = []
        this.approachRate = this.props.data.approachRate || 1500
        const startDelay = this.approachRate
        const startOffset = song.notes[start] !== undefined ? song.notes[start].time : 0
        for (let i = start; i < end && i < song.notes.length; i++) {
            const note = song.notes[i]
            const obj = new ApproachingNote({
                time: Math.floor((note.time - startOffset) / speedChanger.value + startDelay),
                index: note.index
            })
            notes.push(obj)
        }
        playerControlsStore.setSong(song)
        playerControlsStore.clearPages()
        playerControlsStore.resetScore()
        this.setState({
            approachingNotes: Array2d.from(APP_NAME === 'Sky' ? 15 : 21),
        })
        this.approachingNotesList = notes
    }

    tick = () => {
        if (!this.props.data.hasSong) return
        const { approachingNotes } = this.state
        const { speedChanger } = this.props.data
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
                        playerControlsStore.increaseScore(true, speedChanger.value)
                    } else {
                        playerControlsStore.increaseScore(false)
                    }
                    note.time = -1 //so that it can be removed after
                }
                if (note.time < 0) {
                    if (!note.clicked) {
                        playerControlsStore.increaseScore(false)
                    }
                    approachingNotes.splice(i, 1)
                    i--
                    hasChanges = true
                    removed++
                }
            }
        })
        if (!hasChanges) return
        playerControlsStore.setCurrent(playerControlsStore.current + removed)
        this.setState({
            approachingNotes: stateNotes.map(arr => arr.slice()), //removes ref
        })
    }

    playSong = async (song: RecordedSong, start = 0, end?: number) => {
        end = end ? end : song.notes.length
        this.songTimestamp = song.timestamp
        const { keyboard } = this.state
        const notes = this.applySpeedChange(song.notes).slice(start, end)
        const mergedNotes = RecordedSong.mergeNotesIntoChunks(notes.map(n => n.clone()))
        playerControlsStore.setPages(groupArrayEvery(mergedNotes, 10))
        await delay(200) //add small start offset
        const startOffset = notes[0].time 
        let previous = startOffset
        let delayOffset = 0
        let startTime = Date.now()
        let chunkPlayedNotes = 0
        for (let i = 0; i < notes.length; i++) {
            const delayTime = notes[i].time - previous
            previous = notes[i].time
            if (delayTime > 16) await delay(delayTime + delayOffset)
            if (!this.mounted || this.songTimestamp !== song.timestamp) return
            this.handleClick(keyboard[notes[i].index], notes[i].layer)
            if (chunkPlayedNotes >= (playerControlsStore.currentChunk?.notes.length ?? 0)) {
                chunkPlayedNotes = 1
                playerControlsStore.incrementChunkPositionAndSetCurrent(start + i + 1)
            }else{
                chunkPlayedNotes++
                playerControlsStore.setCurrent(start + i + 1)
            }
            delayOffset = startTime + previous - startOffset - Date.now() 
        }
    }
    applySpeedChange = (notes: RecordedNote[]) => {
        const { speedChanger } = this.props.data
        return notes.map(note => {
            note.time = note.time / speedChanger.value
            return note
        })
    }

    practiceSong = (song: RecordedSong, start = 0, end?: number) => {
        //TODO move this to the song class
        end = end ? end : song.notes.length
        const { keyboard } = this.state
        const notes = this.applySpeedChange(song.notes).slice(start, end)
        const chunks = RecordedSong.mergeNotesIntoChunks(notes.map(n => n.clone()))
        if (chunks.length === 0) return
        this.nextChunkDelay = 0
        const firstChunk = chunks[0]
        firstChunk.notes.forEach(note => {
            playerStore.setNoteState(note.index, {
                status: 'toClick',
                delay: APP_NAME === 'Genshin' ? 100 : 200
            })
        })
        const secondChunk = chunks[1]
        secondChunk?.notes.forEach(note => {
            const keyboardNote = keyboard[note.index]
            if (keyboardNote.status === 'toClick') return keyboardNote.setStatus('toClickAndNext')
            keyboardNote.setStatus('toClickNext')
        })
        this.props.functions.setHasSong(true)
        playerControlsStore.setPages(groupArrayEvery(chunks, 10))
        this.setState({
            songToPractice: chunks
        })
    }

    restartSong = async (override?: number) => {
        await this.stopSong()
        if (!this.mounted) return
        playerStore.restartSong((typeof override === 'number') ? override : playerControlsStore.position, playerControlsStore.end)
    }
    stopSong = (): Promise<void> => {
        this.songTimestamp = 0
        return new Promise(res => {
            playerStore.resetKeyboardLayout()
            this.approachingNotesList = []
            this.setState({
                songToPractice: [],
                approachingNotes: Array2d.from(APP_NAME === 'Sky' ? 15 : 21)
            }, res)
            this.props.functions.setHasSong(false)
        })
    }

    stopAndClear = () => {
        this.stopSong()
        playerStore.resetSong()
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
            const clickedNoteIndex = songToPractice[0]?.notes.findIndex(e => e.index === note.index)
            if (clickedNoteIndex !== -1) {
                songToPractice[0].notes.splice(clickedNoteIndex, 1)
                if (songToPractice[0].notes.length === 0) {
                    songToPractice.shift()
                    playerControlsStore.incrementChunkPositionAndSetCurrent()
                }
                if (songToPractice.length > 0) {
                    const nextChunk = songToPractice[0]
                    const nextNextChunk = songToPractice[1]
                    nextChunk.notes.forEach(note => {
                        playerStore.setNoteState(note.index, {
                            status: 'toClick',
                            delay: nextChunk.delay
                        })
                    })
                    if (nextNextChunk) {
                        nextNextChunk?.notes.forEach(note => {
                            const keyboardNote = keyboard[note.index]
                            if (keyboardNote.status === 'toClick') return keyboardNote.setStatus('toClickAndNext')
                            keyboardNote.setStatus('toClickNext')
                        })
                    }
                }
                playerControlsStore.incrementCurrent()
                this.setState({ songToPractice })
            }
        }
    }
    handleClick = (note: NoteData, layers?: NoteLayer) => {
        const { keyboard } = this.state
        const hasAnimation = this.props.data.hasAnimation
        if (!note) return
        const prevStatus = keyboard[note.index].status
        playerStore.setNoteState(note.index, {
            status: 'clicked',
            delay: playerStore.eventType !== 'play'
                ? APP_NAME === 'Genshin' ? 100 : 200
                : 0,
            animationId: (hasAnimation && playerStore.eventType !== 'approaching') 
                ? Math.floor(Math.random() * 10000) + Date.now()
                : 0 
        })
        this.handlePracticeClick(note)
        this.props.functions.playSound(note.index, layers)
        const status = this.handleApproachClick(note)
        if (playerStore.eventType === 'approaching') {
            playerStore.setNoteState(note.index, { status })
            if (status === 'approach-wrong') playerControlsStore.increaseScore(false)
        }
        //TODO could add this to the player store
        setTimeout(() => {
            if (!['clicked', 'approach-wrong', 'approach-correct'].includes(keyboard[note.index].status)) return
            if (prevStatus === 'toClickNext') return playerStore.setNoteState(note.index, { status: prevStatus })
            playerStore.setNoteState(note.index, { status: '' })
        }, APP_NAME === 'Sky' ? 200 : 100)
    }
    render() {
        const { state, props } = this
        const { data } = props
        const { keyboard } = state
        const size = clamp(data.keyboardSize / 100, 0.5, 1.5)
        let keyboardClass = "keyboard" + (playerStore.eventType === 'play' ? " keyboard-playback" : "")
        if (keyboard.length === 15) keyboardClass += " keyboard-5"
        if (keyboard.length === 8) keyboardClass += " keyboard-4"
        const style = size !== 1 ? { transform: `scale(${size})` } : {}
        return <>

            <div
                className={keyboardClass}
                style={{
                    ...style,
                    marginBottom: `${size * 6 + (data.keyboardYPosition / 10)}vh`
                }}
            >
                {data.isLoading
                    ? <div className="loading">Loading...</div>

                    : keyboard.map(note => {
                        //@ts-ignore
                        return <Note
                            key={note.index}
                            note={note}
                            data={{
                                approachRate: this.approachRate,
                                instrument: this.props.data.instrument.name,
                            }}
                            approachingNotes={state.approachingNotes[note.index]}
                            handleClick={this.handleClick}
                            //@ts-ignore
                            noteText={getNoteText(data.noteNameType, note.index, data.pitch, keyboard.length)}
                        />

                    })
                }
            </div>
        </>
    }
}

