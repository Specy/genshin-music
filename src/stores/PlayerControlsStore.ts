import { Chunk, RecordedSong } from "lib/Songs/RecordedSong";
import { makeObservable, observable, observe } from "mobx";
import { ApproachingScore } from "types/GeneralTypes";

interface PlayerControlsState {
    position: number
    current: number
    size: number
    end: number
    pages: Chunk[][]
    currentPageIndex: number
    currentChunkIndex: number
    currentPage: Chunk[]
}


class PlayerControlsStore {
    @observable
    state: PlayerControlsState = {
        position: 0,
        current: 0,
        size: 0,
        end: 0,
        pages: [],
        currentPageIndex: 0,
        currentChunkIndex: 0,
        currentPage: []
    }
    @observable
    score: ApproachingScore = {
        correct: 1,
        wrong: 1,
        score: 0,
        combo: 0
    }
    constructor() {
        makeObservable(this)
    }
    get currentChunkIndex(): number {
        return this.state.currentChunkIndex
    }
    get currentChunk(): Chunk | undefined {
        return this.state.currentPage[this.state.currentChunkIndex]
    }
    get position(): number {
        return this.state.position
    }
    get current(): number {
        return this.state.current
    }
    get size(): number {
        return this.state.size
    }

    get end(): number {
        return this.state.end
    }

    setSong = (song: RecordedSong) => {
        this.setState({
            size: song.notes.length,
            position: 0,
            current: 0
        })
        this.setPages([])
    }
    resetScore = () => {
        this.score = {
            correct: 1,
            wrong: 1,
            score: 0,
            combo: 0
        }
    }
    increaseScore = (correct: boolean, debuff?: number) => {
        const { score } = this
        if (correct) {
            this.setScoreState({
                correct: score.correct + 1,
                combo: score.combo + 1,
                score: score.score + score.combo * (debuff ?? 1)
            })
        } else {
            this.setScoreState({
                wrong: score.wrong + 1,
                combo: 0,   
            })
        }
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
    setState = (state: Partial<PlayerControlsState>) => {
        Object.assign(this.state, state)
    }
    setScoreState = (state: Partial<ApproachingScore>) => {
        Object.assign(this.score, state)
    }
    setPosition = (position: number) => {
        this.setState({ position })
    }
    incrementCurrent = () => {
        this.setState({ current: this.current + 1 })
    }
    incrementChunkPositionAndSetCurrent = (current?: number) => {
        const { pages, currentPageIndex } = this.state
        current = current ?? this.current
        const nextChunkPosition = this.currentChunkIndex + 1
        if (nextChunkPosition >= (pages[currentPageIndex]?.length ?? 0)) {
            if (currentPageIndex === pages.length - 1) return
            this.setState({
                currentPageIndex: currentPageIndex + 1,
                currentChunkIndex: 0,
                currentPage: pages[currentPageIndex + 1],
                current
            })
        } else {
            this.setState({
                currentChunkIndex: nextChunkPosition,
                current
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


export const playerControlsStore = new PlayerControlsStore()

