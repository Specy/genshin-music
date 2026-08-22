<script lang="ts">
  import type { ClassValue } from 'svelte/elements';
  import { AVAILABLE_LANGUAGES, setI18nLanguage, i18n, type AppLanguage } from '$i18n/i18n';
  import { t, language } from '$i18n/binding.svelte';
  import { capitalize } from '$core/utils/Utilities';
  import { LANG_PREFERENCE_KEY_NAME } from '$core/legacyConfig';
  import { logger } from '$stores/LoggerStore.svelte';

  // All three props below are optional: a bare `<LanguageSelector/>` is a
  // fully self-contained selector (AVAILABLE_LANGUAGES, the current i18n
  // language, and a pill-feedback onChange), but a caller can override any
  // of languages/currentLanguage/onChange to fully control it instead.
  const flagsMap: Record<AppLanguage, string> = {
    en: '🇬🇧',
    es: '🇪🇸',
    zh: '🇨🇳',
    'zh-HK': '🇭🇰',
    'zh-TW': '🇹🇼',
    id: '🇮🇩',
    it: '🇮🇹',
    pt: '🇧🇷',
    ru: '🇷🇺',
    tr: '🇹🇷',
    ja: '🇯🇵',
    ko: '🇰🇷',
  };

  const namesMap: Record<AppLanguage, string> = {
    en: 'English',
    es: 'Español',
    zh: '中文',
    'zh-HK': '中文（香港）',
    'zh-TW': '中文（台灣）',
    id: 'Indonesia',
    it: 'Italiano',
    pt: 'Brasileiro',
    ru: 'русский',
    tr: 'Türkçe',
    ja: '日本語',
    ko: '한국어',
  };

  function getNameOfLocale(locale: AppLanguage): string {
    // some browsers don't support Intl.DisplayNames
    try {
      if (Intl?.DisplayNames) {
        const nameGenerator = new Intl.DisplayNames(locale, { type: 'language' });
        return nameGenerator.of(locale) ?? namesMap[locale];
      }
    } catch (e) {
      console.error(e);
    }
    return namesMap[locale];
  }

  async function defaultOnChange(lang: AppLanguage) {
    logger.showPill(t('logs:changing_language'));
    const success = await setI18nLanguage(i18n, lang);
    logger.hidePill();
    if (!success) {
      logger.error(t('logs:error_changing_language'));
      return;
    }
    localStorage.setItem(LANG_PREFERENCE_KEY_NAME, lang);
  }

  let {
    languages = AVAILABLE_LANGUAGES,
    currentLanguage,
    onChange = defaultOnChange,
    style = '',
    class: cls = '',
  }: {
    languages?: readonly AppLanguage[];
    currentLanguage?: string;
    onChange?: (language: AppLanguage) => void;
    style?: string;
    class?: ClassValue;
  } = $props();

  // `language()` (not raw `i18n.language`) so this stays reactive to
  // language changes made elsewhere when no `currentLanguage` override is
  // passed.
  const resolvedCurrentLanguage = $derived(currentLanguage ?? language());

  function handleChange(e: Event) {
    onChange((e.target as HTMLSelectElement).value as AppLanguage);
  }
</script>

<select value={resolvedCurrentLanguage} onchange={handleChange} class="i18n-selector {cls}" {style}>
  {#each languages as lang (lang)}
    <option value={lang}>{flagsMap[lang]} {capitalize(getNameOfLocale(lang))}</option>
  {/each}
</select>

<style>
  .i18n-selector {
    padding: 0.5rem;
    gap: 0.2rem;
    display: flex;
    max-width: 6rem;
    padding-right: 1.2rem;
    border-radius: 0.4rem;
    min-width: unset;
    background-color: var(--primary);
    align-items: center;
    appearance: none;
    -webkit-appearance: none;
    border: none;
    color: var(--primary-text);
    font-size: 0.8rem;
  }
</style>
