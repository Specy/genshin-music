import { APP_NAME } from "$/Config"
import { ComposerSettings, ComposerSettingsDataType, PlayerSettings, PlayerSettingsDataType, MIDISettings, VsrgComposerSettings, VsrgComposerSettingsDataType, VsrgPlayerSettingsDataType, VsrgPlayerSettings, BaseSettings, ZenKeyboardSettings, ZenKeyboardSettingsDataType } from "$lib/BaseSettings"



class SettingsService {

    public setLastBackupWarningTime(time: number) {
        localStorage.setItem(APP_NAME + "_LastBackupWarningTime", time.toString())
    }
    public getLastBackupWarningTime() {
        const time = localStorage.getItem(APP_NAME + "_LastBackupWarningTime")
        if (time) {
            return parseInt(time)
        }
        this.setLastBackupWarningTime(Date.now())
        return -1
    }

    private getLatestSettings<T>(baseSettings: BaseSettings<T>, keyName: string) {
        const json = localStorage?.getItem(keyName)
        const result = {
            data: baseSettings.data,
            hadUpdate: false,
        }
        try {
            const storedSettings = JSON.parse(json || 'null') as BaseSettings<T>
            if (storedSettings) {
                if (storedSettings.other?.settingVersion !== baseSettings.other.settingVersion) {
                    result.data = baseSettings.data
                    result.hadUpdate = true
                    return result
                }
                result.data = storedSettings.data
            }
        } catch (e) {
            console.error(e)
        }
        return result
    }

    getComposerSettings(): ComposerSettingsDataType {
        const { data, hadUpdate } = this.getLatestSettings(ComposerSettings, APP_NAME + "_Composer_Settings")
        if (hadUpdate) {
            this.updateComposerSettings(data)
        }
        return data
    }
    getDefaultComposerSettings(): ComposerSettingsDataType {
        return ComposerSettings.data
    }

    getZenKeyboardSettings(){
        const { data, hadUpdate } = this.getLatestSettings(ZenKeyboardSettings, APP_NAME + "_ZenKeyboard_Settings")
        if (hadUpdate) {
            this.updateZenKeyboardSettings(data)
        }
        return data
    }
    getDefaultZenKeyboardSettings(){
        return ZenKeyboardSettings.data
    }

    getVsrgComposerSettings(): VsrgComposerSettingsDataType {
        const { data, hadUpdate } = this.getLatestSettings(VsrgComposerSettings, APP_NAME + "_VsrgComposer_Settings")
        if (hadUpdate) {
            this.updateVsrgComposerSettings(data)
        }
        return data
    }
    getDefaultVsrgComposerSettings(): VsrgComposerSettingsDataType {
        return VsrgComposerSettings.data
    }

    getVsrgPlayerSettings(): VsrgPlayerSettingsDataType {
        const { data, hadUpdate } = this.getLatestSettings(VsrgPlayerSettings, APP_NAME + "_VsrgPlayer_Settings")
        if (hadUpdate) {
            this.updateVsrgPlayerSettings(data)
        }
        return data
    }
    getDefaultVsrgPlayerSettings(): VsrgPlayerSettingsDataType {
        return VsrgPlayerSettings.data
    }

    getPlayerSettings(): PlayerSettingsDataType {
        const { data, hadUpdate } = this.getLatestSettings(PlayerSettings, APP_NAME + "_Player_Settings")
        if (hadUpdate) {
            this.updatePlayerSettings(data)
        }
        return data
    }
    getDefaultPlayerSettings(): PlayerSettingsDataType {
        return PlayerSettings.data
    }
    getMIDISettings() {
        try {
            const settings = JSON.parse(localStorage?.getItem(`${APP_NAME}_MIDI_Settings`) || 'null') as any
            if (settings !== null && settings.settingVersion === MIDISettings.settingVersion) {
                return settings
            } else {
                return MIDISettings
            }
        } catch (e) {
            console.error(e)
            return MIDISettings
        }
    }
    getDefaultMIDISettings() {
        return MIDISettings
    }
    updateVsrgComposerSettings(settings: VsrgComposerSettingsDataType) {
        const state = {
            other: VsrgComposerSettings.other,
            data: settings
        }
        localStorage.setItem(APP_NAME + "_VsrgComposer_Settings", JSON.stringify(state))
    }
    updateZenKeyboardSettings(settings: ZenKeyboardSettingsDataType) {
        const state = {
            other: ZenKeyboardSettings.other,
            data: settings
        }
        localStorage.setItem(APP_NAME + "_ZenKeyboard_Settings", JSON.stringify(state))
    }
    updatePlayerSettings(settings: PlayerSettingsDataType) {
        const state = {
            other: PlayerSettings.other,
            data: settings
        }
        localStorage.setItem(APP_NAME + "_Player_Settings", JSON.stringify(state))
    }

    updateComposerSettings(settings: ComposerSettingsDataType) {
        const state = {
            other: ComposerSettings.other,
            data: settings
        }
        localStorage.setItem(APP_NAME + "_Composer_Settings", JSON.stringify(state))
    }

    updateVsrgPlayerSettings(settings: VsrgPlayerSettingsDataType) {
        const state = {
            other: VsrgPlayerSettings.other,
            data: settings
        }
        localStorage.setItem(APP_NAME + "_VsrgPlayer_Settings", JSON.stringify(state))
    }

    updateMIDISettings(settings: typeof MIDISettings) {
        localStorage.setItem(`${APP_NAME}_MIDI_Settings`, JSON.stringify(settings))
    }

}


const _settingsService = new SettingsService()
export {
    _settingsService as settingsService
}