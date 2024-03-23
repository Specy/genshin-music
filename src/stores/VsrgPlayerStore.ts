import {VsrgSong} from "$lib/Songs/VsrgSong"
import {makeObservable, observable, observe} from "mobx"

export type KeyboardKey = {
    key: string
    index: number
    isPressed: boolean
}
export type VsrgPlayerSongEventType = 'play' | 'stop'
export type VsrgPlayerSong = {
    song: VsrgSong | null
    type: VsrgPlayerSongEventType
}
export type VsrgKeyboardPressType = 'down' | 'up'
export type VsrcPlayerKeyboardCallback = {
    callback: (key: KeyboardKey, type: VsrgKeyboardPressType) => void,
    id: string
}
export type VsrgPlayerHitType = 'amazing' | 'perfect' | 'great' | 'good' | 'bad' | 'miss'

export type VsrgLatestScore = {
    timestamp: number
    type: VsrgPlayerHitType | ''
    combo: number
}

export type VsrgPlayerScore = {
    scoreVisible: boolean
    combo: number
    score: number
    amazing: number
    perfect: number
    great: number
    good: number
    bad: number
    miss: number
    lastScore: VsrgLatestScore
}
const baseScoreMap = {
    amazing: 300,
    perfect: 200,
    great: 100,
    good: 50,
    bad: 25,
    miss: 0
}

export type VsrgPlayerEvent = 'fpsChange'
type VsrgPlayerCallback = {
    callback: (data: VsrgPlayerEvent) => void
    id: string
}

class VsrgPlayerStore {
    @observable keyboard: KeyboardKey[] = []
    @observable.shallow currentSong: VsrgPlayerSong = {
        song: null,
        type: 'stop'
    }
    @observable score: VsrgPlayerScore = {
        scoreVisible: false,
        combo: 0,
        score: 0,

        amazing: 0,
        perfect: 0,
        great: 0,
        good: 0,
        bad: 0,
        miss: 0,
        lastScore: {
            timestamp: 0,
            type: '',
            combo: 0
        }
    }
    private listeners: VsrgPlayerCallback[] = []
    private keyboardListeners: VsrcPlayerKeyboardCallback[] = []

    constructor() {
        makeObservable(this)
    }

    setLayout = (layout: string[]) => {
        this.keyboard.splice(0, this.keyboard.length,
            ...layout.map((key, index) => {
                return {
                    key,
                    index,
                    isPressed: false
                }
            }))
    }
    addEventListener = (callback: (data: VsrgPlayerEvent) => void, id: string) => {
        this.listeners.push({
            callback,
            id
        })
    }
    emitEvent = (event: VsrgPlayerEvent) => {
        this.listeners.forEach(listener => listener.callback(event))
    }
    removeEventListener = (id: string) => {
        this.listeners = this.listeners.filter(l => l.id !== id)
    }
    resetScore = () => {
        const resetScore: VsrgPlayerScore = {
            scoreVisible: false,
            score: 0,
            amazing: 0,
            perfect: 0,
            great: 0,
            good: 0,
            bad: 0,
            miss: 0,
            combo: 0,
            lastScore: {
                timestamp: 0,
                type: '',
                combo: 0
            }
        }
        Object.assign(this.score, resetScore)
    }
    incrementScore = (type: VsrgPlayerHitType) => {
        const combo = type === 'miss' ? 0 : this.score.combo + 1
        Object.assign(this.score, {
            [type]: this.score[type] + 1,
            combo,
            score: this.score.score + this.getScore(type) * combo,
            lastScore: {
                timestamp: Date.now(),
                type,
                combo,
            }
        })
    }
    private getScore = (type: VsrgPlayerHitType) => {
        return baseScoreMap[type] ?? 0
    }
    playSong = (song: VsrgSong) => {
        this.currentSong.type = 'play'
        this.currentSong.song = song.clone()
    }
    showScore = () => {
        this.score.scoreVisible = true
    }
    stopSong = () => {
        this.currentSong.type = 'stop'
        this.currentSong.song = null
    }
    pressKey = (index: number) => {
        this.keyboard[index].isPressed = true
        this.emitKeyboardEvent(this.keyboard[index], 'down')
    }
    releaseKey = (index: number) => {
        this.keyboard[index].isPressed = false
        this.emitKeyboardEvent(this.keyboard[index], 'up')
    }
    addKeyboardListener = (listener: VsrcPlayerKeyboardCallback) => {
        this.keyboardListeners.push(listener)
    }
    removeKeyboardListener = (callback: Partial<VsrcPlayerKeyboardCallback>) => {
        const index = this.keyboardListeners.findIndex(x => x.id === callback.id || x.callback === callback.callback)
        if (index === -1) return
        this.keyboardListeners.splice(index, 1)
    }
    emitKeyboardEvent = (key: KeyboardKey, type: VsrgKeyboardPressType) => {
        this.keyboardListeners.forEach(listener => listener.callback(key, type))
    }
}


export const vsrgPlayerStore = new VsrgPlayerStore()

export function subscribeCurrentVsrgSong(callback: (data: VsrgPlayerSong) => void) {
    const dispose = observe(vsrgPlayerStore.currentSong, () => {
        callback(vsrgPlayerStore.currentSong)
    })
    return dispose
}


export function subscribeVsrgScore(callback: (data: VsrgPlayerScore) => void) {
    const dispose = observe(vsrgPlayerStore.score, () => {
        callback({...vsrgPlayerStore.score})
    })
    return dispose
}

export function subscribeVsrgLatestScore(callback: (data: VsrgLatestScore) => void) {
    const dispose = observe(vsrgPlayerStore.score, () => {
        callback({...vsrgPlayerStore.score.lastScore})
    })
    return dispose
}