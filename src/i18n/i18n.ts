import i18next from 'i18next';
import {initReactI18next} from 'react-i18next';
import {i18n_en} from '$i18n/locales/en'
import {i18n_it} from "$i18n/locales/it";
import {i18n_test} from "$i18n/locales/test/locale-test";
import {IS_DEV} from "$config";
import {i18n_zh} from "$i18n/locales/zh";

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

export const AVAILABLE_LANGUAGES = ['en', 'zh'] as const;
export type AppLanguage = typeof AVAILABLE_LANGUAGES[number];
i18next
    .use(initReactI18next)
    .init({
        debug: IS_DEV,
        pluralSeparator: '+',
        fallbackLng: AVAILABLE_LANGUAGES, //TODO not sure exactly how this needs to be set up to load all languages
        defaultNS,
        resources: {
            en: i18n_en,
            //it: i18n_it,
            zh: i18n_zh,
        } satisfies Record<AppLanguage, ValidAppI18N>,
    });
export const i18n = i18next;
