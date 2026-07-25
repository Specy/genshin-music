<script lang="ts">
    import {onMount} from 'svelte'
    import {browser} from '$app/environment'
    import AppBackground from '$cmp/theme/AppBackground.svelte'
    import Composer from '$cmp/pages/Composer/Composer.svelte'
    import {setPageVisited} from '$stores/PageVisitStore.svelte'

    // Old: src/app/composer/page.tsx (a thin route wrapper: `<PageBackground page="Composer">
    // <ClientPage/></PageBackground>`, `ClientPage` = `$pages/composer`'s default export
    // `ComposerPage`, defined at the bottom of old's `src/app/_client-pages/composer/index.tsx`
    // (991 lines) alongside the real `Composer` class component - see `Composer.svelte`'s own
    // header comment for that file's own split rationale). `ComposerPage`'s own body -
    // `useSearchParams()` (`querySongId`/`showMidi`), `useSetPageVisited('composer')`, then
    // `<Composer navigation={...} registerLeaveHandler={...} t={...} songId={...}
    // showMidi={...} inPreview={...}/>` - is exactly what this file replaces: the
    // navigation/registerLeaveHandler/t prop-threading is dropped (`Composer.svelte` reads
    // `$app/navigation`/the reactive `t()` binding/`registerLeaveHandler` directly, the same
    // convention every other Phase-4 page already established), and
    // `useSetPageVisited('composer')` becomes a plain `setPageVisited('composer')` call inside
    // `onMount` below (the established "per-ROUTE concern, not per-COMPONENT" convention
    // Player.svelte's own header comment documents - `player/+page.svelte`/`+page.svelte` at `/`
    // do the identical thing). `PageBackground page="Composer"` -> `AppBackground
    // page="Composer"` (same 1-line-pass-through component, wired at the route level -
    // `Composer.svelte` itself never renders it, matching Player.svelte's identical choice).
    //
    // Old's `ComposerPage` also had its OWN `{inPreview, songId}` props, folded together with the
    // live query-string values via `querySongId ?? songId ?? null` / `showMidi={Boolean(showMidi)}`
    // - that fallback chain existed because ONE function served both callers (this real route,
    // which only ever supplied query params, and the theme-page preview, which only ever supplied
    // the `inPreview`/`songId` props). Splitting the class from the route wrapper (this task's own
    // brief) gives each caller its own file instead: this route always reads the query string with
    // no prop-level fallback needed; the theme page's `<Composer inPreview/>` (see that file's own
    // header comment) mounts `Composer.svelte` directly with neither `songId` nor `showMidi`,
    // relying on that component's own prop defaults. `Boolean(searchParams.get('showMidi'))`
    // preserves old's actual (quirky) truthiness rule verbatim: any non-empty query value -
    // including the literal string "false" - is truthy in JS, so `?showMidi=false` would still
    // open the MIDI importer; not "fixed" here, since old had the exact same behavior.
    //
    // REQUIRED ADAPTATION (real build failure, not a style choice): `page.url.searchParams`
    // (`$app/state`) throws "Cannot access url.searchParams on a page with prerendering enabled"
    // during `svelte-kit`'s prerender crawl - this whole app prerenders every route at build time
    // (`src/routes/+layout.ts`: `export const prerender = true`, spec §4.2, "no runtime server"),
    // so ANY page reading `page.url.searchParams` reactively in its own script/template hits this
    // guard, not just this one. Reproduced live via `npm run build:genshin` (500 on `GET
    // /composer`, traced to this exact line) before this fix. The query string is, by definition,
    // only ever known client-side anyway (a prerendered snapshot cannot vary by query string, and
    // old's own Next.js static export required the identical `useSearchParams()`-consuming
    // component to be `'use client'` for the same reason) - `browser` (`$app/environment`) gates a
    // plain `window.location`-based read instead of `page.url`, computed ONCE as a top-level
    // `const` (matching `Composer.svelte`'s own `songId`/`showMidi` props, which old's `Composer`
    // class ALSO only ever reads once, at its own mount - see that file's header comment). This
    // top-level computation runs before `<Composer>` is instantiated below (Svelte evaluates a
    // component's own script fully before creating its children), so `Composer.svelte`'s `onMount`
    // always observes the already-resolved value, both during a fresh SSR/prerender pass
    // (`browser` false, `songId`/`showMidi` fall back to `null`/`false`, matching a plain `/composer`
    // visit) and during real client-side hydration (`browser` true, the actual query string).
    const searchParams = browser ? new URL(window.location.href).searchParams : null
    const songId = searchParams?.get('songId') ?? null
    const showMidi = Boolean(searchParams?.get('showMidi'))

    onMount(() => {
        setPageVisited('composer')
    })
</script>

<AppBackground page="Composer">
    <Composer {songId} {showMidi} />
</AppBackground>
