<script lang="ts">
  import type { Snippet } from 'svelte';

  // CSS (.folder-content/.folder-title/.folder-songs-wrapper) lives in this
  // file's own style block at the bottom.
  //
  // (Careful with comments in this file now that it carries a style block:
  // spelling a literal style or script tag name in brackets makes
  // svelte-check's tag scanner pair it with the real closing tag below and
  // report a phantom "script left open" error.)
  let {
    children,
    title,
  }: {
    children?: Snippet;
    title?: string;
  } = $props();
</script>

<div class="folder-content">
  {#if title}
    <h2 class="folder-title">{title}</h2>
  {/if}
  <div class="folder-songs-wrapper">
    {@render children?.()}
  </div>
</div>

<style>
  /* `flex-direction` without a `display:flex` is inert here on purpose: the
     element is display:block (its children stack anyway), and the rule is kept
     only because the legacy app shipped it. The open/close animation itself
     lives in SongFolder.svelte as an {#if}+slide transition - there is
     deliberately NO transition/animation CSS on the folder body, since a CSS
     transition on it would fight slide's per-frame inline styles. */
  .folder-content {
    padding: 0.5rem;
    padding-top: 0;
    flex-direction: column;
  }

  .folder-songs-wrapper {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.3rem;
  }

  .folder-title {
    margin: 0 0 0.4rem 0rem;
    font-size: 1.1rem;
  }

  @media only screen and (max-width: 920px) {
    .folder-content {
      padding: 0.4rem;
    }
  }
</style>
