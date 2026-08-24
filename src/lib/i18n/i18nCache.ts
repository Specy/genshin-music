import type { AppI18N, AppLanguage } from '$i18n/i18n';
import { DbInstance } from '$core/Services/Database/Database';
import { base } from '$app/paths';

export type SerializedLocale = {
  id: AppLanguage;
  version: number;
  locale: AppI18N;
};

export const I18N_VERSIONS = {
  en: 10,
  es: 10,
  zh: 10,
  id: 10,
  it: 10,
  pt: 10,
  ru: 10,
  tr: 10,
  'zh-HK': 10,
  'zh-TW': 10,
  ja: 10,
  ko: 10,
} satisfies Record<AppLanguage, number>;

class I18nCache {
  ins = DbInstance.collections.translation;

  constructor() {}

  async getLocale(id: AppLanguage): Promise<AppI18N | null> {
    try {
      const locale = await this.ins.findOne({ id });
      if (!locale) {
        const fetched = await this.fetchLocale(id);
        if (!fetched) return null;
        await this.ins.insert({
          id,
          version: I18N_VERSIONS[id],
          locale: fetched,
        });
        return fetched;
      } else {
        if (locale.version !== I18N_VERSIONS[id]) {
          const fetched = await this.fetchLocale(id);
          if (!fetched) return null;
          await this.ins.update(
            { id },
            {
              id,
              version: I18N_VERSIONS[id],
              locale: fetched,
            }
          );
          return fetched;
        }
        return locale.locale;
      }
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  async fetchLocale(id: AppLanguage): Promise<AppI18N | null> {
    return fetch(`${base}/locales/${id}.json`)
      .then((res) => res.json())
      .catch((e) => {
        console.error(e);
        return null;
      });
  }
}

export const I18nCacheInstance = new I18nCache();
