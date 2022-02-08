import { observable } from "mobx";

interface SongSliderStoreProps {
    position: number,
    current: number,
    size: number,
}
interface SongSliderStoreData {
    data: SongSliderStoreProps
}
interface Song {
    notes: Array<any>,
}
class SongSliderStore {
    state: SongSliderStoreData
    constructor() {
        this.state = observable({
            data: {
                position: 0,
                current: 0,
                size: 0
            }
        })
    }
    get position(): number {
        return this.state.data.position
    }
    get current(): number {
        return this.state.data.current
    }

    get size(): number {
        return this.state.data.size
    }

    setSong = (song: Song) => {
        this.setState({
            size: song.notes.length,
            position: 0,
            current: 0
        })
    }

    setState = (state: Partial<SongSliderStoreProps>) => {
        this.state.data = { ...this.state.data, ...state }
    }
    setPosition = (position: number) => {
        this.setState({ position })
    }
    incrementCurrent = () => {
        this.setState({ current: this.current + 1 })
    }
    setCurrent = (current: number) => {
        this.setState({ current })
    }
    setSize = (size: number) => {
        this.setState({ size })
    }
}


export const SliderStore = new SongSliderStore()