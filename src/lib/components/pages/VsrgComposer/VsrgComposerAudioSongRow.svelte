<script lang="ts">
  import type { SongStorable, SerializedSong } from '$core/Songs/Song.svelte';
  import { songService } from '$core/Services/SongService';
  import { logger } from '$stores/LoggerStore.svelte';
  import Tooltip from '$cmp/utility/Tooltip.svelte';
  import { hasTooltip } from '$cmp/utility/tooltip';

  let {
    data,
    onClick,
  }: {
    data: SongStorable;
    onClick: (song: SerializedSong) => void;
  } = $props();

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
  class={['song-row', hasTooltip(true)]}
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
