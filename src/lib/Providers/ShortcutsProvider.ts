import { APP_NAME } from "$/Config";

export enum ComposerShortcuts {
    TogglePlayback = "TogglePlayback",
    NextColumn = "NextColumn",
    PreviousColumn = "PreviousColumn",
    RemoveColumn = "RemoveColumn",
    AddColumn = "AddColumn",
    PreviousLayer = "PreviousLayer",
    NextLayer = "NextLayer",
    NextBreakpoint = "NextBreakpoint",
    PreviousBreakpoint = "PreviousBreakpoint",
}
export enum PlayerShortcuts {
    Stop = "Stop",
    Restart = "Restart",
    ToggleRecording = "ToggleRecording",
    ToggleMenu = "ToggleMenu",
    CloseMenu = "CloseMenu",
}
export enum VsrgComposerShortcuts {
    MoveUp = "MoveUp",
    MoveDown = "MoveDown",
    MoveLeft = "MoveLeft",
    MoveRight = "MoveRight",
    Deselect = "Deselect",
    Delete = "Delete",
    NextBreakpoint = "NextBreakpoint",
    PreviousBreakpoint = "PreviousBreakpoint",
    NextTrack = "NextTrack",
    PreviousTrack = "PreviousTrack",
    TogglePlayback = "TogglePlayback",
}
type Shortcut<T> = {
    name: String;
    description: String;
    shortcut: T;
}
type ShortcutEnums = ComposerShortcuts | PlayerShortcuts | VsrgComposerShortcuts;


type ShortcutFamily<N extends String, T> = {
    name: N
    shortcuts: Map<String, Shortcut<T>>
}
type Families = "composer" | "player" | "vsrgComposer";

type ShortcutFamilies = {
    composer: ShortcutFamily<"composer", ComposerShortcuts>
    player: ShortcutFamily<"player", PlayerShortcuts>
    vsrgComposer: ShortcutFamily<"vsrgComposer", VsrgComposerShortcuts>
}
type SerializedShortcutFamily<T> = {
    name: String
    shortcuts: Array<[String, T]>
}
type SerializedShortcutFamilies = {
    composer: SerializedShortcutFamily<ComposerShortcuts>
    player: SerializedShortcutFamily<PlayerShortcuts>
    vsrgComposer: SerializedShortcutFamily<VsrgComposerShortcuts>
}
type ShortcutStorage = {
    meta: {
        version: String
    },
    families: SerializedShortcutFamilies
}
function createShortcut<T>(name: String, description: String, shortcut: T): Shortcut<T> {
    return {
        name,
        description,
        shortcut
    }
}
class ShortcutsProvider {
    meta = {
        version: "1.0.0"
    }
    families: ShortcutFamilies = {
        composer: {
            name: "composer",
            shortcuts: new Map<String, Shortcut<ComposerShortcuts>>([
                ["Space", createShortcut("Toggle Playback", "Toggle Playback", ComposerShortcuts.TogglePlayback)],
                ["D", createShortcut("Next Column", "Next Column", ComposerShortcuts.NextColumn)],
                ["A", createShortcut("Previous Column", "Previous Column", ComposerShortcuts.PreviousColumn)],
                ["Q", createShortcut("Remove Column", "Remove Column", ComposerShortcuts.RemoveColumn)],
                ["E", createShortcut("Add Column", "Add Column", ComposerShortcuts.AddColumn)],
                ["ArrowUp", createShortcut("Previous Layer", "Previous Layer", ComposerShortcuts.PreviousLayer)],
                ["ArrowDown", createShortcut("Next Layer", "Next Layer", ComposerShortcuts.NextLayer)],
                ["ArrowRight", createShortcut("Next Breakpoint", "Next Breakpoint", ComposerShortcuts.NextBreakpoint)],
                ["ArrowLeft", createShortcut("Previous Breakpoint", "Previous Breakpoint", ComposerShortcuts.PreviousBreakpoint)],

            ])
        },
        player: {
            name: "player",
            shortcuts: new Map<String, Shortcut<PlayerShortcuts>>([
                ["ShiftLeft+C", createShortcut("Toggle Recording", "Toggle Recording", PlayerShortcuts.ToggleRecording)],
                ["ShiftLeft+S", createShortcut("Stop", "Stop", PlayerShortcuts.Stop)],
                ["ShiftLeft+R", createShortcut("Restart", "Restart", PlayerShortcuts.Restart)],
                ["ShiftLeft+M", createShortcut("Toggle Menu", "Toggle Menu", PlayerShortcuts.ToggleMenu)],
                ["Escape", createShortcut("Close Menu", "Close Menu", PlayerShortcuts.CloseMenu)],
            ])
        },
        vsrgComposer: {
            name: "vsrgComposer",
            shortcuts: new Map<String, Shortcut<VsrgComposerShortcuts>>([])
        }
    }
    get(family: Families, input: String | String[]): Shortcut<ShortcutEnums> | null {
        if (Array.isArray(input)) {
            return this.get(family, input.join("+"))
        }
        return this.families[family].shortcuts.get(input) ?? null
    }
    has(family: Families, input: String | String[]): boolean {
        if (Array.isArray(input)) {
            return this.has(family, input.join("+"))
        }
        return this.families[family].shortcuts.has(input)
    }
    update(family: Families, prev: String, next: String) {
        const shortcuts = this.families[family].shortcuts
        const shortcut = shortcuts.get(prev);
        if (shortcut && !shortcuts.has(next)) {
            // @ts-ignore - correct type
            shortcuts.set(next, shortcut);
            shortcuts.delete(prev);
        }else{
            return false
        }
        this.store()
        return true
    }
    getComposer(input: String | String[]): ComposerShortcuts | null {
        return this.get("composer", input) as ComposerShortcuts | null
    }
    getPlayer(input: String | String[]): PlayerShortcuts | null {
        return this.get("player", input) as PlayerShortcuts | null
    }

    load() {
        try {
            const stored = JSON.parse(localStorage.getItem(`${APP_NAME}_shortcuts`) ?? "{}") as ShortcutStorage
            if (stored?.meta?.version === this.meta.version) {
                const families = Object.keys(this.families) as Families[]
                for (const family of families) {
                    stored.families[family]?.shortcuts.forEach(([key, value]) => {
                        const existing = this.families[family]?.shortcuts.get(key)
                        if (!existing) return
                        existing.shortcut = value
                        // @ts-ignore - correct type
                        this.families[family]?.shortcuts.set(key, existing)
                    })
                }
            }
        } catch (e) {
            console.error(e)
        }
    }
    private store() {
        const stored: ShortcutStorage = {
            meta: this.meta,
            families: {
                composer: {
                    name: "composer",
                    shortcuts: Array.from(this.families.composer.shortcuts.entries()).map(([key, value]) => [key, value.shortcut])
                },
                player: {
                    name: "player",
                    shortcuts: Array.from(this.families.player.shortcuts.entries()).map(([key, value]) => [key, value.shortcut])
                },
                vsrgComposer: {
                    name: "vsrgComposer",
                    shortcuts: Array.from(this.families.vsrgComposer.shortcuts.entries()).map(([key, value]) => [key, value.shortcut])
                }
            }
        }
        localStorage.setItem(`${APP_NAME}_shortcuts`, JSON.stringify(stored))
    }
}

export const shortcutsProvider = new ShortcutsProvider()