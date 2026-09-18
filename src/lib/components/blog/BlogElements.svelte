<script lang="ts">
  import type { Snippet } from 'svelte';

  // A no-op pass-through (`{@render children?.()}` only), on purpose: blog
  // posts author `.blog-p`/`.blog-ol`/`.blog-b`/`.blog-iframe`/`.blog-link`
  // as native tags directly, not through snippets or components, so this
  // file's only job is to own their CSS below and stay a real child of
  // BaseBlogPost.svelte's <article> - Svelte only bundles a component's
  // styles where the component actually renders.
  let { children }: { children?: Snippet } = $props();
</script>

{@render children?.()}

<style>
  /* Every rule below needs :global(): this component's template is nothing but
       {@render children?.()}, so it creates no element of its own for Svelte to attach a
       scoping hash to. The classes are written in the blog posts' own markup under
       src/routes/blog/posts/, which scoped CSS from here cannot reach. */
  :global(.blog-p) {
    margin: 1rem 0;
    user-select: text;
  }

  :global(.blog-b) {
    font-weight: bold;
    font-family: RobotoSerif, serif;
  }

  :global(.blog-ol) {
    margin: 0;
    font-family: RobotoSerif, serif;
    padding: 0;
    list-style-type: none;
    margin-left: 2rem;
    user-select: text;
  }

  :global(.blog-ol li) {
    counter-increment: step-counter;
    position: relative;
    margin: 1rem 0;
    font-family: RobotoSerif, serif;
    opacity: 0.9;
    user-select: text;
  }

  :global(.blog-ol li)::before {
    content: counter(step-counter);
    position: absolute;
    background-color: var(--accent);
    color: var(--accent-text);
    transform: translateX(calc(-100% - 0.5rem));
    border-radius: 2rem;
    font-weight: bold;
    min-width: 1.5rem;
    height: 100%;
    padding: 0;
    text-align: center;
  }

  :global(.blog-iframe) {
    height: min(20rem, 70vh);
    margin: 2rem 0;
    border: unset;
    box-shadow: 0 0 0.5rem 0.5rem rgba(0, 0, 0, 0.1);
    border-radius: 0.5rem;
  }

  :global(.blog-link) {
    color: var(--accent);
    text-decoration: underline;
  }
</style>
