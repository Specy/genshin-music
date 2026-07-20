import {PAGES_VERSIONS, type PagesVersionsKeys} from "$core/PagesVersions"
import {APP_NAME} from "$core/legacyConfig"
import {logger} from "./LoggerStore.svelte"
import {i18n} from "$i18n/i18n"

// Old: src/components/shared/PageVisit/pageVisit.tsx. Ports the internal `PageVisitStore` class
// (mobx `@observable state.key` + `refreshKey()`) and the two hooks' bodies, minus the React-hook
// ceremony (useState/useEffect/useObservableObject/useTranslation) the brief calls out - callers
// get plain functions instead of a hook pair. `usePageVisit`'s derived `style`/`className`/
// `t('new')` badge-rendering bits are Menu/Home UI concerns (Task 8), not this store's job; only
// the underlying visited/not-visited boolean and the mark-visited side effect (both explicitly
// named in the brief) live here.
const localStorageKey = `${APP_NAME}_visited_pages`

class PageVisitStore {
    // old: `@observable state: {key: number} = {key: 0}` bumped by refreshKey() and read via
    // useObservableObject() to force `usePageVisit` callers to re-render on any page's visited
    // status changing elsewhere. Same role as I18nBinding.tick (`$i18n/binding.svelte.ts`): a
    // plain $state counter callers read (via `hasVisitedPage`) before an otherwise-non-reactive
    // localStorage lookup, so Svelte's fine-grained reactivity re-runs any $derived/template that
    // called hasVisitedPage() when a later setPageVisited() call bumps it.
    tick = $state(0)

    refreshKey() {
        this.tick++
    }
}

const store = new PageVisitStore()

export function hasVisitedPage(pageKey: PagesVersionsKeys): boolean {
    void store.tick
    // SSR/prerendering guard (same pattern as PwaStore.load()/GlobalConfigStore.load()): no
    // localStorage during the build's prerender pass. First real caller is Home.svelte (P3 Task
    // 8) via its nav cards' "new" badge - nothing called this function before, so the gap was
    // latent. Default to "visited" (no badge) server-side; the client corrects it post-hydration.
    if (typeof localStorage === 'undefined') return true
    const visitedPages = JSON.parse(localStorage.getItem(localStorageKey) || '{}')
    const visitedPageVersion = visitedPages[pageKey] ?? -1
    // old: pages at version 0 have no changelog entries to flag, so `usePageVisit`'s state
    // defaulted to `{version: 0, visited: true}` and was only ever recomputed (via setVisited)
    // when the page's own version was > 0 - preserved here as the same early-true.
    if (!(PAGES_VERSIONS[pageKey]?.version > 0)) return true
    const currentVersion = PAGES_VERSIONS[pageKey]?.version
    return visitedPageVersion >= currentVersion
}

export function setPageVisited(key: PagesVersionsKeys) {
    // same SSR guard as hasVisitedPage() above - not yet called from anywhere (no Phase-4 page
    // wired up), but guarded now to avoid the identical prerender crash the moment one is.
    if (typeof localStorage === 'undefined') return
    const visitedPages = JSON.parse(localStorage.getItem(localStorageKey) || '{}')
    const currentVersion = PAGES_VERSIONS[key].version
    const visitedVersion = visitedPages[key] ?? -1
    //if there are changes to this page, log them
    if (currentVersion > visitedVersion) {
        const changes = PAGES_VERSIONS[key].changes.map(e => `- ${e}`).join('\n')
        if (changes) {
            setTimeout(() => {
                logger.success(`${i18n.t('home:new_changes_to_page')}\n\n${changes}`, 8000)
            }, 500)
        }
    }
    visitedPages[key] = PAGES_VERSIONS[key].version
    localStorage.setItem(localStorageKey, JSON.stringify(visitedPages))
    store.refreshKey()
}
