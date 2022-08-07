import { Chunk, RecordedSong } from "lib/Songs/RecordedSong";
import { observable, observe } from "mobx";

interface PlayerTopStoreProps {
    position: number
    current: number
    size: number
    end: number
    pages: Chunk[][]
    currentPageIndex: number
    currentChunkIndex: number
    currentPage: Chunk[]
}
interface PlayerTopStoreData {
    data: PlayerTopStoreProps
}
interface Song {
    notes: Array<any>,
}
class PlayerTopStore {
    state: PlayerTopStoreData
    constructor() {
        this.state = observable({
            data: {
                position: 0,
                current: 0,
                size: 0,
                end: 0,
                pages: [],
                currentPageIndex: 0,
                currentChunkIndex: 0,
                currentPage: []
            }
        })
    }
    get currentChunkIndex(): number {
        return this.state.data.currentChunkIndex
    }
    get currentChunk(): Chunk | undefined {
        return this.state.data.currentPage[this.state.data.currentChunkIndex]
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

    get end(): number {
        return this.state.data.end
    }

    setSong = (song: RecordedSong) => {
        this.setState({
            size: song.notes.length,
            position: 0,
            current: 0
        })
        this.setPages([])
    }
    setPages = (pages: Chunk[][]) => {
        const clone = pages.map(p => p.map(c => c.clone()))
        this.setState({
            pages: clone,
            currentPageIndex: 0,
            currentChunkIndex: 0,
            currentPage: clone[0] ?? []
        })
    }
    clearPages = () => {
        this.setState({
            pages: [],
            currentPageIndex: 0,
            currentChunkIndex: 0,
            currentPage: []
        })
    }
    setState = (state: Partial<PlayerTopStoreProps>) => {
        this.state.data = { ...this.state.data, ...state }
    }
    setPosition = (position: number) => {
        this.setState({ position })
    }
    incrementCurrent = () => {
        this.setState({ current: this.current + 1 })
    }
    incrementChunkPosition = (override?: number) => {
        const { pages, currentPageIndex } = this.state.data
        const nextChunkPosition = override ?? this.currentChunkIndex + 1
        if (nextChunkPosition >= (pages[currentPageIndex]?.length ?? 0)) {
            if (currentPageIndex === pages.length - 1) return
            this.setState({
                currentPageIndex: currentPageIndex + 1,
                currentChunkIndex: 0,
                currentPage: pages[currentPageIndex + 1]
            })
        } else {
            this.setState({
                currentChunkIndex: nextChunkPosition
            })
        }
    }

    setCurrent = (current: number) => {
        this.setState({ current })
    }
    setEnd = (end: number) => {
        this.setState({ end })
    }
    setSize = (size: number) => {
        this.setState({ size })
    }
}


export const playerTopStore = new PlayerTopStore()
export function subscribePlayerTopStore(callback: (data: PlayerTopStoreProps) => void) {
    const dispose = observe(playerTopStore.state, () => {
        callback({ ...playerTopStore.state.data })
    })
    callback({ ...playerTopStore.state.data })
    return dispose
}