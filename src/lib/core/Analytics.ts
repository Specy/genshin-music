// old: src/lib/Analytics.ts (49 lines) - byte-verbatim port, zero import changes needed (this
// file has no imports). Thin gtag wrapper: `window.gtag` is guarded/optional-chained everywhere,
// so every function here was a safe no-op through Phase 4 - ported ahead of the GA script itself
// so the keyboard-page `Analytics.*` call sites could land minimal-diff against a real module
// instead of being dropped and re-added later. (Re-derived this session, correcting this header's
// own prior "~8 ... Player/ZenKeyboard/SheetVisualizer" claim: grepping every `Analytics.<method>(`
// call finds 10 pre-existing sites across Composer.svelte (x3), ComposerMenu.svelte,
// Player.svelte (x2), PlayerKeyboard.svelte, PlayerMenu.svelte (x2) and
// sheet-visualizer/+page.svelte - Composer was undercounted by one in the old text and
// ZenKeyboard, named in it, has none.)
//
// As of Phase 5 Task 5 (this task) the no-op era is over: AppInit.svelte's own onMount now injects
// the real gtag.js script and defines `window.gtag` (old: GoogleAnalyticsScript.tsx - see that
// onMount's own header for the full port), and separately calls `Analytics.UIEvent`/
// `Analytics.pageView` itself (old AppBase.tsx effects 6/7), bringing the total to 12 call sites.
// Every function exported below is therefore live, not a no-op, from this commit onward.
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
