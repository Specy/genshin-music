import { KeyboardLetter } from "lib/Providers/KeyboardProvider/KeyboardTypes"
import { VsrgSong } from "lib/Songs/VsrgSong"
import { makeObservable, observable, observe } from "mobx"
import { ObjectFlags } from "typescript"

export type KeyboardKey = {
    key: KeyboardLetter
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
export type VsrgPlayerScore = {
    combo: number
    score: number
    perfect: number
    good: number
    bad: number
    miss: number
}
export type VsrgPlayerHitType = 'perfect' | 'good' | 'bad' | 'miss'
class VsrgPlayerStore {
    @observable keyboard: KeyboardKey[] = []
    @observable.shallow currentSong: VsrgPlayerSong = {
        song: null,
        type: 'stop'
    }
    @observable score: VsrgPlayerScore = {
        combo: 0,
        score: 0,
        perfect: 0,
        good: 0,
        bad: 0,
        miss: 0,
    }
    private keyboardListeners: VsrcPlayerKeyboardCallback[] = []
    constructor() {
        makeObservable(this)
    }
    setLayout = (layout: KeyboardLetter[]) => {
        this.keyboard.splice(0, this.keyboard.length,
            ...layout.map((key, index) => {
                return {
                    key,
                    index,
                    isPressed: false
                }
            }))
    }
    resetScore = () => {
        Object.assign(this.score, {
            score: 0,
            perfect: 0,
            good: 0,
            bad: 0,
            miss: 0,
            combo: 0
            
        })
    }
    incrementScore = (type: VsrgPlayerHitType) => {
        Object.assign(this.score, {
            [type]: this.score[type] + 1,
            combo: this.score.combo + 1,
            score: this.score.score + this.getScore(type)
        })
        if (type === 'miss') this.score.combo = 0
    }
    private getScore = (type: VsrgPlayerHitType) => {
        switch (type) {
            case 'perfect':
                return 100
            case 'good':
                return 50
            case 'bad':
                return 25
            case 'miss':
                return 0
            default:
                return 0
        }
    }
    playSong = (song: VsrgSong) => {
        this.currentSong.type = 'play'
        this.currentSong.song = song.clone()
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

export function subscribeCurrentSong(callback: (data: VsrgPlayerSong) => void) {
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