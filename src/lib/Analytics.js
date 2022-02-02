const GA = window?.gtag
async function callGA(fn) {
    try {
        return {
            data: await fn()
        }
    } catch (e) {
        if (GA) console.error(e)
        return { error: e }
    }
}

function event(action, params) {
    return callGA(() => GA('event', action, params))
}

function userSongs(params, type) {
    return event('songs_' + type, params)
}

function songSearch(params) {
    return event('song_search', params)
}

function UIEvent(type, params) {
    return event('UI_' + type, params)
}

function songEvent(params) {
    return event('song_event', params)
}

function pageView(page) {
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