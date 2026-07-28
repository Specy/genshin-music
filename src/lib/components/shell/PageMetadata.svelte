<script lang="ts">
  import type { Snippet } from 'svelte';

  // Everything below, including `children`, must be inside <svelte:head>
  // explicitly - unlike React, Svelte doesn't auto-hoist head elements.
  let {
    text,
    description,
    image,
    children,
  }: {
    text: string;
    description?: string;
    image?: string;
    children?: Snippet;
  } = $props();
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
