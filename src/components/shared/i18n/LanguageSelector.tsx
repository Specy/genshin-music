import {Stylable} from "$lib/utils/UtilTypes";
import s from './i18n.module.scss'
import {capitalize} from "$lib/utils/Utilities";
import {LANG_PREFERENCE_KEY_NAME} from "$config";
import {useTranslation} from "react-i18next";
import {AppLanguage, AVAILABLE_LANGUAGES, setI18nLanguage} from '$i18n/i18n'
import {logger} from "$stores/LoggerStore";

interface LanguageSelector extends Stylable {
    languages: readonly AppLanguage[]
    currentLanguage: string
    onChange: (language: AppLanguage) => void
}


const flagsMap = {
    'en': '🇬🇧',
    //'it': '🇮🇹',
    'zh': '🇨🇳',
    "id": '🇮🇩',
    'pt': '🇧🇷',
    'ru': '🇷🇺',
    'tr': '🇹🇷'
} satisfies Record<AppLanguage, string>
const namesMap = {
    'en': 'English',
    //'it': 'Italian',
    'zh': '中文',
    "id": 'Indonesia',
    'pt': 'Brasileiro',
    'ru': 'русский',
    'tr': 'Türkçe'
} satisfies Record<AppLanguage, string>

function getNameOfLocale(locale: AppLanguage) {
    // some browsers don't support Intl.DisplayNames
    try {
        if (Intl?.DisplayNames) {
            const nameGenerator = new Intl.DisplayNames(locale, {type: 'language'});
            return nameGenerator.of(locale) ?? namesMap[locale]
        }
    } catch (e) {}
    return namesMap[locale]
}

export function LanguageSelector({languages, currentLanguage, onChange, style, className}: LanguageSelector) {
    return <>
        <select
            value={currentLanguage}
            onChange={(e) => onChange(e.target.value as AppLanguage)}
            className={`${s['i18n-selector']}`}
        >
            {languages.map(language => {
                    const displayName = getNameOfLocale(language)
                    return <option
                        key={language}
                        value={language}
                        suppressHydrationWarning
                    >
                        {flagsMap[language]} {capitalize(displayName)}
                    </option>
                }
            )}
        </select>
    </>
}

export function DefaultLanguageSelector() {
    const {i18n, t} = useTranslation(['logs'])
    return <LanguageSelector
        languages={AVAILABLE_LANGUAGES}
        currentLanguage={i18n.language}
        onChange={async (lang) => {
            logger.showPill(t('changing_language'))
            const success = await setI18nLanguage(i18n, lang)
            logger.hidePill()
            if (!success) {
                logger.error(t('error_changing_language'))
                return
            }
            localStorage.setItem(LANG_PREFERENCE_KEY_NAME, lang)
        }}
    />
}

