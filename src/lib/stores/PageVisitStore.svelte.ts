import {PAGES_VERSIONS, type PagesVersionsKeys} from "$core/PagesVersions"
import {APP_NAME} from "$core/legacyConfig"
import {logger} from "./LoggerStore.svelte"
import {i18n} from "$i18n/i18n"

const localStorageKey = `${APP_NAME}_visited_pages`

class PageVisitStore {
    // A plain $state counter, read (via hasVisitedPage) before an otherwise-non-reactive
    // localStorage lookup - same role as I18nBinding.tick. Bumping it in setPageVisited() forces
    // any $derived/template that called hasVisitedPage() to re-run.
    tick = $state(0)

    refreshKey() {
        this.tick++
    }
}

const store = new PageVisitStore()

export function hasVisitedPage(pageKey: PagesVersionsKeys): boolean {
    void store.tick
    // SSR/prerendering guard (same pattern as PwaStore.load()/GlobalConfigStore.load()): no
    // localStorage during the build's prerender pass. Defaults to "visited" (no badge)
    // server-side; the client corrects it post-hydration.
    if (typeof localStorage === 'undefined') return true
    const visitedPages = JSON.parse(localStorage.getItem(localStorageKey) || '{}')
    const visitedPageVersion = visitedPages[pageKey] ?? -1
    // Pages at version 0 have no changelog entries to flag, so they're always treated as visited.
    if (!(PAGES_VERSIONS[pageKey]?.version > 0)) return true
    const currentVersion = PAGES_VERSIONS[pageKey]?.version
    return visitedPageVersion >= currentVersion
}

export function setPageVisited(key: PagesVersionsKeys) {
    // Same SSR guard as hasVisitedPage() above.
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
