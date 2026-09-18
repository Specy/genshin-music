<script lang="ts">
  import type { VsrgSong } from '$core/Songs/VsrgSong.svelte';
  import IconButton from '$cmp/inputs/IconButton.svelte';
  import IconStop from '~icons/fa6-solid/stop';
  import IconArrowsRotate from '~icons/fa6-solid/arrows-rotate';
  import VsrgPlayerScore from './VsrgPlayerScore.svelte';

  interface VsrgPlayerRightProps {
    song: VsrgSong | null;
    onStopSong: () => void;
    onRetrySong: () => void;
  }

  let { song, onStopSong, onRetrySong }: VsrgPlayerRightProps = $props();
</script>

<!-- This guard gates BOTH the button row and VsrgPlayerScore - the score overlay also disappears
     whenever no song is loaded. Don't hoist VsrgPlayerScore out of this guard. -->
{#if song}
  <div class="vsrg-player-right">
    <div class="row space-between" style="gap:0.2rem">
      <IconButton onclick={onStopSong}>
        <IconStop />
      </IconButton>
      <IconButton onclick={onRetrySong}>
        <IconArrowsRotate />
      </IconButton>
    </div>
  </div>
  <VsrgPlayerScore {onRetrySong} />
{/if}

<style>
  .vsrg-player-right {
    position: absolute;
    padding: 0.5rem;
    right: 0;
    top: 0;
    display: flex;
    flex-direction: column;
  }
</style>
