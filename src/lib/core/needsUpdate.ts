import {APP_NAME, APP_VERSION} from "./legacyConfig"
import {UPDATE_URL} from "./sharedConfig"
import {logger} from "$stores/LoggerStore.svelte"
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
                // old blob branched here on `!IS_TAURI` (always true - the desktop/Tauri build is
                // out of scope for this migration, spec §8) to pick between this web-close-tabs
                // copy and an empty string; the branch collapses to always-this-copy.
                logger.warn(
                    `A New version of the app is available.
                        Please close the app and restart it to update. On the web you need to close all tabs with the app open.
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
}
