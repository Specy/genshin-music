<script lang="ts">
  import type { VsrgSong } from '$core/Songs/VsrgSong';
  import IconButton from '$cmp/inputs/IconButton.svelte';
  import VsrgPlayerScore from './VsrgPlayerScore.svelte';

  interface VsrgPlayerRightProps {
    song: VsrgSong | null;
    onStopSong: () => void;
    onRetrySong: () => void;
  }

  let { song, onStopSong, onRetrySong }: VsrgPlayerRightProps = $props();
</script>

{#snippet faStopIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M400 32H48C21.5 32 0 53.5 0 80v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V80c0-26.5-21.5-48-48-48z"
    /></svg
  >
{/snippet}

{#snippet faSyncAltIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M370.72 133.28C339.458 104.008 298.888 87.962 255.848 88c-77.458.068-144.328 53.178-162.791 126.85-1.344 5.363-6.122 9.15-11.651 9.15H24.103c-7.498 0-13.194-6.807-11.807-14.176C33.933 94.924 134.813 8 256 8c66.448 0 126.791 26.136 171.315 68.685L463.03 40.97C478.149 25.851 504 36.559 504 57.941V192c0 13.255-10.745 24-24 24H345.941c-21.382 0-32.09-25.851-16.971-40.971l41.75-41.749zM32 296h134.059c21.382 0 32.09 25.851 16.971 40.971l-41.75 41.75c31.262 29.273 71.835 45.319 114.876 45.28 77.418-.07 144.315-53.144 162.787-126.849 1.344-5.363 6.122-9.15 11.651-9.15h57.304c7.498 0 13.194 6.807 11.807 14.176C478.067 417.076 377.187 504 256 504c-66.448 0-126.791-26.136-171.315-68.685L48.97 471.03C33.851 486.149 8 475.441 8 454.059V320c0-13.255 10.745-24 24-24z"
    /></svg
  >
{/snippet}

<!-- This guard gates BOTH the button row and VsrgPlayerScore - the score overlay also disappears
     whenever no song is loaded. Don't hoist VsrgPlayerScore out of this guard. -->
{#if song}
  <div class="vsrg-player-right">
    <div class="row space-between" style="gap:0.2rem">
      <IconButton onclick={onStopSong}>
        {@render faStopIcon()}
      </IconButton>
      <IconButton onclick={onRetrySong}>
        {@render faSyncAltIcon()}
      </IconButton>
    </div>
  </div>
  <VsrgPlayerScore />
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
