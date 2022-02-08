import { observable } from "mobx";

type eventType = "play" | "practice" | "approaching" | "stop"

interface SongStoreProps{
    song: object,
    eventType: eventType,
    start: number
}

interface SongStoreData{
    data:SongStoreProps
}

class SongStoreClass{
    state:SongStoreData
    constructor(){
        this.state = observable({
            data: {
                song: {},
                eventType: 'stop',
                start: 0
            }
        })
    }
    get song():object{
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
    play = (song:object, start:number = 0) => {
        this.setState({
            song,
            start,
            eventType: 'play'
        })
    }
    practice = (song: object, start:number = 0) => {
        this.setState({
            song,
            start,
            eventType: 'practice'
        })
    }
    approaching = (song: object, start: number = 0) => {
        this.setState({
            song,
            start,
            eventType: 'approaching'
        }) 
    }
    reset = () => {
        this.setState({
            song: {},
            eventType: 'stop',
            start: 0
        })
    }
    restart = (start:number) => {
        this.setState({start})
    }
}

export const SongStore = new SongStoreClass()