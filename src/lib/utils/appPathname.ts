import {base} from '$app/paths'

/**
 * Pathname with the SvelteKit base prefix stripped. Never compare
 * `page.url.pathname` to route literals directly - use this instead.
 */
export function appPathname(pathname: string): string {
    if (base && pathname.startsWith(base)) {
        const stripped = pathname.slice(base.length)
        return stripped === '' ? '/' : stripped
    }
    return pathname
}
