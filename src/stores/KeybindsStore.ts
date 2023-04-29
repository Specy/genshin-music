import { APP_NAME } from "$config"
import { KeyboardProvider } from "$lib/Providers/KeyboardProvider"
import type { VsrgSongKeys } from "$lib/Songs/VsrgSong"
import cloneDeep from "lodash.clonedeep"
import { makeObservable, observable, observe } from "mobx"

const defaultShortcuts = {
    composer: {
        "Space": "toggle_play",
        "KeyA": "previous_column",
        "KeyD": "next_column",
        "KeyQ": "remove_column",
        "KeyE": "add_column",
        "ArrowUp": "previous_layer",
        "ArrowDown": "next_layer",
        "ArrowRight": "next_breakpoint",
        "ArrowLeft": "previous_breakpoint",
    },
    player: {
        "Space": "toggle_record",
        "ShiftLeft+KeyS": "stop",
        "ShiftLeft+KeyR": "restart",
        "ShiftLeft+KeyM": "toggle_menu",
        "Escape": "close_menu",
    },
    vsrg_composer: {
        "ShiftLeft+KeyW": "move_up",
        "ShiftLeft+KeyS": "move_down",
        "ShiftLeft+KeyA": "move_left",
        "ShiftLeft+KeyD": "move_right",
        "Escape": "deselect",
        "Backspace": "delete",
        "ArrowRight": "next_breakpoint",
        "ArrowLeft": "previous_breakpoint",
        "ArrowUp": "previous_track",
        "ArrowDown": "next_track",
        "Space": "toggle_play",
        "Digit1": "set_tap_hand",
        "Digit2": "set_hold_hand",
        "Digit3": "set_delete_hand",
    },
    vsrg_player: {
        "ShiftLeft+KeyR": "restart",
        "Escape": "stop",
    },
    keyboard: Object.fromEntries((APP_NAME === "Genshin"
        ? (
            "Q W E R T Y U " +
            "A S D F G H J " +
            "Z X C V B N M"
        ).split(" ")
        : (
            "Q W E R T " +
            "A S D F G " +
            "Z X C V B"
        ).split(" ")).map((key, i) => [`Key${key}`, key]))
} as const

type ValuesOf<T> = T[keyof T]
type KeysOf<T> = keyof T
type ShortcutsToMap<T> = {
    [K in keyof T]: Map<string, ValuesOf<T[K]>>
}
export type Shortcuts = ShortcutsToMap<typeof defaultShortcuts>
export type ShortcutPage = KeysOf<Shortcuts>

interface SerializedKeybinds {
    version: number
    vsrg: {
        k4: string[]
        k6: string[]
    }

    shortcuts: {
        composer: {
            [key: string]: MapValues<Shortcuts['composer']>
        }
        player: {
            [key: string]: MapValues<Shortcuts['player']>
        }
        keyboard: {
            [key: string]: MapValues<Shortcuts['keyboard']>
        }
        vsrg_composer: {
            [key: string]: MapValues<Shortcuts['vsrg_composer']>
        }
        vsrg_player: {
            [key: string]: MapValues<Shortcuts['vsrg_player']>
        }
    }
}
class KeyBinds {
    version: number = 12 //change only if breaking changes are made, creating or removing a key is not a breaking change
    @observable
    private vsrg = {
        k4: ['A', 'S', 'J', 'K'],
        k6: ['A', 'S', 'D', 'H', 'J', 'K'],
    }

    @observable
    private shortcuts: Shortcuts = Object.fromEntries(
        Object.entries(defaultShortcuts).map(([key, value]) => [key, new Map(Object.entries(value))])
    ) as Shortcuts

