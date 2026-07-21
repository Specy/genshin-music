import i18next from 'i18next'
import {i18n_en} from '$i18n/locales/en'
import {IS_DEV} from '$core/legacyConfig'
import {I18nCacheInstance} from '$i18n/i18nCache'


export type EngI18n = typeof i18n_en

// old i18n.ts used `Record<string, any>` here (twice); swapped for `Record<string, unknown>` -
// type-level only (erased at compile time, zero runtime/emit difference) and behaviorally
// identical for this recursive check: a nested-namespace object's values are all assignable to
// `unknown` just as they were to `any` (so it still recurses), while a leaf string never
// structurally matches an index-signature type regardless of the value type parameter (so it
// still bottoms out at `string`). Done to keep this port lint-clean under this repo's
// `@typescript-eslint/no-explicit-any` (verified with `npm run check`/`check:sky` unchanged at
// 0 errors both games after the swap).
type ToStringObject<T extends Record<string, unknown> | string> = {
    [K in keyof T]: T[K] extends Record<string, unknown> ? ToStringObject<T[K]> : string
}

export type AppI18N = ToStringObject<EngI18n>
type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}
export type ValidAppI18N = DeepPartial<AppI18N>
export const defaultNS = 'translation'
declare module 'i18next' {
    interface CustomTypeOptions {
        defaultNS: typeof defaultNS
        resources: EngI18n
    }
}

export const AVAILABLE_LANGUAGES = [
    'en',
    'zh',
    'zh-HK',
    'zh-TW',
    'id',
    'pt',
    'ru',
    'tr',
    'ja',
    'ko',
] as const
export type AppLanguage = typeof AVAILABLE_LANGUAGES[number]

// old i18n.ts did `i18next.use(initReactI18next).init({...})` on the default i18next singleton
// (not createInstance() - there was only ever one instance). react-i18next is a Svelte port, so
// the plugin is dropped; init() is called directly on the same default singleton, otherwise
// identical (i18next docs: `.init()` works standalone with no `.use()` plugins for core-only
// usage - see "Initialize i18next with Basic Usage").
i18next.init({
    debug: IS_DEV,
    pluralSeparator: '+',
    supportedLngs: AVAILABLE_LANGUAGES,
    fallbackLng: 'en',
    defaultNS,
    resources: {
        en: i18n_en
    }
})
export const i18n = i18next

// old i18n.ts also exported DEFAULT_ENG_KEYBOARD_MAP (a KeyboardEvent.code -> English-key-label
// map), used as the fallback in $lib/providers/KeyboardProvider's getTextOfCode() whenever
// navigator.keyboard.getLayoutMap() hasn't resolved (or the Keyboard API is unavailable) -
// restored verbatim below now that KeyboardProvider is ported (Phase 4a Task 1); old's second
// consumer, $lib/audio/Instrument.ts, landed as $lib/audio/Instrument.svelte.ts in Phase 4a Task 2
// (see its getNoteText's "Keyboard layout" branch, line 133) and is wired correctly.
export const DEFAULT_ENG_KEYBOARD_MAP = {
    "KeyE": "E",
    "KeyD": "D",
    "KeyU": "U",
    "Minus": "-",
    "KeyH": "H",
    "KeyZ": "Z",
    "Equal": "=",
    "KeyP": "P",
    "Semicolon": ";",
    "BracketRight": "]",
    "Slash": "/",
    "BracketLeft": "[",
    "KeyL": "L",
    "Digit8": "8",
    "KeyW": "W",
    "KeyS": "S",
    "Digit5": "5",
    "Digit9": "9",
    "KeyO": "O",
    "Period": ".",
    "Digit6": "6",
    "KeyV": "V",
    "Digit3": "3",
    "Backquote": "`",
    "KeyG": "G",
    "KeyJ": "J",
    "KeyQ": "Q",
    "Digit1": "1",
    "KeyT": "T",
    "KeyY": "Y",
    "Quote": "'",
    "IntlBackslash": "\\",
    "Backslash": "\\",
    "KeyK": "K",
    "KeyF": "F",
    "KeyI": "I",
    "KeyR": "R",
    "KeyX": "X",
    "KeyA": "A",
    "Digit2": "2",
    "Digit7": "7",
    "KeyM": "M",
    "Digit4": "4",
    "Digit0": "0",
    "KeyN": "N",
    "KeyB": "B",
    "KeyC": "C",
    "Comma": ","
} as Record<string, string>

export function isLanguageLoaded(lang: AppLanguage) {
    return i18next.getDataByLanguage(lang) !== undefined
}

export async function setI18nLanguage(i18nInstance: typeof i18n, lang: AppLanguage) {
    if (isLanguageLoaded(lang)) {
        i18nInstance.changeLanguage(lang)
        return true
    } else {
        const locale = await I18nCacheInstance.getLocale(lang)
        if (!locale) return false
        for (const key in locale) {
            i18next.addResourceBundle(lang, key, locale[key as keyof AppI18N])
        }
        i18nInstance.changeLanguage(lang)
        return true
    }
}
