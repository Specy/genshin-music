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