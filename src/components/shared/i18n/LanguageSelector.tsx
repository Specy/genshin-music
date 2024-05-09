import {Stylable} from "$lib/utils/UtilTypes";
import {FaLanguage} from "react-icons/fa6";
import s from './i18n.module.scss'
import {capitalize} from "$lib/utils/Utilities";

interface LanguageSelector extends Stylable {
    languages: readonly string[]
    currentLanguage: string
    onChange: (language: string) => void
}


export function LanguageSelector({languages, currentLanguage, onChange, style, className}: LanguageSelector) {
    return <>
        <div
            style={style}
            className={`${className} ${s['i18n-container']}`}
        >
            <FaLanguage className={s['i18n-icon']}/>
            <select
                value={currentLanguage}
                onChange={(e) => onChange(e.target.value)}
                className={`${s['i18n-selector']}`}
            >
                {languages.map(language => {
                        const nameGenerator = new Intl.DisplayNames(language, {type: 'language'});
                        const displayName = nameGenerator.of(language) ?? language
                        return <option key={language} value={language} suppressHydrationWarning>{capitalize(displayName)}</option>
                    }
                )}
            </select>
        </div>

    </>
}

