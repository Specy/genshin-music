import {Stylable} from "$lib/utils/UtilTypes";
import s from './i18n.module.scss'
import {capitalize} from "$lib/utils/Utilities";
import {LANG_PREFERENCE_KEY_NAME} from "$config";
import {useTranslation} from "react-i18next";
import {AppLanguages} from '$i18n/i18n'
import {useMemo} from "react";

interface LanguageSelector extends Stylable {
    languages: readonly AppLanguages[]
    currentLanguage: string
    onChange: (language: string) => void
}

const flagsMap = {
    'en': '🇬🇧',
    'it': '🇮🇹',
    'zh': '🇨🇳',
} satisfies Record<AppLanguages, string>


export function LanguageSelector({languages, currentLanguage, onChange, style, className}: LanguageSelector) {
    return <>
        <select
            value={currentLanguage}
            onChange={(e) => onChange(e.target.value)}
            className={`${s['i18n-selector']}`}
        >
            {languages.map(language => {
                    const nameGenerator = new Intl.DisplayNames(language, {type: 'language'});
                    const displayName = nameGenerator.of(language) ?? language
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
    const {i18n} = useTranslation()
    const langs = useMemo(() => {
        return [...i18n.languages].sort() as AppLanguages[]
    }, [i18n.languages])
    return <LanguageSelector
        languages={langs}
        currentLanguage={i18n.language}
        onChange={(lang) => {
            localStorage.setItem(LANG_PREFERENCE_KEY_NAME, lang)
            i18n.changeLanguage(lang)
        }}
    />
}

