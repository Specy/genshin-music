<script lang="ts">
  import { onMount } from 'svelte';
  import AppBackground from '$cmp/theme/AppBackground.svelte';
  import Player from '$cmp/pages/Player/Player.svelte';
  import { setPageVisited } from '$stores/PageVisitStore.svelte';

  // Deliberately a byte-for-byte duplicate of src/routes/player/+page.svelte - `/` and
  // `/player` are the same page twice over, matching old. Not accidental duplication to
  // deduplicate away.
  onMount(() => {
    setPageVisited('player');
  });
</script>

<AppBackground page="Main">
  <Player />
</AppBackground>
