<script lang="ts">
  import type { SongStorable, SerializedSong } from '$core/Songs/Song.svelte';
  import { songService } from '$core/Services/SongService';
  import { logger } from '$stores/LoggerStore.svelte';
  import Tooltip from '$cmp/utility/Tooltip.svelte';
  import { hasTooltip } from '$cmp/utility/tooltip';

  let {
    data,
    currentSongId,
    onClick,
  }: {
    data: SongStorable;
    //the library id of the song currently loaded as the background, so its row shows as the chosen
    //one - never the flattening's id, which a composed background does not have (see the page's
    //`audioSongOriginal`).
    currentSongId: string | null;
    onClick: (song: SerializedSong) => void;
  } = $props();

  //the null guard matters: an unsaved song's id is null, and so is a storable row's in theory
  const isCurrent = $derived(currentSongId !== null && data.id === currentSongId);

  async function selectAsAudioSong() {
    const song = await songService.getOneSerializedFromStorable(data);
    if (!song) return logger.error('Could not find song');
    onClick(song);
  }

  // role/tabindex/onkeydown below make this keyboard-operable - an accessibility addition, not
  // present in old.
  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    selectAsAudioSong();
  }
</script>

<div
  class={['song-row', isCurrent && 'song-row-current', hasTooltip(true)]}
  onclick={selectAsAudioSong}
  onkeydown={handleKeydown}
  role="button"
  tabindex="0"
  style="cursor:pointer"
>
  <div class="song-name">
    {data.name}
  </div>
  <!-- QUIRK: hardcoded English, never routed through t() - matching old, not an oversight. -->
  <Tooltip>Click to select as background song</Tooltip>
</div>
