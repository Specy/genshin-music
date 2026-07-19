<script lang="ts">
    import {game} from '$game'

    let {title}: {title: string} = $props()
</script>

<svelte:head>
    <title>{title} - {game.displayName}</title>
</svelte:head>

<main>
    <h1>{title}</h1>
    <p>Stub — ported in Phase 4.</p>
</main>
