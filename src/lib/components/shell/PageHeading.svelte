<script lang="ts">
  /**
   * The document's <h1>, for the app surfaces that have no room for a visible one — the
   * player, the composer and the rest are a full-window canvas with a rail, not a page
   * with a masthead. Every page still needs to say what it is: this is what a screen
   * reader announces first and what a crawler reads as the page's subject, and without
   * it those pages ship with no heading at all.
   *
   * Not folded into PageMetadata: that component renders only into <svelte:head>, and
   * some routes deliberately mount several of it (routes/theme/+page.svelte).
   */
  let { text }: { text: string } = $props();
</script>

<h1>{text}</h1>

<style>
  /* Off-screen rather than display:none — a hidden element is skipped by screen readers
     too, which would defeat half the point. */
  h1 {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
</style>
