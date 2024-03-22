import {APP_NAME, APP_VERSION} from "$config"
import {fileService, UnknownFile} from "$lib/Services/FileService"
import {_folderService} from "$lib/Services/FolderService"
import {songService} from "$lib/Services/SongService"
import {_themeService} from "$lib/Services/ThemeService"
import {Ask, WindowProtocol} from "$lib/WindowProtocol"

const domains = [
    "https://specy.github.io",
    "https://genshin-music.specy.app",
    "https://sky-music.specy.app",
    "https://beta.genshin-music.specy.app",
    "https://beta.sky-music.specy.app",
    ...(process.env.NODE_ENV === "development" ? ["http://localhost:3000"] : [])
]
type Protocol = {
    getAppData: Ask<undefined, UnknownFile>
    getAppVersion: Ask<undefined, {
        version: string
        name: string
    }>
    importData: Ask<UnknownFile, void>
}

export const protocol = new WindowProtocol<Protocol>(domains)

let hasSetup = false

export async function setupProtocol(){
    if(hasSetup) return console.log("protocol already setup")
    //connect to parent window
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
    protocol.registerAskHandler("importData", async (data) => {
        await fileService.importAndLog(data)
    })
    hasSetup = true
    await protocol.init()
}

