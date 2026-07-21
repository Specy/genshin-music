import {base} from '$app/paths'

/**
 * Pathname with the SvelteKit base prefix stripped — the equivalent of the
 * old Next.js usePathname(). NEVER compare page.url.pathname to route
 * literals directly; use this. (Phase-3 final review, Important-1.)
 */
export function appPathname(pathname: string): string {
    if (base && pathname.startsWith(base)) {
        const stripped = pathname.slice(base.length)
        return stripped === '' ? '/' : stripped
    }
    return pathname
}
