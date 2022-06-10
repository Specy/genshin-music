import { ComposedSong } from "lib/Songs/ComposedSong";
import { RecordedSong } from "lib/Songs/RecordedSong";
import { observable } from "mobx";

type eventType = "play" | "practice" | "approaching" | "stop"
type SongTypes = RecordedSong | ComposedSong | null
type SongTypesNonNull = RecordedSong | ComposedSong
type SongStoreProps = {
    song: SongTypes,
    eventType: eventType,
    start: number,
    end: number,
    restarted: boolean
}

interface PlayerStoreState{
    data:SongStoreProps | SongStoreProps & {
        song: null
        eventType: 'stop'
    }
}

class PlayerStoreClass{
    state:PlayerStoreState
    constructor(){
        this.state = observable({
            data: {
                song: null,
                eventType: 'stop',
                restarted: false,
                end: 0,
                start: 0
            }
        })
    }
    get song():RecordedSong | ComposedSong | null{
        return this.state.data.song
    }
    get eventType(): eventType{
        return this.state.data.eventType
    }
    get start(): number{
        return this.state.data.start
    }
    get data(): SongStoreProps{
        return this.state.data
    }
    setState = (state: Partial<SongStoreProps>) => {
        this.state.data = {...this.state.data, ...state}
    }
    play = (song:SongTypesNonNull, start:number = 0, end?: number) => {
        this.setState({
            song,
            start,
            eventType: 'play',
            end 
        })
    }
    practice = (song: SongTypesNonNull, start:number = 0, end: number) => {
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
    restart = (start:number,end:number) => {
        this.setState({start,end})
    }
}

export const PlayerStore = new PlayerStoreClass()