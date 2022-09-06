import { APP_NAME, APP_VERSION, IS_TAURI, UPDATE_URL } from "$/appConfig"
import { logger } from "$stores/LoggerStore"
import semverLt from 'semver/functions/lt'
import semverCoerce from 'semver/functions/coerce'
import { delay } from "./Utilities"

type AppUpdateSchema = {
    version: string,
    shouldNotify: boolean,
    isUrgent: boolean,
    tauriDestinationUrl: string,
    message: string
}
type UpdateSchema = {
    Sky: AppUpdateSchema,
    Genshin: AppUpdateSchema
}

export async function needsUpdate() {
    try {
        await delay(2000)
        const appUpdate: UpdateSchema = await fetch(UPDATE_URL).then(r => r.json())
        const currentVersion = semverCoerce(APP_VERSION)
        const latestVersion = semverCoerce(appUpdate[APP_NAME].version)
        if (currentVersion && latestVersion && semverLt(currentVersion, latestVersion)) {
            const { shouldNotify, message } = appUpdate[APP_NAME]
            if (shouldNotify) {
                logger.warn(
                    `A New version of the app is available.
                        ${!IS_TAURI
                            ? "Please restart the app to update."
                            : ""
                        } 
                    ${message ? `Update Message: "${message}"` : ""}
                    `.trim(), 30000)
            }
        }
    } catch (e) {
        console.error(e)
    }
    /*
        try {
            const tauriUpdate = await fetch(`https://raw.githubusercontent.com/Specy/genshin-music/main/src-tauri/tauri-${APP_NAME.toLowerCase()}.update.json`)
            .then(res => res.json())
            const currentTauriVersion = await TAURI.app.getVersion()
        } catch (e) {
            console.error(e)
        }
    */

}
