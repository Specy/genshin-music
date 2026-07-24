<script lang="ts">
    import {onMount} from 'svelte'
    import AppBackground from '$cmp/theme/AppBackground.svelte'
    import Player from '$cmp/pages/Player/Player.svelte'
    import {setPageVisited} from '$stores/PageVisitStore.svelte'

    // Old: src/app/page.tsx - byte-identical route body to src/app/player/page.tsx (both:
    // `<PageBackground page="Main"><ClientPage/></PageBackground>`, `ClientPage` = `$pages/player`'s
    // default export) - old's `/` and `/player` really were the same page twice over, confirmed
    // against both raw blobs (P4a input item 1). This file is therefore an intentional byte-for-byte
    // duplicate of `src/routes/player/+page.svelte` - see that file's own header comment for the
    // full rationale (AppBackground wiring, the `PlayerPage` wrapper's `t`/`setPageVisited` split).
    // This Phase-1 skeleton placeholder (`<h1>{game.meta.title}</h1>` etc.) is fully replaced now
    // that Phase 4b has a real Player page to mount.
    onMount(() => {
        setPageVisited('player')
    })
</script>

<AppBackground page="Main">
    <Player />
</AppBackground>
