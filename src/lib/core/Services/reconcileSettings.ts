// WHAT OF A STORED SETTINGS BLOB SURVIVES INTO THE RUNNING BUILD (ADR-0019).
//
// Every settings family (player, composer, zen, ...) is saved WHOLE: each setting's definition -
// its name, options, range, notes - travels to localStorage beside the value the user chose, and
// comes back on the next visit. The values are the user's; everything else is the code's, and a
// copy frozen in some earlier visit's storage is out of date the moment the code moves on. So the
// blob is reconciled against the code's definitions on EVERY load, one setting at a time:
//
// - a stored value that still fits its setting is KEPT;
// - anything else falls back to that setting's DEFAULT - a setting added since the blob was
//   written, one whose `type` changed, a value the definition no longer accepts (an option that
//   was removed, a range that narrowed);
// - a stored key the code no longer has is DROPPED.
//
// It used to be all or nothing: a `settingVersion` mismatch discarded the whole blob, so adding one
// checkbox reset every other setting the user had chosen, and a definition edit that came without
// a bump never reached anyone who had the blob already.

import type {InstrumentName} from '$core/types'
import type {SettingsPropriety} from '$core/types/SettingsPropriety'
import {normalizeStoredSettings} from '$lib/games/instrumentSettings'

/**
 * The code's settings `schema`, each setting carrying the value `stored` held for it when that
 * value still fits (see the module header for the rules). `stored` is whatever came out of
 * storage - any shape at all, since a blob can be years old or hand-edited.
 *
 * Always returns fresh objects, never the schema's own: the schema is a module-level constant
 * that callers go on to mutate (the player resets `hidePracticeMode` straight after loading), and
 * handing it out let those writes leak into the defaults themselves.
 */
export function reconcileSettings<T extends object>(schema: T, stored: unknown): T {
    const storedSettings = isRecord(stored) ? stored : {}
    const reconciled: Record<string, SettingsPropriety> = {}
    for (const [key, definition] of Object.entries(schema) as [string, SettingsPropriety][]) {
        reconciled[key] = reconcileSetting(definition, storedSettings[key])
    }
    return reconciled as T
}

function reconcileSetting(definition: SettingsPropriety, stored: unknown): SettingsPropriety {
    //a JSON copy: settings are JSON by construction (that is how they are stored), so this is
    //exactly the shape the setting will be saved in, and it shares no array with the schema
    const setting = JSON.parse(JSON.stringify(definition)) as SettingsPropriety
    //the same `type` first: a setting whose type changed keeps the key but not the meaning, and a
    //checkbox's `true` must not be read as some select's option
    if (!isRecord(stored) || stored.type !== definition.type) return setting
    const keepsValue = isValidValue(definition, stored.value)
    if (keepsValue) setting.value = stored.value as typeof setting.value
    if (setting.type === 'instrument') {
        //the instrument's volume is checked on its own: a bad volume costs the volume and not the
        //instrument the user picked, and an instrument this build lacks keeps the user's loudness
        if (typeof stored.volume === 'number' && Number.isFinite(stored.volume) && stored.volume >= 0) {
            setting.volume = stored.volume
        }
        //Instrument Settings are only ever those of the instrument they were picked for (ADR-0018),
        //so an instrument that fell back to the default takes none. Absent stays absent: readers
        //resolve a missing map to the instrument's defaults
        if (keepsValue && 'settings' in stored) {
            setting.settings = normalizeStoredSettings(setting.value, stored.settings)
        }
    }
    return setting
}

function isValidValue(definition: SettingsPropriety, value: unknown): boolean {
    switch (definition.type) {
        case 'checkbox':
            return typeof value === 'boolean'
        case 'text':
            return typeof value === 'string'
        case 'number':
        case 'slider':
            //the same bounds SettingsInput/SettingsSlider hold an edit to, so nothing the app itself
            //saved can fail this
            return typeof value === 'number'
                && Number.isFinite(value)
                && value >= definition.threshold[0]
                && value <= definition.threshold[1]
        case 'select':
            return (definition.options as readonly unknown[]).includes(value)
        case 'instrument':
            return (definition.options as readonly InstrumentName[]).includes(value as InstrumentName)
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}
