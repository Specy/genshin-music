interface BaseSettingsProp {
    name: string,
    songSetting: boolean,
}

export type SettingsPropriety = SettingsInstrument | SettingsSelect | SettingsSlider | SettingsNumber | SettingsCheckbox | SettingsText

export type SettingsInstrument = BaseSettingsProp & {
    type: 'instrument'
    volume: number
    value: string
    options: string[]
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
export type SettingsSelect = BaseSettingsProp & {
    type: 'select'
    value: string
    options: string[]
}