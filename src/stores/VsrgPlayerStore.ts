import { KeyboardLetter } from "lib/Providers/KeyboardProvider/KeyboardTypes"
import { VsrgSong } from "lib/Songs/VsrgSong"
import { makeObservable, observable } from "mobx"

export type KeyboardKey = {
    key: KeyboardLetter
    index: number
    isPressed: boolean
}
type VsrgPlayerSong = {
    song: VsrgSong
}

class VsrgPlayerStore {
    @observable keyboard: KeyboardKey[] = []
    @observable.shallow currentSong: VsrgPlayerSong = {
        song: new VsrgSong('')
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
        this.currentSong.song = song
    }
    pressKey = (index: number) => {
        this.keyboard[index].isPressed = true
    }
    releaseKey = (index: number) => {
        this.keyboard[index].isPressed = false
    }
}

export const vsrgPlayerStore = new VsrgPlayerStore()