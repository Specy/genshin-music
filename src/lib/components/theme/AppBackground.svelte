<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ThemeProvider as theme, type BackgroundProps } from '$core/theme/ThemeProvider.svelte';

  let { page, children }: { page: BackgroundProps; children: Snippet } = $props();

  const backgroundImage = $derived(theme.getOther(`backgroundImage${page}`));
</script>

<div class="app bg-image" style="background-image:url({backgroundImage})">
  {@render children()}
</div>

<style>
  .bg-image {
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
  }
</style>
