<script lang="ts">
    import {AVAILABLE_LANGUAGES, setI18nLanguage, i18n, type AppLanguage} from '$i18n/i18n'
    import {t, language} from '$i18n/binding.svelte'
    import {capitalize} from '$core/utils/Utilities'
    import {LANG_PREFERENCE_KEY_NAME} from '$core/legacyConfig'
    import {logger} from '$stores/LoggerStore.svelte'

    // Old: src/components/shared/i18n/LanguageSelector.tsx, which exported TWO components:
    // `LanguageSelector` (fully controlled: languages/currentLanguage/onChange all required
    // props) and `DefaultLanguageSelector` (a thin preset wrapping it with
    // AVAILABLE_LANGUAGES/i18n.language/a setI18nLanguage+pill-feedback onChange). Folded into
    // one file here (Svelte can't export two named components per file, same constraint hit
    // repeatedly elsewhere in this migration) by making all three props optional and defaulting
    // to the old DefaultLanguageSelector's behavior - so `<LanguageSelector/>` bare is exactly
    // the old `<DefaultLanguageSelector/>`, while a caller can still override any of
    // languages/currentLanguage/onChange for full control, preserving the old dual-export API's
    // capabilities.
    const flagsMap: Record<AppLanguage, string> = {
        en: '🇬🇧',
        zh: '🇨🇳',
        'zh-HK': '🇭🇰',
        'zh-TW': '🇹🇼',
        id: '🇮🇩',
        pt: '🇧🇷',
        ru: '🇷🇺',
        tr: '🇹🇷',
        ja: '🇯🇵',
        ko: '🇰🇷',
    }

    const namesMap: Record<AppLanguage, string> = {
        en: 'English',
        zh: '中文',
        'zh-HK': '中文（香港）',
        'zh-TW': '中文（台灣）',
        id: 'Indonesia',
        pt: 'Brasileiro',
        ru: 'русский',
        tr: 'Türkçe',
        ja: '日本語',
        ko: '한국어',
    }

    function getNameOfLocale(locale: AppLanguage): string {
        // some browsers don't support Intl.DisplayNames
        try {
            if (Intl?.DisplayNames) {
                const nameGenerator = new Intl.DisplayNames(locale, {type: 'language'})
                return nameGenerator.of(locale) ?? namesMap[locale]
            }
        } catch (e) {
            console.error(e)
        }
        return namesMap[locale]
    }

    // old DefaultLanguageSelector's onChange: pill feedback around setI18nLanguage, persisting
    // the choice to LANG_PREFERENCE_KEY_NAME on success.
    async function defaultOnChange(lang: AppLanguage) {
        logger.showPill(t('logs:changing_language'))
        const success = await setI18nLanguage(i18n, lang)
        logger.hidePill()
        if (!success) {
            logger.error(t('logs:error_changing_language'))
            return
        }
        localStorage.setItem(LANG_PREFERENCE_KEY_NAME, lang)
    }

    let {
        languages = AVAILABLE_LANGUAGES,
        currentLanguage,
        onChange = defaultOnChange,
        style = '',
        className = '',
    }: {
        languages?: readonly AppLanguage[]
        currentLanguage?: string
        onChange?: (language: AppLanguage) => void
        style?: string
        className?: string
    } = $props()

    // `language()` (not raw `i18n.language`) so this stays reactive to language changes made
    // elsewhere without a prop override - same role the old `useTranslation()` hook's re-render
    // played for `i18n.language` in DefaultLanguageSelector.
    const resolvedCurrentLanguage = $derived(currentLanguage ?? language())

    function handleChange(e: Event) {
        onChange((e.target as HTMLSelectElement).value as AppLanguage)
    }
</script>

<select
    value={resolvedCurrentLanguage}
    onchange={handleChange}
    class="i18n-selector {className}"
    style={style}
>
    {#each languages as lang (lang)}
        <option value={lang}>{flagsMap[lang]} {capitalize(getNameOfLocale(lang))}</option>
    {/each}
</select>

<style>
    /* Old: src/components/shared/i18n/i18n.module.scss - a CSS Module dedicated entirely to this
       component (same as Separator.svelte's separator.module.scss), so it inlines below verbatim
       via Svelte's own scoping rather than moving into the global App.css. */
    .i18n-selector {
        padding: 0.5rem;
        gap: 0.2rem;
        display: flex;
        max-width: 8rem;
        padding-right: 1.2rem;
        border-radius: 0.4rem;
        min-width: unset;
        background-color: var(--primary);
        align-items: center;
        appearance: none;
        -webkit-appearance: none;
        border: none;
        color: var(--primary-text);
    }
</style>
