// old: src/lib/Hooks/useWindowProtocol.ts (50 lines) - the Protocol type + `protocol` singleton +
// `setupProtocol`, minimal-diff port. Renamed from "useWindowProtocol" since nothing here is a
// React hook anymore (no useEffect/useState) - just a module-level singleton + setup function,
// same relocation rationale as every other Providers/*.ts file this migration. Import swaps only:
// `$config` -> `$core/legacyConfig`; `$lib/Services/*` -> `$core/Services/*`; `$lib/WindowProtocol`
// -> `./WindowProtocol` (same new directory). `process.env.NODE_ENV === "development"` -> `IS_DEV`
// (the already-established `$core/legacyConfig` replacement, see i18n.ts's identical swap).
//
// `domains` is byte-exact vs old, INCLUDING the localhost dev entry - this is the WindowProtocol's
// `validDomains` allowlist (which incoming postMessage origins are trusted), a different list from
// `game.display.transferOrigins` (the /transfer page's own id-derived, env-independent OUTGOING
// dropdown list - GameDefinition data, no localhost entry, see genshin/index.ts's comment). The
// P2-era transferOrigins judgment note (progress.md) flagged this exact reconciliation: the two
// lists serve different purposes and both are correct as their own old blobs defined them.
import {APP_NAME, APP_VERSION, IS_DEV} from "$core/legacyConfig"
import {fileService, type UnknownFile} from "$core/Services/FileService"
import {_folderService} from "$core/Services/FolderService"
import {songService} from "$core/Services/SongService"
import {_themeService} from "$core/Services/ThemeService"
import {type Ask, WindowProtocol} from "./WindowProtocol"

const domains = [
    "https://specy.github.io",
    "https://genshin-music.specy.app",
    "https://sky-music.specy.app",
    "https://beta.genshin-music.specy.app",
    "https://beta.sky-music.specy.app",
    ...(IS_DEV ? ["http://localhost:3000"] : [])
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

export async function setupProtocol() {
    if (hasSetup) return console.log("protocol already setup")
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
