import type{ INSTRUMENTS } from '$/appConfig'
import type { ComposerSettings, MainPageSettings, VsrgComposerSettings } from '$lib/BaseSettings'
interface BaseSettingsProp {
    name: string
    songSetting: boolean
    category: string
    tooltip?: string
}

export type SettingsPropriety = SettingsInstrument | SettingsSelect | SettingsSlider | SettingsNumber | SettingsCheckbox | SettingsText

export type SettingsInstrument = BaseSettingsProp & {
    type: 'instrument'
    volume: number
    value: typeof INSTRUMENTS[number]
    options: typeof INSTRUMENTS[number][]
}
export type SettingsCheckbox = BaseSettingsProp & {
    type: 'checkbox'
    value: boolean
}

export type SettingsNumber = BaseSettingsProp & {
    type: 'number'
    value: number
    increment: number
    threshold: [number, number]
    placeholder?: string
}
export type SettingsText = BaseSettingsProp & {
    type: 'text'
    value: string
    placeholder?: string
}
export type SettingsSlider = BaseSettingsProp & {
    type: 'slider'
    value: number
    threshold: [number, number]
}
export type SettingsSelect<T = string | number> = BaseSettingsProp & {
    type: 'select'
    value: T
    options: T[]
}

export type SettingUpdateKey = 
    keyof typeof ComposerSettings.data 
  | keyof typeof MainPageSettings.data 
  | keyof typeof VsrgComposerSettings.data
export type SettingUpdate = {
    key: SettingUpdateKey, 
    data: SettingsPropriety
}
export type SettingVolumeUpdate = {
    key: SettingUpdateKey
    value: number
}