<script lang="ts">
  import { onMount } from 'svelte';
  import AppBackground from '$cmp/theme/AppBackground.svelte';
  import Player from '$cmp/pages/Player/Player.svelte';
  import { setPageVisited } from '$stores/PageVisitStore.svelte';

  // AppBackground is wired at the route level (not inside Player.svelte itself) - page-visit
  // tracking lives here too; Player.svelte owns its own reactive t() binding internally.
  onMount(() => {
    setPageVisited('player');
  });
</script>

<AppBackground page="Main">
  <Player />
</AppBackground>
