
import { APP_NAME, APP_VERSION } from "$config"
import { UnknownFile, fileService } from "$lib/Services/FileService"
import { _folderService } from "$lib/Services/FolderService"
import { songService } from "$lib/Services/SongService"
import { _themeService } from "$lib/Services/ThemeService"
import { Ask, WindowProtocol } from "$lib/WindowProtocol"

const domains = [
    "https://specy.github.io",
    "https://genshin-music.specy.app",
    "https://sky-music.specy.app",
    "http://localhost:3000",
    "https://beta.genshin-music.specy.app",
    "https://beta.sky-music.specy.app",
]
type Protocol = {
    getAppData: Ask<undefined, UnknownFile>
    getAppVersion: Ask<undefined, {
        version: string
        name: string
    }>
    isFirstVisit: Ask<undefined, boolean>
    importData: Ask<UnknownFile, void>
}

export const protocol = new WindowProtocol<Protocol>(domains)

let hasSetup = false

export async function setupProtocol(){
    if(hasSetup) return console.log("protocol already setup")
    //connect to parent window
    console.log("setup window protocol to:", window.parent)
    protocol.registerAskHandler("getAppData", async () => {
        const folders = await _folderService.getFolders()
        const songs = await songService.getSongs()
        const themes = await _themeService.getThemes()
        return [...folders, ...songs, ...themes]
    })
    protocol.registerAskHandler("getAppVersion", async () => {
        return {
            version: APP_VERSION,
            name: APP_NAME
        }
    })
    protocol.registerAskHandler("isFirstVisit", async () => {
        return localStorage.getItem(APP_NAME + "_First_Visit") === null
    })
    protocol.registerAskHandler("importData", async (data) => {
        await fileService.importAndLog(data)
    })
    hasSetup = true
    await protocol.init(window.parent)
}

