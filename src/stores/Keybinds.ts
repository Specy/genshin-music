import { APP_NAME } from "appConfig"
import { VsrgSongKeys } from "lib/Songs/VsrgSong"
import cloneDeep from "lodash.clonedeep"
import { makeObservable, observable } from "mobx"


interface SerializedKeybinds {
    version: number
    vsrg: {
        k4: string[]
        k6: string[]
        k8: string[]
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
        4: ['A', 'S', 'G', 'H'],
        6: ['A', 'S', 'D', 'G', 'H', 'J'],
        8: ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K']
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
        return this.vsrg[keyCount]
    }
    setVsrgKeybind(keyCount: VsrgSongKeys, index: number, keybind: string) {
        this.vsrg[keyCount][index] = keybind
    }
    setVsrgKeybinds(keyCount: VsrgSongKeys, keybinds: string[]) {
        this.vsrg[keyCount].splice(0, keybinds.length, ...keybinds)
    }
    getKeyboardKeybinds() {
        return this.keyboard[APP_NAME.toLowerCase() as 'sky' | 'genshin']
    }
    setKeyboardKeybinds(keybinds: string[]) {
        this.keyboard[APP_NAME.toLowerCase() as 'sky' | 'genshin'].splice(0, keybinds.length, ...keybinds)
    }
    setKeyboardKeybind(index: number, keybind: string) {
        this.keyboard[APP_NAME.toLowerCase() as 'sky' | 'genshin'][index] = keybind
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