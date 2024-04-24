import {APP_NAME, APP_VERSION, IS_TAURI, UPDATE_URL} from "$config"
import {logger} from "$stores/LoggerStore"
import semverLt from 'semver/functions/lt'
import semverCoerce from 'semver/functions/coerce'
import {delay} from "./utils/Utilities"

type AppUpdateSchema = {
    version: string,
    urgentMessage?: string,
    message?: string
    tauriDestinationUrl: string,
}
type UpdateSchema = {
    Sky: AppUpdateSchema,
    Genshin: AppUpdateSchema
}

export async function checkIfneedsUpdate() {
    try {
        await delay(2000)
        const appUpdate: UpdateSchema = await fetch(UPDATE_URL).then(r => r.json())
        const currentVersion = semverCoerce(APP_VERSION)
        const latestVersion = semverCoerce(appUpdate[APP_NAME].version)
        if (currentVersion && latestVersion && semverLt(currentVersion, latestVersion)) {
            const {message, urgentMessage} = appUpdate[APP_NAME]
            if (message) {
                logger.warn(
                    `A New version of the app is available.
                        ${!IS_TAURI
                        ? "Please close the app and restart it to update. On the web you need to close all tabs with the app open."
                        : ""
                    } 
                    ${message ? `\nUpdate Message: "${message}"` : ""}
                    `.trim(), 15000)
            }
            if (urgentMessage) {
                logger.error(urgentMessage, 15000)
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
