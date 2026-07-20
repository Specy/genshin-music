// Ported subset of old src/types/SettingsPropriety.ts - only the types old BaseSettings.ts
// (`SettingsCheckbox, SettingsInstrument, SettingsNumber, SettingsSelect, SettingsSlider`,
// ported in Task 6) actually imports, plus their own internal dependencies
// (`BaseSettingsProp`, `SettingsCategory`, `NameOrDescriptionKey`). Excluded (not imported by
// BaseSettings.ts, YAGNI): the `SettingsPropriety` union, `SettingsText`, and
// `SettingUpdateKey`/`SettingUpdate`/`SettingVolumeUpdate` (those three need
// `keyof typeof ComposerSettings.data` etc. from the not-yet-ported $lib/BaseSettings.ts itself -
// circular right now; port them alongside BaseSettings.ts in Task 6 if still needed then).
import type {InstrumentName} from '../types'
import type {AppI18N} from '$i18n/i18n'

export type SettingsCategory =
    'keyboard'
    | 'metronome'
    | 'layout_settings'
    | 'player_settings'
    | 'song_settings'
    | 'composer_settings'
    | 'editor_settings'
    | 'player_practice_settings'

export type NameOrDescriptionKey = keyof AppI18N['settings']['props']

interface BaseSettingsProp {
    name: NameOrDescriptionKey
    songSetting: boolean
    category: SettingsCategory
    tooltip?: NameOrDescriptionKey
}

export type SettingsInstrument = BaseSettingsProp & {
    type: 'instrument'
    volume: number
    value: InstrumentName
    options: InstrumentName[]
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
export type SettingsSlider = BaseSettingsProp & {
    type: 'slider'
    value: number
    threshold: [number, number]
    step?: number
}
export type SettingsSelect<T = string | number> = BaseSettingsProp & {
    type: 'select'
    value: T
    options: T[]
}
