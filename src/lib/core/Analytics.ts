// old: src/lib/Analytics.ts (49 lines) - byte-verbatim port, zero import changes needed (this
// file has no imports). Thin gtag wrapper: `window.gtag` is guarded/optional-chained everywhere,
// so every function here is a safe no-op until Phase 5 actually loads the GA script (AppInit.svelte
// currently omits analytics init entirely - see progress ledger P4a Task 10 / the P4a final
// review's "Analytics: NOT yet ported" note). Ported now so the ~8 keyboard-page `Analytics.*`
// call sites (Player/ZenKeyboard/SheetVisualizer, wired across Tasks 2-7 of this phase) port
// minimal-diff against a real module instead of being dropped and re-added later.
declare global {
    interface Window {
        gtag?: (...args: any[]) => Promise<void>
    }
}

async function callGA(fn: () => Promise<void> | undefined) {
    try {
        return {
            data: await fn()
        }
    } catch (e) {
        if (window.gtag) console.log('Error with GA')
        return {error: e}
    }
}

function event(action: any, params: any) {
    return callGA(() => window?.gtag?.('event', action, params))
}

function userSongs(type: string, params: any) {
    return event('songs_' + type, params)
}

function songSearch(params: any) {
    return event('song_search', params)
}

function UIEvent(type: string, params: any) {
    return event('UI_' + type, params)
}

function songEvent(params: any) {
    return event('song_event', params)
}

function pageView(page: { page_title: string }) {
    return event('page_view', page)
}

const Analytics = {
    pageView,
    event,
    songEvent,
    userSongs,
    songSearch,
    UIEvent
}
export default Analytics
