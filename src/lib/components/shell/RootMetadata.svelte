<script lang="ts">
    import {base} from '$app/paths'
    import {IS_BETA} from '$lib/env'

    // P5 Task 4 (root head/metadata parity). Old: src/app/site-metadata.ts (migration/next16-react19,
    // 29 lines) via Next's `Metadata`/`Viewport` exports, plus the dynamic theme-color meta from
    // src/components/shared/ProviderWrappers/ThemeProviderWrapper.tsx:49 (ported as
    // ThemeVars.svelte:48, unchanged by this task). This component carries every root-level head
    // element old's metadata cascade produced EXCEPT `<title>`/`<meta name="description">` and the
    // favicon - see the two exclusions below.
    //
    // Ground truth for element presence/order is the OLD APP'S OWN BUILT <head>, captured verbatim
    // (not re-derived from the source alone) by P5 Task 3 into
    // docs/superpowers/audits/2026-07-26-bundle-comparison.md's "Old app's built <head>" section.
    // That capture proved old emitted exactly the elements below, in this relative order:
    // <link rel=manifest>, <link rel=icon> (favicon), <link rel=apple-touch-icon>, and - the one
    // item this task had to verify rather than assume - exactly TWO <meta name=theme-color> tags,
    // dynamic (ThemeProviderWrapper, `rgb(99, 174, 167)`) FIRST and static (site-metadata.ts's
    // `rootViewport.themeColor`, `#63aea7`) SECOND. Per the HTML spec a browser uses the FIRST valid
    // theme-color it finds, so old's dynamic one was the one actually governing chrome color (both
    // happened to resolve to the same color on the default theme) - the static one is real
    // redundant-fallback weight, not dead code, and this task's job is to preserve that exact
    // ordering, not to invert it. (The task brief flagged the OPPOSITE risk in advance - "if the
    // static one preceded the dynamic one, the dynamic one would be dead" - Task 3's capture proved
    // that risk did not materialize in old, so there is no preserved-bug finding to record here,
    // only an ordering fact to reproduce.)
    //
    // ORDERING MECHANISM (why this is a separate component mounted AFTER <ThemeVars> in
    // +routes/+layout.svelte, not merged into it or placed before it): Svelte's SSR/hydration head
    // insertion appends each <svelte:head> occurrence's content in component-render order, which
    // for a parent template is simply template (document) order. ThemeVars.svelte's own
    // <svelte:head> (the dynamic theme-color) is a child of ThemeVars; every page's own
    // PageMetadata <svelte:head> (title/description) is a further-nested descendant, rendered
    // inside ThemeVars' `{@render children()}` slot. Placing this component as a SIBLING after the
    // closing </ThemeVars> tag in +layout.svelte guarantees its own <svelte:head> content (the
    // static theme-color included) is appended to <head> after both of those, reproducing old's
    // dynamic-before-static order without needing to change ThemeVars.svelte or PageMetadata.svelte
    // at all. Verified empirically this task, not just reasoned: `npm run build:genshin` +
    // `npm run build:sky`, grepping the built index.html of BOTH shows the dynamic theme-color meta
    // (`rgb(99, 174, 167)`) preceding the static one (`#63aea7`), identically on both games (see the
    // task report for the exact byte comparison). The dynamic value is the SAME literal on both
    // games, not a per-game value as an earlier pass of this comment mis-stated by quoting
    // `rgb(73, 84, 102)` as if it were "the other game's" theme-color - that number is actually
    // ThemeVars.svelte's own unrelated `:root{--primary:...}` custom property, which happens to sit
    // a few bytes before the theme-color meta in the same raw <head>. The default theme (including
    // its `accent`/`primary` entries) lives in core-tier `src/lib/core/theme/defaultThemes.ts`,
    // which imports nothing from `$game`, so neither game's own data can make this value differ.
    //
    // EXCLUDED, deliberately:
    // - `<link rel="icon">` (favicon): already emitted by src/app.html via `%sveltekit.assets%`
    //   (this app's own static shell, present since Phase 1) - adding a second one here would
    //   duplicate it, not port anything.
    // - `<title>`/`<meta name="description">`: Next's metadata cascade let a page override the
    //   root value, producing exactly ONE of each per page. Svelte's <svelte:head> has no cascade -
    //   a root <title> here would leave TWO <title> elements on every page (this one plus every
    //   page's own PageMetadata call), breaking the "exactly one <title> per page" invariant P4a/
    //   P4b/P4c all independently verified. The established precedent (delete-cache/+page.svelte's
    //   own header) is page-owned metadata everywhere, including the one route (delete-cache) that
    //   inherited the root title verbatim in old. This task's own build-both-games audit (see the
    //   report) re-confirms that precedent still holds tree-wide rather than silently assuming it.
</script>

<svelte:head>
    <!-- old: rootMetadata.manifest = assetPath('/manifest.json') (site-metadata.ts:19). Currently
         missing entirely from the new app (0 matches for rel="manifest" in the built output before
         this task) - installed-PWA/manifest discovery was broken. scripts/gameStatic.js rewrites
         static/manifest.json's own start_url/icon paths for the active base at build time; `base`
         here supplies the matching link href. -->
    <link rel="manifest" href="{base}/manifest.json" />
    <!-- old: rootMetadata.icons.apple = assetPath('/logo192.png') (site-metadata.ts:18). -->
    <link rel="apple-touch-icon" href="{base}/logo192.png" />
    <!-- old: rootMetadata.robots = isBeta ? {index:false, follow:false} : undefined
         (site-metadata.ts:21, `isBeta` from NEXT_PUBLIC_IS_BETA). IS_BETA ($lib/env) is the same
         PUBLIC_IS_BETA-derived flag; Next's {index:false, follow:false} object serializes to
         exactly this one <meta> tag when present, and to no tag at all when unset - reproduced
         with a plain {#if}. -->
    {#if IS_BETA}
        <meta name="robots" content="noindex, nofollow" />
    {/if}
    <!-- old: rootViewport.themeColor = '#63aea7' (site-metadata.ts:30), surfaced by Next's
         `viewport` export as the SECOND <meta name=theme-color> in document order (see this file's
         header for the full ordering proof). The dynamic FIRST one is ThemeVars.svelte:48 -
         unchanged, not duplicated here. -->
    <meta name="theme-color" content="#63aea7" />
</svelte:head>
