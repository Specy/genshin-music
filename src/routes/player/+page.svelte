<script lang="ts">
    import {onMount} from 'svelte'
    import AppBackground from '$cmp/theme/AppBackground.svelte'
    import Player from '$cmp/pages/Player/Player.svelte'
    import {setPageVisited} from '$stores/PageVisitStore.svelte'

    // Old: src/app/player/page.tsx (a thin route wrapper: `<PageBackground page="Main">
    // <ClientPage/></PageBackground>`, `ClientPage` = `$pages/player`'s default export, the
    // `PlayerPage` function old's `src/app/_client-pages/player/index.tsx` also exported - see
    // `Player.svelte`'s own header comment for how that wrapper's `useTranslation`/
    // `useSetPageVisited('player')` responsibilities are split between this route file (page-visit
    // tracking, below) and `Player.svelte` itself (the reactive `t()` binding, no prop needed).
    // `PageBackground page="Main"` -> `AppBackground page="Main"` (same component, see
    // `PageBackground.tsx`'s own 1-line pass-through body) wired here at the route level, matching
    // old's own wrapping (`Player.svelte` itself never renders it - see that file's header comment).
    onMount(() => {
        setPageVisited('player')
    })
</script>

<AppBackground page="Main">
    <Player />
</AppBackground>
