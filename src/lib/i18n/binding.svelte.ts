import {i18n} from '$i18n/i18n'

// Reactive counterpart to plain `i18n.t`/`i18n.language` - services (e.g. FileService) call those
// directly and don't need reactivity. Components should use `t`/`language` from here instead:
// `tick` is a $state counter bumped whenever the active language or its loaded resources change,
// so reading it first inside a template/$derived/$effect makes Svelte's runes tracking re-run
// the caller exactly like the old `useTranslation()` hook's re-render did.
class I18nBinding {
    private version = $state(0)

    constructor() {
        const bump = () => {
            this.version++
        }
        i18n.on('languageChanged', bump)
        i18n.on('loaded', bump)
        // i18next quirk, verified against the installed v26 source (node_modules/i18next/dist/esm/i18next.js)
        // and typings: addResourceBundle() - which setI18nLanguage's cache-hydration path calls -
        // emits 'added' on the ResourceStore instance (i18n.store), not on the main i18n instance.
        // Unlike 'loaded'/'languageChanged' (forwarded via backendConnector/translator wildcard
        // listeners), 'added'/'removed' are never forwarded to `i18n.on(...)` - only `i18n.store.on(...)`
        // sees them (i18next.on()'s own TypeScript overloads confirm this: 'added' isn't among them).
        i18n.store.on('added', bump)
    }

    get tick() {
        return this.version
    }
}

const binding = new I18nBinding()

// Exported as `typeof i18n.t` (rather than re-deriving params/return from it) so callers keep
// full key autocomplete and interpolation typing identical to `i18n.t`. `Parameters<typeof i18n.t>`
// was tried for the implementation's own param types instead of `any` below, but it resolves to
// i18next's *last* overload - the `unknown`-keyed selector-API one - which then fails to satisfy
// any overload when forwarded into `i18n.t(key, options)`, and fails the closing cast too
// (confirmed via `npm run check`: "may be a mistake because neither type sufficiently overlaps").
// `any` here is the standard, narrowly-scoped pattern for a passthrough wrapper around an
// overloaded function: only the exported type (the `as typeof i18n.t` cast) needs to be precise.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const t = ((key: any, options?: any) => {
    void binding.tick
    return i18n.t(key, options)
}) as typeof i18n.t

export function language() {
    void binding.tick
    return i18n.language
}
