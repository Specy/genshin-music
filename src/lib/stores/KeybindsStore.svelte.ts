import {APP_NAME} from '$core/legacyConfig'
import {game} from '$game'
import type {VsrgSongKeys} from '$core/Songs/VsrgSong'
import cloneDeep from 'lodash.clonedeep'
import {SvelteMap} from 'svelte/reactivity'

export type Shortcut<T extends string> = {
    name: T
    holdable: boolean
    description?: string
}

function createShortcut<T extends string>(name: T, isHoldable: boolean, description?: string): Shortcut<T> {
    return {name, holdable: isHoldable, description} as const
}

const defaultShortcuts = {
    composer: {
        "Space": createShortcut("toggle_play", false, "toggle_play_description"),
        "KeyA": createShortcut("previous_column", true, "previous_column_description"),
        "KeyD": createShortcut("next_column", true, "next_column_description"),
        "KeyQ": createShortcut("remove_column", true, "remove_column_description"),
        "KeyE": createShortcut("add_column", true, "add_column_description"),
        "ArrowUp": createShortcut("previous_layer", true, "previous_layer_description"),
        "ArrowDown": createShortcut("next_layer", true, "next_layer_description"),
        "ArrowRight": createShortcut("next_breakpoint", true, "next_breakpoint_description"),
        "ArrowLeft": createShortcut("previous_breakpoint", true, "previous_breakpoint_description"),
    },
    player: {
        "Space": createShortcut("toggle_record", false, "toggle_record_description"),
        "ShiftLeft+KeyS": createShortcut("stop", false, "stop_description"),
        "ShiftLeft+KeyR": createShortcut("restart", false, "restart_description"),
        "ShiftLeft+KeyM": createShortcut("toggle_menu", false, "toggle_menu_description"),
        "Escape": createShortcut("close_menu", false, "close_menu_description"),
    },
    vsrg_composer: {
        "ShiftLeft+KeyW": createShortcut("move_up", true, "move_up_description"),
        "ShiftLeft+KeyS": createShortcut("move_down", true, "move_down_description"),
        "ShiftLeft+KeyA": createShortcut("move_left", true, "move_left_description"),
        "ShiftLeft+KeyD": createShortcut("move_right", true, "move_right_description"),
        "Escape": createShortcut("deselect", false, "deselect_description"),
        "Backspace": createShortcut("delete", false, "delete_description"),
        "ArrowRight": createShortcut("next_breakpoint", true, "next_breakpoint_description"),
        "ArrowLeft": createShortcut("previous_breakpoint", true, "previous_breakpoint_description"),
        "ArrowUp": createShortcut("previous_track", true, "previous_track_description"),
        "ArrowDown": createShortcut("next_track", true, "next_track_description"),
        "Space": createShortcut("toggle_play", false, "toggle_play_description"),
        "Digit1": createShortcut("set_tap_hand", false, "set_tap_hand_description"),
        "Digit2": createShortcut("set_hold_hand", false, "set_hold_hand_description"),
        "Digit3": createShortcut("set_delete_hand", false, "set_delete_hand_description"),
    },
    vsrg_player: {
        "ShiftLeft+KeyR": createShortcut("restart", false, "restart_description"),
        "Escape": createShortcut("stop", false, "stop_description"),
    },
    // old: Object.fromEntries((APP_NAME === "Genshin" ? [21-key row] : [15-key row]).map(...)) —
    // the two hardcoded rows are now game.layouts.defaultKeyboardKeys (P3 Task 2; stores are
    // UI-tier and read $game directly). Each game module's own defaultKeyboardKeys literal is
    // already commented "KeybindsStore.ts:56 ... Genshin/Sky branch (21/15 keys)" and was
    // verified equal to this old ternary's output when written (P2 GameDefinition audit).
    keyboard: Object.fromEntries(game.layouts.defaultKeyboardKeys.map(key => [`Key${key}`, createShortcut(key, false)]))
} as const  satisfies Record<string, Record<string, Shortcut<string>>>

