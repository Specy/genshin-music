import {Chunk, RecordedSong} from "$core/Songs/RecordedSong"
import type {ApproachingScore} from "$core/types"

interface PlayerControlsState {
    position: number
    current: number
    size: number
    end: number

}

interface PagesState {
    pages: Chunk[][]
    currentPageIndex: number
    currentChunkIndex: number
    currentPage: Chunk[]
}

class PlayerControlsStore {
    state: PlayerControlsState = $state({
        position: 0,
        current: 0,
        size: 0,
        end: 0,

    })
    pagesState: PagesState = $state({
        pages: [],
        currentPageIndex: 0,
        currentChunkIndex: 0,
        currentPage: []
    })
    score: ApproachingScore = $state({
        correct: 1,
        wrong: 1,
        score: 0,
        combo: 0
    })

    get currentChunkIndex(): number {
        return this.pagesState.currentChunkIndex
    }

    get currentChunk(): Chunk | undefined {
        return this.pagesState.currentPage[this.pagesState.currentChunkIndex]
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
        this.setScoreState({
            correct: 1,
            wrong: 1,
            score: 0,
            combo: 0
        })
    }
    increaseScore = (correct: boolean, debuff?: number) => {
        const {score} = this
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
        this.setPagesState({
            pages: clone,
            currentPageIndex: 0,
            currentChunkIndex: 0,
            currentPage: clone[0] ?? []
        })
    }
    clearPages = () => {
        this.setPagesState({
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
    setPagesState = (state: Partial<PagesState>) => {
        Object.assign(this.pagesState, state)
    }
    setPosition = (position: number) => {
        this.setState({position})
    }
    incrementCurrent = () => {
        this.setState({current: this.current + 1})
    }
    //TODO since it has been split again, consider removing this method
    incrementChunkPositionAndSetCurrent = (current?: number) => {
        const {pages, currentPageIndex} = this.pagesState
        current = current ?? this.current
        const nextChunkPosition = this.currentChunkIndex + 1
        if (nextChunkPosition >= (pages[currentPageIndex]?.length ?? 0)) {
            // QUIRK: early-returns without applying `current` when already on the last chunk of
            // the last page, unlike the other two branches below (both call setState({current})).
            // Preserved as-is, not a bug to fix.
            if (currentPageIndex === pages.length - 1) return
            this.setPagesState({
                currentPageIndex: currentPageIndex + 1,
                currentChunkIndex: 0,
                currentPage: pages[currentPageIndex + 1],
            })
            this.setState({current})
        } else {
            this.setPagesState({
                currentChunkIndex: nextChunkPosition,
            })
            this.setState({current})
        }
    }

    setCurrent = (current: number) => {
        this.setState({current})
    }
    setEnd = (end: number) => {
        this.setState({end})
    }
    setSize = (size: number) => {
        this.setState({size})
    }
}


export const playerControlsStore = new PlayerControlsStore()
