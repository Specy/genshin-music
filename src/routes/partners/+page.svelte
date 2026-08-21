<script lang="ts">
  import AppLink from '$cmp/AppLink.svelte';
</script>

<!-- Unreachable in practice: +page.ts redirects before this can mount, and the prerendered
     file is a meta refresh. The link is the fallback for whatever agent ignores both. -->
<AppLink href="/blog">Blog</AppLink>
