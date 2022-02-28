//@ts-ignore
const GA = window?.gtag
async function callGA(fn: () => Promise<void>) {
    try {
        return {
            data: await fn()
        }
    } catch (e) {
        if (GA) console.log('Error with GA')
        return { error: e }
    }
}

function event(action:any, params:any) {
    return callGA(() => GA('event', action, params))
}

function userSongs(type:string, params:any) {
    return event('songs_' + type, params)
}

function songSearch(params:any) {
    return event('song_search', params)
}

function UIEvent(type:string, params:any) {
    return event('UI_' + type, params)
}

function songEvent(params:any) {
    return event('song_event', params)
}

function pageView(page: string) {
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