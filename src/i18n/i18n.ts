import i18next from 'i18next';
import {initReactI18next} from 'react-i18next';
import {i18n_en} from '$i18n/locales/en'
import {IS_DEV} from "$config";
import {I18nCacheInstance} from "$i18n/i18nCache";


export type EngI18n = typeof i18n_en

type ToStringObject<T extends Record<string, any> | string> = {
    [K in keyof T]: T[K] extends Record<string, any> ? ToStringObject<T[K]> : string
}

export type AppI18N = ToStringObject<EngI18n>
type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}
export type ValidAppI18N = DeepPartial<AppI18N>
export const defaultNS = 'translation';
declare module 'i18next' {
    interface CustomTypeOptions {
        defaultNS: typeof defaultNS;
        resources: EngI18n;
    }
}

export const AVAILABLE_LANGUAGES = [
    'en',
    'zh',
    'id'
] as const;
export type AppLanguage = typeof AVAILABLE_LANGUAGES[number];
i18next
    .use(initReactI18next)
    .init({
        debug: IS_DEV,
        pluralSeparator: '+',
        supportedLngs: AVAILABLE_LANGUAGES,
        fallbackLng: 'en',
        defaultNS,
        resources: {
            en: i18n_en
        }
    });
export const i18n = i18next;


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