type ValuesOf<T> = T[keyof T]
type KeysOf<T> = keyof T
type ShortcutsToMap<T> = {
    [K in keyof T]: Map<string, ValuesOf<T[K]>>
}
export type Shortcuts = ShortcutsToMap<typeof defaultShortcuts>
//extract all the name: string values from the shortcuts
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
    version: number = 13 //change only if breaking changes are made, creating or removing a key is not a breaking change
    private vsrg = $state({
        k4: ['A', 'S', 'J', 'K'],
        k6: ['A', 'S', 'D', 'H', 'J', 'K'],
    })

    private shortcuts: Shortcuts = $state(Object.fromEntries(
        Object.entries(defaultShortcuts)
            .map(([key, value]) => [key, new SvelteMap(Object.entries(value))])
    ) as unknown as Shortcuts)

    private reverseShortcuts: Record<string, Map<string, string>>

    constructor() {
        this.reverseShortcuts = this.getReverseShortcuts(this.shortcuts)
    }


    private getReverseShortcuts(of: Shortcuts) {
        const entries = Object.entries(of)
            .map(([key, value]) => {
                return [key, new Map([...value.entries()].map(([k, v]) => [v.name, k]))]
            })
        return Object.fromEntries(entries)
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
        const oldEntry = Array.from(this.shortcuts.keyboard.entries()).find(entry => entry[1].name === layoutKey)
        if (!oldEntry) return
        const possibleExisting = this.setShortcut("keyboard", oldEntry[0], keybind)
        return possibleExisting
    }

    getKeyOfShortcut<T extends ShortcutPage>(page: T, value: string): string | undefined {
        return this.reverseShortcuts[page].get(value)
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
        //TODO this was !oldShortcut === undefined ???
        if (oldShortcut === undefined || oldShortcut === null) return undefined
        if (newKeyExists !== undefined) return newKeyExists as MapValues<Shortcuts[T]> | undefined
        this.shortcuts[page].delete(oldKey)
        this.shortcuts[page].set(newKey, oldShortcut)
        // @ts-expect-error oldShortcut?.name is the value-union's `name` field, not provably a
        // key of this specific page's reverse map from a generic T - runtime-correct (mirrors
        // getReverseShortcuts' own construction), narrowing isn't expressible here
        this.reverseShortcuts[page].set(oldShortcut?.name, newKey)
        this.save()
    }

    static getShortcutName(key: string | string[]) {
        if (typeof key === "string") return key
        if (key.length === 1) return key[0]
        return key.sort().join("+")
    }

    load() {
        if (typeof window === 'undefined') return
        try {
            const data = localStorage.getItem(`${APP_NAME}_keybinds`)
            if (data) {
                const parsed = JSON.parse(data) as SerializedKeybinds
                if (parsed.version !== this.version) return
                this.vsrg = parsed.vsrg
                //.map(([key, value]) => [key, new Map(Object.entries(value))])
                for (const outer of Object.entries(parsed.shortcuts)) {
                    const [pageKey, pageValue] = outer as [ShortcutPage, SerializedKeybinds['shortcuts'][ShortcutPage]]
                    for (const inner of Object.entries(pageValue)) {
                        const [shortcutKey, shortcutValue] = inner
                        const key = this.getKeyOfShortcut(pageKey, shortcutValue.name)
                        if (!key) {
                            console.warn("Skipping keybind", pageKey, shortcutKey, shortcutValue)
                            continue
                        }
                        this.setShortcut(pageKey, key, shortcutKey)
                    }
                }
            }
        } catch (e) {
            console.error(e)
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

// Phase 4: KeyboardProvider-dependent listener factories (createShortcutListener,
// createKeyboardListener, createKeyComboComposer) and their supporting types
// (ShortcutDisposer, ShortcutOptions, ShortcutPressEvent, ShortcutListener, KeyComboListener)
// are deferred until $core/Providers/KeyboardProvider is ported. See old
// src/stores/KeybindsStore.ts (bottom half, after the `keyBinds` export) for the reference
// implementation.

// old: `T extends Map<infer _, infer V> ? V : never` - the unused `infer _` trips
// @typescript-eslint/no-unused-vars now that eslint parses .svelte.ts; T's key is already
// constrained to `string` above, so matching against the literal type is equivalent and needs
// no inferred (and discarded) key type parameter.
type MapValues<T extends Map<string, Shortcut<string>>> = T extends Map<string, infer V> ? V : never
