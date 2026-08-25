import {APP_NAME} from "$core/legacyConfig"
import {
    type BaseSettings,
    ComposerSettings,
    type ComposerSettingsDataType,
    MIDISettings, type MidiSettingsType,
    PlayerSettings,
    type PlayerSettingsDataType,
    VsrgComposerSettings,
    type VsrgComposerSettingsDataType,
    VsrgPlayerSettings,
    type VsrgPlayerSettingsDataType,
    SheetVisualizerSettings,
    type SheetVisualizerSettingsDataType,
    ZenKeyboardSettings,
    type ZenKeyboardSettingsDataType
} from "$core/BaseSettings"
import {MIDIShortcut} from "$core/utils/Utilities"


class SettingsService {

    public setLastBackupWarningTime(time: number) {
        localStorage.setItem(APP_NAME + "_LastBackupWarningTime", time.toString())
    }

    public setLastStateEdit(time: number) {
        localStorage.setItem(APP_NAME + "_LastStateEdit", time.toString())
    }

    public getLastBackupWarningTime() {
        const time = localStorage.getItem(APP_NAME + "_LastBackupWarningTime")
        if (time) {
            return parseInt(time)
        }
        this.setLastBackupWarningTime(Date.now())
        return -1
    }

    public getLastStateEdit() {
        const time = localStorage.getItem(APP_NAME + "_LastStateEdit")
        if (time) {
            return parseInt(time)
        }
        this.setLastStateEdit(Date.now())
        return -1
    }

    //2 weeks
    public shouldShowBackupWarning(elapsedTime = 1000 * 60 * 60 * 24 * 14) {
        const time = this.getLastBackupWarningTime()
        const lastEdit = this.getLastStateEdit()
        if (time === -1 || lastEdit === -1) return false
        const timeSinceLastEdit = Date.now() - lastEdit
        const timeSinceLastBackup = Date.now() - time
        return timeSinceLastEdit > elapsedTime && timeSinceLastBackup > elapsedTime
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
        const {data, hadUpdate} = this.getLatestSettings(ComposerSettings, APP_NAME + "_Composer_Settings")
        if (hadUpdate) {
            this.updateComposerSettings(data)
        }
        return data
    }

    getDefaultComposerSettings(): ComposerSettingsDataType {
        return ComposerSettings.data
    }

    getZenKeyboardSettings() {
        const {data, hadUpdate} = this.getLatestSettings(ZenKeyboardSettings, APP_NAME + "_ZenKeyboard_Settings")
        if (hadUpdate) {
            this.updateZenKeyboardSettings(data)
        }
        return data
    }

    getDefaultZenKeyboardSettings() {
        return ZenKeyboardSettings.data
    }

    getSheetVisualizerSettings(): SheetVisualizerSettingsDataType {
        const {data, hadUpdate} = this.getLatestSettings(SheetVisualizerSettings, APP_NAME + "_SheetVisualizer_Settings")
        if (hadUpdate) {
            this.updateSheetVisualizerSettings(data)
        }
        return data
    }

    getDefaultSheetVisualizerSettings(): SheetVisualizerSettingsDataType {
        return SheetVisualizerSettings.data
    }

    getVsrgComposerSettings(): VsrgComposerSettingsDataType {
        const {data, hadUpdate} = this.getLatestSettings(VsrgComposerSettings, APP_NAME + "_VsrgComposer_Settings")
        if (hadUpdate) {
            this.updateVsrgComposerSettings(data)
        }
        return data
    }

    getDefaultVsrgComposerSettings(): VsrgComposerSettingsDataType {
        return VsrgComposerSettings.data
    }

    getVsrgPlayerSettings(): VsrgPlayerSettingsDataType {
        const {data, hadUpdate} = this.getLatestSettings(VsrgPlayerSettings, APP_NAME + "_VsrgPlayer_Settings")
        if (hadUpdate) {
            this.updateVsrgPlayerSettings(data)
        }
        return data
    }

    getDefaultVsrgPlayerSettings(): VsrgPlayerSettingsDataType {
        return VsrgPlayerSettings.data
    }

    getPlayerSettings(): PlayerSettingsDataType {
        const {data, hadUpdate} = this.getLatestSettings(PlayerSettings, APP_NAME + "_Player_Settings")
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
                return this.withCurrentMIDIShortcuts(settings)
            } else {
                return MIDISettings
            }
        } catch (e) {
            console.error(e)
            return MIDISettings
        }
    }

    /**
     * A stored blob only ever holds the shortcut list as it stood when it was written, and the setup
     * grid draws THAT array - so a shortcut added later (ADR-0013's undo/redo) would be unbindable
     * for everyone who already has one. Reconciled against the current list here instead of bumping
     * settingVersion: a version change discards the whole blob, taking every preset and every
     * already-bound key with it, which is far too much for a longer list.
     *
     * The CURRENT list decides membership and order; a stored row keeps its bound key, a new one
     * arrives unbound (-1), and a row whose name no longer exists is dropped.
     */
    private withCurrentMIDIShortcuts(settings: any) {
        const stored: any[] = Array.isArray(settings.shortcuts) ? settings.shortcuts : []
        settings.shortcuts = MIDISettings.shortcuts.map(shortcut =>
            stored.find(existing => existing?.type === shortcut.type) ?? new MIDIShortcut(shortcut.type, -1)
        )
        return settings
    }

    getDefaultMIDISettings() {
        return {...MIDISettings} as MidiSettingsType
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

    updateSheetVisualizerSettings(settings: SheetVisualizerSettingsDataType) {
        const state = {
            other: SheetVisualizerSettings.other,
            data: settings
        }
        localStorage.setItem(APP_NAME + "_SheetVisualizer_Settings", JSON.stringify(state))
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

    updateMIDISettings(settings: MidiSettingsType) {
        localStorage.setItem(`${APP_NAME}_MIDI_Settings`, JSON.stringify(settings))
    }
}


const _settingsService = new SettingsService()
export {
    _settingsService as settingsService
}