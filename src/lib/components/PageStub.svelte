<script lang="ts">
  import { game } from '$game';
  import DefaultPage from './shell/DefaultPage.svelte';

  let { title }: { title: string } = $props();
</script>

<svelte:head>
  <title>{title} - {game.meta.title}</title>
</svelte:head>

<DefaultPage>
  <h1>{title}</h1>
  <p>Stub — ported in Phase 4.</p>
</DefaultPage>
