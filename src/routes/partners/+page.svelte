<script lang="ts">
  import AppLink from '$cmp/AppLink.svelte';
</script>

<!-- Unreachable in practice: +page.ts redirects before this can mount, and the prerendered
     file is a meta refresh. The link is the fallback for whatever agent ignores both. -->
<AppLink href="/blog" class="partners-fallback">Blog</AppLink>

<style>
  /* No DefaultPage and so no menu on this route - nothing here is reserving space or setting a
     touch size the way the shared page shell does. If the two redirects above ever do fail,
     what is left is this one link, and on a phone it would otherwise be a 20px-tall word
     pinned to the very corner of the viewport. AppLink renders the anchor itself, so the class
     lands on ITS element and needs :global() to be reachable from here; the name is unique to
     this route, which is what stops the rule from going anywhere else. */
  :global(.partners-fallback) {
    display: inline-block;
    margin: 1rem;
    padding: 0.75rem 1.25rem;
    border-radius: 0.5rem;
    background-color: var(--primary);
    color: var(--primary-text);
    text-decoration: underline;
  }
</style>
