
import { APP_NAME, APP_VERSION } from "$config"
import { UnknownFile } from "$lib/Services/FileService"
import { _folderService } from "$lib/Services/FolderService"
import { songService } from "$lib/Services/SongService"
import { _themeService } from "$lib/Services/ThemeService"
import { Ask, WindowProtocol } from "$lib/WindowProtocol"
import { useEffect, useState} from "react"

const domains = [
    "https://specy.github.io",
    "https://genshin-music.specy.app",
    "https://sky-music.specy.app",
    "http://localhost:3000"
]
type Protocol = {
    getAppData: Ask<undefined, UnknownFile>
    getAppVersion: Ask<undefined, {
        version: string
        name: string
    }>
}

export function useRegisterWindowProtocol(target?: Window) {
    const [protocol, setProtocol] = useState<WindowProtocol<Protocol> | null>(null)
    useEffect(() => {
        const protocol = new WindowProtocol<Protocol>(domains)
        protocol.init(target)
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
        setProtocol(protocol)
        return () => protocol.dispose()
    }, [target])
    return protocol
}