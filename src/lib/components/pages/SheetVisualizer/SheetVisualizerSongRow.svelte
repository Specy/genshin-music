<script lang="ts">
  import type { SerializedSong, SongStorable } from '$core/Songs/Song.svelte';
  import { songService } from '$core/Services/SongService';
  import { logger } from '$stores/LoggerStore.svelte';
  import { t } from '$i18n/binding.svelte';

  // .song-row/.song-name are styled globally in App.css; no component-local <style> needed here.
  let {
    data,
    current,
    onClick,
  }: {
    data: SongStorable;
    current: SerializedSong | null;
    onClick: (song: SerializedSong) => void;
  } = $props();

  const selectedStyle = $derived(
    current?.id === data.id ? 'background-color:rgb(124, 116, 106);' : ''
  );

  async function handleClick() {
    logger.showPill(t('logs:loading_song'), { spinner: true });
    const song = await songService.getOneSerializedFromStorable(data);
    if (!song) return logger.error(t('logs:could_not_load_song'));
    onClick(song);
    setTimeout(() => logger.hidePill(), 300);
  }

  // role/tabindex/onkeydown below make this keyboard-operable (a div has no native button
  // semantics) - an accessibility addition, not present in old.
  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    handleClick();
  }
</script>

<div
  class="song-row"
  style="{selectedStyle}padding:0.5rem 0.8rem"
  onclick={handleClick}
  onkeydown={handleKeydown}
  role="button"
  tabindex="0"
>
  <div class="song-name">{data.name}</div>
</div>
