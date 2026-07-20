<script lang="ts">
    import type {Snippet} from 'svelte'
    import {resolve} from '$app/paths'

    // Old: src/components/shared/link/AppLink.tsx, wrapping src/app/_navigation/AppLink.tsx
    // (next/link + a custom NavigationProvider/LeaveGuard system).
    //
    // Scope note: this ports the STYLED LINK only (display:inline-block,
    // underline, accent color) using SvelteKit's own navigation - the old
    // NavigationProvider's `registerLeaveHandler`/LeaveGuard (an
    // unsaved-changes-before-navigating confirmation system used by editor
    // pages) is a separate, substantial subsystem with zero consumers this
    // phase (its only real users - Composer/VSRG Composer - are Phase 4) and
    // is not in this task's file list; a plain SvelteKit `<a href>` already
    // gets client-side transitions for free (unlike next/link, no wrapper
    // component is required for that part), so nothing is lost for the
    // primitives this phase needs. Revisit when the editor pages need the
    // leave-guard.
    //
    // `resolve()` (not the deprecated `base` prefixing used elsewhere, e.g.
    // i18nCache.ts) is used for internal hrefs so this satisfies
    // svelte/no-navigation-without-resolve. `resolve()` throws at runtime for
    // any href that isn't an absolute in-app pathname ("external URLs should
    // be used directly") - and old AppLink call sites do pass external hrefs
    // (e.g. https://basicpitch.spotify.com/ in
    // blog/posts/video-audio-transpose.tsx), so hrefs are branched: internal
    // (leading "/") go through resolve(), everything else (external URLs,
    // mailto:, #hash, etc.) passes through unchanged, exactly as resolve()'s
    // own docs direct.
    let {
        href,
        children,
        style = '',
        className,
        onclick,
        ...rest
    }: {
        href: string
        children?: Snippet
        style?: string
        className?: string
        onclick?: (e: MouseEvent) => void
        [key: string]: unknown
    } = $props()

    // `href` is a general runtime string (any in-app route, not a specific
    // literal known at compile time), so it can never structurally satisfy
    // resolve()'s per-route overloads - resolve<T>()'s parameter type is
    // generated per literal route (a big union of single-element tuples), and
    // no broader string-shaped type is assignable to that union short of a
    // literal match. `any` is the narrowly-scoped escape hatch for exactly
    // this "generic wrapper around an overloaded, literal-keyed function"
    // situation - same pattern already used in src/lib/i18n/binding.svelte.ts
    // for `i18n.t`. The runtime behavior is unaffected: resolve() itself only
    // ever does `base + resolve_route(path, params)`, which works for any
    // string starting with "/".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
    const resolvedHref = $derived(href.startsWith('/') ? resolve(href as any) : href)
</script>

<!-- the internal branch of resolvedHref always calls resolve(); the external
     branch passes `href` through verbatim, matching resolve()'s own guidance
     ("external URLs should be used directly"). The lint rule below can't trace
     a runtime href.startsWith('/') branch back to a resolve() call, so it's
     suppressed for this one dynamic, dual-purpose (internal+external) link. -->
<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
<a href={resolvedHref}
    class={className}
    style="display:inline-block;text-decoration:underline;color:var(--accent);{style}"
    {onclick}
    {...rest}
>
    {@render children?.()}
</a>
