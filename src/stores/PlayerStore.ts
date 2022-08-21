import { APP_NAME } from "$/appConfig";
import { NoteData, NoteDataState } from "$lib/Instrument";
import { ComposedSong } from "$lib/Songs/ComposedSong";
import { RecordedSong } from "$lib/Songs/RecordedSong";
import { makeObservable, observable } from "mobx";

type eventType = "play" | "practice" | "approaching" | "stop"
type SongTypes = RecordedSong | ComposedSong | null
type SongTypesNonNull = RecordedSong | ComposedSong
type PlayerStoreState = {
    song: SongTypes,
    playId: number,
    eventType: eventType,
    start: number,
    end: number,
}

class PlayerStore {
    @observable
    state: PlayerStoreState = {
        song: null,
        playId: 0,
        eventType: 'stop',
        start: 0,
        end: 0
    }
    @observable
    keyboard: NoteData[] = []
    constructor() {
        makeObservable(this)
    }
    get song(): RecordedSong | ComposedSong | null {
        return this.state.song
    }
    get eventType(): eventType {
        return this.state.eventType
    }
    get start(): number {
        return this.state.start
    }
    setKeyboardLayout = (keyboard: NoteData[]) => { 
        this.keyboard.splice(0, this.keyboard.length, ...keyboard)
    }
    resetKeyboardLayout = () => {
        this.keyboard.forEach(note => note.setState({
            status: '',
            delay: APP_NAME === 'Genshin' ? 100 : 200
        }))
    }
    resetOutgoingAnimation = () => {
        this.keyboard.forEach(n => n.setState({animationId: 0}))
    }
    setNoteState = (index: number, state: Partial<NoteDataState>) => {
        this.keyboard[index].setState(state)
    }
    setState = (state: Partial<PlayerStoreState>) => {
        Object.assign(this.state, state)
    }
    play = (song: SongTypesNonNull, start: number = 0, end?: number) => {
        this.setState({
            song,
            start,
            eventType: 'play',
            end,
            playId: this.state.playId + 1
        })
    }
    practice = (song: SongTypesNonNull, start: number = 0, end: number) => {
        this.setState({
            song,
            start,
            eventType: 'practice',
            end,
            playId: this.state.playId + 1

        })
    }
    approaching = (song: SongTypesNonNull, start: number = 0, end: number) => {
        this.setState({
            song,
            start,
            eventType: 'approaching',
            end,
            playId: this.state.playId + 1

        })
    }
    resetSong = () => {
        this.setState({
            song: null,
            eventType: 'stop',
            start: 0,
            end: 0,
            playId: 0
        })
    }
    restartSong = (start: number, end: number) => {
        this.setState({ 
            start, 
            end,
            playId: this.state.playId + 1
        })
    }
}

export const playerStore = new PlayerStore()