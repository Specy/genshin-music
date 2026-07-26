// Ported subset of old src/types/SettingsPropriety.ts - originally (P2 Task 6) only the types old
// BaseSettings.ts (`SettingsCheckbox, SettingsInstrument, SettingsNumber, SettingsSelect,
// SettingsSlider`) actually imported, plus their own internal dependencies (`BaseSettingsProp`,
// `SettingsCategory`, `NameOrDescriptionKey`). `SettingsText`, the `SettingsPropriety` union, and
// `SettingUpdateKey`/`SettingUpdate`/`SettingVolumeUpdate` were deferred at the time ("port them
// alongside BaseSettings.ts in Task 6 if still needed then") - added now (Phase 4a Task 4) by the
// settings-pane family (SettingsPane/SettingsRow/SettingsInput consume all five: `SettingsText`,
// `SettingsPropriety`, `SettingUpdateKey`, `SettingUpdate`, `SettingVolumeUpdate`). Exactly like old
// SettingsPropriety.ts, `SettingUpdateKey` needs `keyof typeof ComposerSettings.data` etc. from
// $core/BaseSettings.ts, which itself imports FROM this file (SettingsCheckbox/SettingsInstrument/
// SettingsNumber/SettingsSelect/SettingsSlider) - old already used `import type` for exactly this
// reason (a type-only import + `typeof` type-query is fully erased, so it's not a runtime cycle,
// only a type-level one TypeScript resolves fine), reproduced verbatim below.
import type {InstrumentName} from '../types'
import type {AppI18N} from '$i18n/i18n'
import type {ComposerSettings, PlayerSettings, VsrgComposerSettings, ZenKeyboardSettings} from '$core/BaseSettings'

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
export type SettingsText = BaseSettingsProp & {
    type: 'text'
    value: string
    placeholder?: string
}

export type SettingsPropriety =
    SettingsInstrument
    | SettingsSelect
    | SettingsSlider
    | SettingsNumber
    | SettingsCheckbox
    | SettingsText

export type SettingUpdateKey =
    keyof typeof ComposerSettings.data
    | keyof typeof PlayerSettings.data
    | keyof typeof VsrgComposerSettings.data
    | keyof typeof ZenKeyboardSettings.data
export type SettingUpdate = {
    key: SettingUpdateKey
    data: SettingsPropriety
}
export type SettingVolumeUpdate = {
    key: SettingUpdateKey
    value: number
}
