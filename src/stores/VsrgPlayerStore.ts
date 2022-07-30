import { KeyboardLetter } from "lib/Providers/KeyboardProvider/KeyboardTypes"
import { VsrgSong } from "lib/Songs/VsrgSong"
import { makeObservable, observable, observe } from "mobx"

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

class VsrgPlayerStore {
    @observable keyboard: KeyboardKey[] = []
    @observable.shallow currentSong: VsrgPlayerSong = {
        song: null,
        type: 'stop'
    }
    constructor(){
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
    }
    releaseKey = (index: number) => {
        this.keyboard[index].isPressed = false
    }
}




export const vsrgPlayerStore = new VsrgPlayerStore()

export function subscribeCurrentSong(callback: (data: VsrgPlayerSong) => void){
    const dispose = observe(vsrgPlayerStore.currentSong, () => {
        callback(vsrgPlayerStore.currentSong)
    })
    return dispose
}