import i18next from 'i18next';
import { i18n_en } from '$i18n/locales/en';
import { IS_DEV } from '$core/legacyConfig';
import { I18nCacheInstance } from '$i18n/i18nCache';

export type EngI18n = typeof i18n_en;

// Recurses via structural assignability to `unknown` - a nested-namespace object is still
// assignable to it (so the branch recurses) while a leaf string never matches the index-signature
// branch (so it bottoms out at `string`).
type ToStringObject<T extends Record<string, unknown> | string> = {
  [K in keyof T]: T[K] extends Record<string, unknown> ? ToStringObject<T[K]> : string;
};

export type AppI18N = ToStringObject<EngI18n>;
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
export type ValidAppI18N = DeepPartial<AppI18N>;
export const defaultNS = 'translation';
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: EngI18n;
  }
}

export const AVAILABLE_LANGUAGES = [
  'en',
  'es',
  'zh',
  'zh-HK',
  'zh-TW',
  'id',
  'it',
  'pt',
  'ru',
  'tr',
  'ja',
  'ko',
] as const;
export type AppLanguage = (typeof AVAILABLE_LANGUAGES)[number];

const IS_TEST = import.meta.env.MODE === 'test' || Boolean(import.meta.env.VITEST);

// No .use() plugins needed - i18next's init() works standalone for core-only usage.
i18next.init({
  debug: IS_DEV && !IS_TEST,
  pluralSeparator: '+',
  supportedLngs: AVAILABLE_LANGUAGES,
  fallbackLng: 'en',
  defaultNS,
  // DOUBLE-ESCAPING, OFF. i18next HTML-escapes every interpolated value by default, on the
  // assumption that its output is about to be assigned to innerHTML. Nothing here does that:
  // every translated string in this app is rendered as Svelte TEXT, which escapes on its own, so
  // the entities i18next produced survived to the screen literally - a song called
  // "Wanderer / Bad Data" reached the backup page's error toast as "Wanderer &#x2F; Bad Data",
  // and the same went for any name holding & < > " ' or /.
  // SAFE BECAUSE THE ESCAPING DID NOT MOVE, it stopped happening TWICE: Svelte's own escaping is
  // what stands between an interpolated name and the DOM. The invariant that keeps it that way is
  // that no `{@html}` in this repo renders a translated string - there is no `{@html}` in this
  // repo at all - so adding one over `t(...)` is what would make this line matter.
  interpolation: {
    escapeValue: false,
  },
  resources: {
    en: i18n_en,
  },
});
export const i18n = i18next;

// KeyboardEvent.code -> English-key-label fallback map, used by KeyboardProvider.getTextOfCode()
// and Instrument.svelte.ts's getNoteText() "Keyboard layout" branch whenever the Keyboard API's
// layout map hasn't resolved (or is unavailable).
export const DEFAULT_ENG_KEYBOARD_MAP = {
  KeyE: 'E',
  KeyD: 'D',
  KeyU: 'U',
  Minus: '-',
  KeyH: 'H',
  KeyZ: 'Z',
  Equal: '=',
  KeyP: 'P',
  Semicolon: ';',
  BracketRight: ']',
  Slash: '/',
  BracketLeft: '[',
  KeyL: 'L',
  Digit8: '8',
  KeyW: 'W',
  KeyS: 'S',
  Digit5: '5',
  Digit9: '9',
  KeyO: 'O',
  Period: '.',
  Digit6: '6',
  KeyV: 'V',
  Digit3: '3',
  Backquote: '`',
  KeyG: 'G',
  KeyJ: 'J',
  KeyQ: 'Q',
  Digit1: '1',
  KeyT: 'T',
  KeyY: 'Y',
  Quote: "'",
  IntlBackslash: '\\',
  Backslash: '\\',
  KeyK: 'K',
  KeyF: 'F',
  KeyI: 'I',
  KeyR: 'R',
  KeyX: 'X',
  KeyA: 'A',
  Digit2: '2',
  Digit7: '7',
  KeyM: 'M',
  Digit4: '4',
  Digit0: '0',
  KeyN: 'N',
  KeyB: 'B',
  KeyC: 'C',
  Comma: ',',
} as Record<string, string>;

export function isLanguageLoaded(lang: AppLanguage) {
  return i18next.getDataByLanguage(lang) !== undefined;
}

export async function setI18nLanguage(i18nInstance: typeof i18n, lang: AppLanguage) {
  if (isLanguageLoaded(lang)) {
    i18nInstance.changeLanguage(lang);
    return true;
  } else {
    const locale = await I18nCacheInstance.getLocale(lang);
    if (!locale) return false;
    for (const key in locale) {
      i18next.addResourceBundle(lang, key, locale[key as keyof AppI18N]);
    }
    i18nInstance.changeLanguage(lang);
    return true;
  }
}
