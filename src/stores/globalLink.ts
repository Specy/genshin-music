import { fileService } from "$/lib/Services/FileService";
import { songService } from "$/lib/Services/SongService";
import { settingsService } from "$/lib/Services/SettingsService";
import { _themeService } from "$/lib/Services/ThemeService";
import { _folderService } from "$/lib/Services/FolderService";
import { songsStore } from "./SongsStore";
import { themeStore } from "./ThemeStore/ThemeStore";
import { logsStore } from "./LogsStore";
import { keyBinds } from "./KeybindsStore";
export function linkServices() {
    //exposes services to the global scope to be used in the console
    try {
        //@ts-ignore
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