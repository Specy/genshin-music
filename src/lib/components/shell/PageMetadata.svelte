<script lang="ts">
    import type {Snippet} from 'svelte'

    // Old: src/components/shared/Miscellaneous/PageMetadata.tsx. That file rendered
    // <title>/<meta>/{children} as a bare fragment and relied on React 19's automatic hoisting of
    // those elements into <head>; Svelte has no such hoisting, so the same fragment is wrapped in
    // an explicit <svelte:head> below (children included - the old component's children were
    // themselves always more head-only elements, e.g. extra <meta>/<link> tags from call sites).
    let {text, description, image, children}: {
        text: string
        description?: string
        image?: string
        children?: Snippet
    } = $props()
</script>

<svelte:head>
    <title>{text}</title>
    {#if description}
        <meta name="description" content={description} />
        <meta property="og:description" content={description} />
    {/if}
    {#if image}
        <meta name="image" content={image} />
        <meta property="og:image" content={image} />
    {/if}
    {@render children?.()}
</svelte:head>
