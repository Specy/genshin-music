// $effect bodies never run during SSR/prerendering, so only this initial value needs the
// explicit typeof window guard.
export function createMediaQuery(query: string) {
    let matches = $state(typeof window === 'undefined' ? false : window.matchMedia(query).matches)

    $effect(() => {
        const mediaQueryList = window.matchMedia(query)
        const listener = () => {
            matches = mediaQueryList.matches
        }
        mediaQueryList.addEventListener('change', listener)
        return () => mediaQueryList.removeEventListener('change', listener)
    })

    return {
        get matches() {
            return matches
        }
    }
}
