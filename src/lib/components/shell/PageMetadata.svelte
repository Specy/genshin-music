<script lang="ts">
  import type { Snippet } from 'svelte';
  import { game } from '$game';
  import { absoluteUrl, DEFAULT_SOCIAL_IMAGE } from '$lib/seo';

  // Everything below, including `children`, must be inside <svelte:head>
  // explicitly - unlike React, Svelte doesn't auto-hoist head elements.
  //
  // Social tags (og:*, twitter:*) are emitted here, per page, because each page owns its own
  // title, description and preview image. Images are always absolute on the canonical origin
  // (absoluteUrl), since a crawler cannot resolve a root-relative src. A page with no image of
  // its own gets the active game's default preview; a page with no description gets the game's.
  let {
    text,
    description,
    image,
    type = 'website',
    children,
  }: {
    text: string;
    description?: string;
    image?: string;
    type?: 'website' | 'article';
    children?: Snippet;
  } = $props();

  const socialDescription = $derived(description ?? game.meta.description);
  const socialImage = $derived(absoluteUrl(image ?? DEFAULT_SOCIAL_IMAGE));
</script>

<svelte:head>
  <title>{text}</title>
  <meta property="og:title" content={text} />
  <meta property="og:type" content={type} />
  {#if description}
    <meta name="description" content={description} />
  {/if}
  <meta property="og:description" content={socialDescription} />
  <meta name="image" content={socialImage} />
  <meta property="og:image" content={socialImage} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={text} />
  <meta name="twitter:description" content={socialDescription} />
  <meta name="twitter:image" content={socialImage} />
  {@render children?.()}
</svelte:head>
