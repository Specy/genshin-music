import { i18n } from '$i18n/i18n';
import { INSTRUMENTS_DATA } from '$core/legacyConfig';

// Reactive counterpart to plain i18n.t/i18n.language - services (e.g. FileService) call those
// directly and don't need reactivity. Components should use t/language from here instead: tick is
// a $state counter bumped whenever the active language or its loaded resources change, so reading
// it first inside a template/$derived/$effect makes Svelte's runes tracking re-run the caller.
class I18nBinding {
  private version = $state(0);

  constructor() {
    const bump = () => {
      this.version++;
    };
    i18n.on('languageChanged', bump);
    i18n.on('loaded', bump);
    // i18next quirk (re-verified against the installed source): addResourceBundle(), which
    // setI18nLanguage's cache-hydration path calls, emits 'added' on the ResourceStore
    // instance (i18n.store), not on the main i18n instance - unlike 'loaded'/'languageChanged',
    // it is never forwarded to i18n.on(...). Only i18n.store.on(...) ever sees it.
    i18n.store.on('added', bump);
  }

  get tick() {
    return this.version;
  }
}

const binding = new I18nBinding();

// Exported as `typeof i18n.t` (rather than re-deriving params/return from it) so callers keep
// full key autocomplete and interpolation typing identical to i18n.t. The internal `any` is a
// narrowly scoped passthrough: `Parameters<typeof i18n.t>` resolves to i18next's last (selector-
// API) overload, which then fails every overload i18n.t is actually called with here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const t = ((key: any, options?: any) => {
  void binding.tick;
  return i18n.t(key, options);
}) as typeof i18n.t;

export function language() {
  void binding.tick;
  return i18n.language;
}

/**
 * Instrument display name: the locale's `instruments:<name>` entry when present,
 * else the instrument's own config `displayName` (ADR-0003 — a new instrument
 * folder needs zero locale edits; translators catch up later), else the raw name
 * (unknown/legacy names in song files).
 */
export function tInstrument(name: string): string {
  void binding.tick;
  const key = `instruments:${name}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- same narrowly scoped passthrough as `t` above
  if (i18n.exists(key)) return i18n.t(key as any) as string;
  return INSTRUMENTS_DATA[name]?.displayName ?? name;
}
