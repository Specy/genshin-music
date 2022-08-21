import { APP_NAME } from "$/appConfig"
import { VsrgSongKeys } from "$lib/Songs/VsrgSong"
import cloneDeep from "lodash.clonedeep"
import { makeObservable, observable } from "mobx"


interface SerializedKeybinds {
    version: number
    vsrg: {
        k4: string[]
        k6: string[]
    }
    keyboard: {
        sky: string[],
        genshin: string[]
    }
}

class KeyBinds {
    version: number = 1
    @observable
    private vsrg = {
        k4: ['A', 'S', 'J', 'K'],
        k6: ['A', 'S', 'D', 'H', 'J', 'K'],
    }
    @observable
    private keyboard = {
        genshin: (
            "Q W E R T Y U " +
            "A S D F G H J " +
            "Z X C V B N M"
        ).split(" "),
        sky: (
            "Q W E R T " +
            "A S D F G " +
            "Z X C V B")
            .split(" "),
    }
    constructor() {
        makeObservable(this)
        this.load()
    }

    getVsrgKeybinds(keyCount: VsrgSongKeys) {
        return this.vsrg[`k${keyCount}`]
    }
    setVsrgKeybind(keyCount: VsrgSongKeys, index: number, keybind: string) {
        this.vsrg[`k${keyCount}`][index] = keybind
        this.save()
    }
    setVsrgKeybinds(keyCount: VsrgSongKeys, keybinds: string[]) {
        this.vsrg[`k${keyCount}`].splice(0, keybinds.length, ...keybinds)
        this.save()
    }
    getKeyboardKeybinds() {
        return this.keyboard[APP_NAME.toLowerCase() as 'sky' | 'genshin']
    }
    setKeyboardKeybinds(keybinds: string[]) {
        this.keyboard[APP_NAME.toLowerCase() as 'sky' | 'genshin'].splice(0, keybinds.length, ...keybinds)
        this.save()
    }
    setKeyboardKeybind(index: number, keybind: string) {
        this.keyboard[APP_NAME.toLowerCase() as 'sky' | 'genshin'][index] = keybind
        this.save()
    }
    load() {
        const data = localStorage.getItem(`${APP_NAME}_keybinds`)
        if (data) {
            const parsed = JSON.parse(data)
            if (parsed.version !== this.version) return
            this.vsrg = parsed.vsrg
            this.keyboard = parsed.keyboard
        }
    }
    save() {
        localStorage.setItem(`${APP_NAME}_keybinds`, JSON.stringify(this.serialize()))
    }
    serialize(): SerializedKeybinds {
        return {
            version: this.version,
            vsrg: cloneDeep(this.vsrg),
            keyboard: cloneDeep(this.keyboard)
        }
    }
}


export const keyBinds = new KeyBinds();