    constructor() {
        makeObservable(this)
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
        return this.shortcuts.keyboard
    }
    getShortcutMap<T extends ShortcutPage>(page: T) {
        return this.shortcuts[page]
    }
    setKeyboardKeybind(layoutKey: string, keybind: string) {
        const oldEntry = Array.from(this.shortcuts.keyboard.entries()).find(([key, value]) => value === layoutKey)
        if (!oldEntry) return
        const possibleExisting = this.setShortcut("keyboard", oldEntry[0], keybind)
        return possibleExisting
    }
    getKeyOfShortcut<T extends ShortcutPage>(page: T, value: MapValues<Shortcuts[T]>): string | undefined {
        return Array.from(this.shortcuts[page].entries()).find(([_, val]) => val === value)?.[0]
    }
    getShortcut<T extends ShortcutPage>(page: T, key: string | string[]): MapValues<Shortcuts[T]> | undefined {
        if (Array.isArray(key)) key = key.join("+")
        return this.shortcuts[page].get(key) as MapValues<Shortcuts[T]> | undefined
    }
    setShortcut<T extends ShortcutPage>(page: T, oldKey: string | string[], newKey: string | string[]): MapValues<Shortcuts[T]> | undefined {
        oldKey = KeyBinds.getShortcutName(oldKey)
        newKey = KeyBinds.getShortcutName(newKey)
        const oldShortcut = this.shortcuts[page].get(oldKey)
        const newKeyExists = this.shortcuts[page].get(newKey)
        if (!oldShortcut === undefined) return undefined
        if (newKeyExists !== undefined) return newKeyExists as MapValues<Shortcuts[T]> | undefined
        this.shortcuts[page].delete(oldKey)
        // @ts-ignore 
        this.shortcuts[page].set(newKey, oldShortcut as any)
        this.save()
    }
    static getShortcutName(key: string | string[]) {
        if (typeof key === "string") return key
        if (key.length === 1) return key[0]
        return key.sort().join("+")
    }
    load() {
        const data = localStorage.getItem(`${APP_NAME}_keybinds`)
        if (data) {
            const parsed = JSON.parse(data) as SerializedKeybinds
            if (parsed.version !== this.version) return
            this.vsrg = parsed.vsrg
            //.map(([key, value]) => [key, new Map(Object.entries(value))])
            for(const outer of Object.entries(parsed.shortcuts)){
                const [pageKey, pageValue] = outer as [ShortcutPage, SerializedKeybinds['shortcuts'][ShortcutPage]]
                for(const inner of Object.entries(pageValue)){
                    const [shortcutKey, shortcutValue] = inner 
                    // @ts-ignore
                    const key = this.getKeyOfShortcut(pageKey, shortcutValue)
                    if (!key){
                        console.log("Skipping keybind", pageKey, shortcutKey, shortcutValue)
                        continue
                    }
                    this.setShortcut(pageKey, key, shortcutKey)
                }
            }
        }
    }
    save() {
        localStorage.setItem(`${APP_NAME}_keybinds`, JSON.stringify(this.serialize()))
    }
    serialize(): SerializedKeybinds {
        return {
            version: this.version,
            vsrg: cloneDeep(this.vsrg),
            shortcuts: Object.fromEntries(
                Object.entries(this.shortcuts)
                    .map(([key, value]) => [key, Object.fromEntries(value)])
            ) as SerializedKeybinds['shortcuts']
        }
    }
}
export const keyBinds = new KeyBinds();

type ShortcutPressEvent<T> = {
    code: string
    event: KeyboardEvent
    shortcut: T
    isRepeat: boolean
}
export type ShortcutDisposer = () => void

export type ShortcutOptions = {
    repeat?: boolean
}

type MapValues<T> = T extends Map<infer _, infer V> ? V : never

export type ShortcutListener<T extends ShortcutPage> = (keybind: ShortcutPressEvent<MapValues<Shortcuts[T]>>) => void
export function createShortcutListener<T extends KeysOf<Shortcuts>>(page: T, id: string, callback: ShortcutListener<T>, options?: ShortcutOptions): ShortcutDisposer {
    const dispose = createKeyComboComposer(id, ({ code, event, keyCombo }) => {
        if (!options?.repeat && event.repeat) return
        const shortcut = keyBinds.getShortcut(page, keyCombo)
        if (shortcut !== undefined) callback({ code, event, shortcut, isRepeat: event.repeat })
    })
    return dispose
}

export function createKeyboardListener(id: string, callback: ShortcutListener<"keyboard">, options?: ShortcutOptions): ShortcutDisposer {
    KeyboardProvider.listen(({ code, event }) => {
        if (!options?.repeat && event.repeat) return
        const shortcut = keyBinds.getShortcut("keyboard", code)
        if (shortcut !== undefined) callback({ code, event, shortcut, isRepeat: event.repeat })

    }, { type: "keydown", id: id + "_keyboard_down" })
    return () => {
        KeyboardProvider.unregisterById(id + "_keyboard_down")
    }
}

type KeyComboListener = (data: { keyCombo: string[], event: KeyboardEvent, code: string }) => void
export function createKeyComboComposer(id: string, callback: KeyComboListener): ShortcutDisposer {
    const currentKeybinds: string[] = []
    KeyboardProvider.listen(({ code, event }) => {
        if (!currentKeybinds.includes(code)) currentKeybinds.push(code)
        callback({ keyCombo: currentKeybinds, event, code })
    }, { type: "keydown", id: id + "_down" })
    KeyboardProvider.listen(({ code }) => {
        currentKeybinds.splice(currentKeybinds.indexOf(code), 1)
    }, { type: "keyup", id: id + "_up" })
    function reset() {
        currentKeybinds.splice(0, currentKeybinds.length)
    }
    window.addEventListener("blur", reset)
    return () => {
        KeyboardProvider.unregisterById(id + "_down")
        KeyboardProvider.unregisterById(id + "_up")
        window.removeEventListener("blur", reset)
    }
}

