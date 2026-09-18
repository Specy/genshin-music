import {fileService} from "./FileService";
import {songService} from "./SongService";
import {settingsService} from "./SettingsService";
import {_themeService} from "./ThemeService";
import {_folderService} from "./FolderService";
import {songsStore} from "$stores/SongsStore.svelte";
import {themeStore} from "$stores/ThemeStore.svelte";
import {logsStore} from "$stores/LogsStore.svelte";
import {keyBinds} from "$stores/KeybindsStore.svelte";

export function linkServices() {
    //exposes services to the global scope to be used in the console
    try {
        //@ts-expect-error __link is a debug-only escape hatch not declared on Window
        window.__link = {
            songService,
            fileService,
            settingsService,
            themeSerivce: _themeService,
            folderService: _folderService,
            songsStore,
            themeStore,
            logsStore,
            keybindsStore: keyBinds
        }
    } catch (e) {
        console.error(e)
        return false
    }
    return true
}
