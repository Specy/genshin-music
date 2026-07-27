<script lang="ts">
    import type {Snippet} from 'svelte'
    import {resolve} from '$app/paths'

    // Unstyled by design - callers pass `style`/`className` explicitly for any
    // visual styling (e.g. Home's privacy links, `.blog-link`).
    //
    // Leave-guard (unsaved-changes) confirmation is wired once at the shell
    // level (root layout's `beforeNavigate`), not here - every in-app
    // navigation already goes through that one interception point.
    //
    // `resolve()` throws for hrefs that aren't absolute in-app pathnames, so
    // only internal hrefs ("/...") go through it; external URLs, mailto:, and
    // #hash pass through unchanged.
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

    // `href` is a runtime string, not a literal route, so it can't satisfy
    // resolve()'s per-route overloads (typed per literal via a big union) -
    // `any` is the narrow escape hatch here, same pattern as `i18n.t` in
    // binding.svelte.ts. resolve() itself just does `base + resolve_route(...)`,
    // which works for any string starting with "/".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
    const resolvedHref = $derived(href.startsWith('/') ? resolve(href as any) : href)
</script>

<!-- resolvedHref already branches through resolve() for internal hrefs; the
     lint rule can't trace that at the runtime branch, so it's suppressed here. -->
<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
<a href={resolvedHref}
    class={className}
    style={style}
    {onclick}
    {...rest}
>
    {@render children?.()}
</a>
