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
import type {InstrumentSettingValues} from "$lib/games/instrumentSettings"
import type {AppI18N} from '$i18n/i18n'
import type {ComposerSettings, PlayerSettings, SheetVisualizerSettings, VsrgComposerSettings, ZenKeyboardSettings} from '$core/BaseSettings'

export type SettingsCategory =
    'keyboard'
    | 'metronome'
    | 'layout_settings'
    | 'player_settings'
    | 'song_settings'
    | 'composer_settings'
    | 'editor_settings'
    | 'player_practice_settings'
    | 'sheet_visualizer_settings'

export type NameOrDescriptionKey = keyof AppI18N['settings']['props']

/**
 * A line of text shown under a setting's row, in muted text so it informs without competing with
 * the setting itself: `info` explains, `warning` cautions (the two differ by their icon).
 *
 * `when` ties the note to ONE value of the setting - a checkbox's `true`, one option of a select -
 * and leaving it out shows the note whatever the value is. A setting lists as many notes as it
 * needs, so different values can each carry their own, and two notes may share a `when`.
 *
 * Plain data on purpose, like the rest of a setting's definition: SettingsService reconciles the
 * stored blob against the code's definitions on every load (ADR-0019), so a note added or reworded
 * here reaches every user without a settingVersion bump.
 */
export type SettingsNote<T> = {
    kind: 'info' | 'warning'
    text: NameOrDescriptionKey
    when?: T
}

interface BaseSettingsProp<T> {
    name: NameOrDescriptionKey
    songSetting: boolean
    category: SettingsCategory
    tooltip?: NameOrDescriptionKey
    notes?: readonly SettingsNote<T>[]
}

export type SettingsInstrument = BaseSettingsProp<InstrumentName> & {
    type: 'instrument'
    volume: number
    value: InstrumentName
    options: InstrumentName[]
    /**
     * The free-play keyboard's own Instrument Settings (ADR-0017/0018) - its Variant, say - for
     * `value`. Optional and absent from the defaults on purpose: stored blobs from before it load
     * as-is (no settingVersion bump, which would wipe the user's settings), so every reader
     * resolves it against the instrument's declaration with a `?? {}` fallback.
     */
    settings?: InstrumentSettingValues
}
export type SettingsCheckbox = BaseSettingsProp<boolean> & {
    type: 'checkbox'
    value: boolean
}

export type SettingsNumber = BaseSettingsProp<number> & {
    type: 'number'
    value: number
    increment: number
    threshold: [number, number]
    placeholder?: string
}
export type SettingsSlider = BaseSettingsProp<number> & {
    type: 'slider'
    value: number
    threshold: [number, number]
    step?: number
}
export type SettingsSelect<T = string | number> = BaseSettingsProp<T> & {
    type: 'select'
    value: T
    options: T[]
}
export type SettingsText = BaseSettingsProp<string> & {
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
    | keyof typeof SheetVisualizerSettings.data
export type SettingUpdate = {
    key: SettingUpdateKey
    data: SettingsPropriety
}
export type SettingVolumeUpdate = {
    key: SettingUpdateKey
    value: number
}
/**
 * A free-play keyboard's Instrument Settings changed (ADR-0017/0018) - its own channel, like
 * volume, because every settings handler copies only `value` from a SettingUpdate.
 */
export type SettingInstrumentSettingsUpdate = {
    key: SettingUpdateKey
    settings: InstrumentSettingValues
}
