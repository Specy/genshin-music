import { ComposedSong } from "lib/Songs/ComposedSong";
import { RecordedSong } from "lib/Songs/RecordedSong";
import { makeObservable, observable, observe } from "mobx";

type eventType = "play" | "practice" | "approaching" | "stop"
type SongTypes = RecordedSong | ComposedSong | null
type SongTypesNonNull = RecordedSong | ComposedSong
type PlayerStoreState = {
    song: SongTypes,
    eventType: eventType,
    start: number,
    end: number,
    restarted: boolean
}

class PlayerStore {
    @observable
    state: PlayerStoreState = {
        song: null,
        eventType: 'stop',
        restarted: false,
        end: 0,
        start: 0
    }
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

    setState = (state: Partial<PlayerStoreState>) => {
        Object.assign(this.state, state)
    }
    play = (song: SongTypesNonNull, start: number = 0, end?: number) => {
        this.setState({
            song,
            start,
            eventType: 'play',
            end
        })
    }
    practice = (song: SongTypesNonNull, start: number = 0, end: number) => {
        this.setState({
            song,
            start,
            eventType: 'practice',
            end
        })
    }
    approaching = (song: SongTypesNonNull, start: number = 0, end: number) => {
        this.setState({
            song,
            start,
            eventType: 'approaching',
            end
        })
    }
    reset = () => {
        this.setState({
            song: null,
            eventType: 'stop',
            start: 0,
            end: 0
        })
    }
    restart = (start: number, end: number) => {
        this.setState({ start, end })
    }
}

export const playerStore = new PlayerStore()