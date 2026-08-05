<script module lang="ts">
  export type SearchedSongType = {
    name: string;
    file: string;
    error: string;
  };
</script>

<script lang="ts">
  import { logger } from '$stores/LoggerStore.svelte';
  import { songService } from '$core/Services/SongService';
  import { ThemeProvider } from '$core/theme/ThemeProvider.svelte';
  import type { ComposedSong } from '$core/Songs/ComposedSong';
  import type { RecordedSong } from '$core/Songs/RecordedSong';

  // CSS (.song-row/.song-name/.song-buttons-wrapper/.song-button) lives in
  // global App.css; the only local rule is the spinner's rotation below.
  //
  // QUIRK: aria-label below and the two logger.error() messages are
  // hardcoded English, never run through i18n - a pre-existing gap, not
  // something to translate as a "fix".
  let {
    onClick,
    importSong,
    data,
  }: {
    onClick: (song: ComposedSong | RecordedSong, start: number) => void;
    importSong: (song: ComposedSong | RecordedSong) => void;
    data: SearchedSongType;
  } = $props();

  let fetching = $state(false);
  let cache: RecordedSong | ComposedSong | null = $state(null);

  async function download() {
    if (fetching) return;
    try {
      if (cache) return importSong(cache.clone());
      fetching = true;
      let song = await fetch(
        'https://sky-music.herokuapp.com/api/songs?get=' + encodeURI(data.file)
      ).then((res) => res.json());
      fetching = false;
      song = songService.parseSong(song);
      cache = song;
      importSong(song);
    } catch (e) {
      fetching = false;
      console.error(e);
      logger.error('Error downloading song');
    }
  }

  async function play() {
    if (fetching) return;
    try {
      if (cache) return onClick(cache, 0);
      fetching = true;
      let song = await fetch(
        'https://sky-music.herokuapp.com/api/songs?get=' + encodeURI(data.file)
      ).then((res) => res.json());
      fetching = false;
      song = songService.parseSong(song);
      onClick(song, 0);
      cache = song;
    } catch (e) {
      console.error(e);
      fetching = false;
      logger.error('Error downloading song');
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    play();
  }
</script>

{#snippet downloadIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M216 0h80c13.3 0 24 10.7 24 24v168h87.7c17.8 0 26.7 21.5 14.1 34.1L269.7 378.3c-7.5 7.5-19.8 7.5-27.3 0L90.1 226.1c-12.6-12.6-3.7-34.1 14.1-34.1H192V24c0-13.3 10.7-24 24-24zm296 376v112c0 13.3-10.7 24-24 24H24c-13.3 0-24-10.7-24-24V376c0-13.3 10.7-24 24-24h146.7l49 49c20.1 20.1 52.5 20.1 72.6 0l49-49H488c13.3 0 24 10.7 24 24zm-124 88c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20zm64 0c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20z"
    /></svg
  >
{/snippet}

{#snippet spinnerIcon()}
  <svg
    class="spinner"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M304 48c0 26.51-21.49 48-48 48s-48-21.49-48-48 21.49-48 48-48 48 21.49 48 48zm-48 368c-26.51 0-48 21.49-48 48s21.49 48 48 48 48-21.49 48-48-21.49-48-48-48zm208-208c-26.51 0-48 21.49-48 48s21.49 48 48 48 48-21.49 48-48-21.49-48-48-48zM96 256c0-26.51-21.49-48-48-48S0 229.49 0 256s21.49 48 48 48 48-21.49 48-48zm12.922 99.078c-26.51 0-48 21.49-48 48s21.49 48 48 48 48-21.49 48-48c0-26.509-21.491-48-48-48zm294.156 0c-26.51 0-48 21.49-48 48s21.49 48 48 48 48-21.49 48-48c0-26.509-21.49-48-48-48zM108.922 60.922c-26.51 0-48 21.49-48 48s21.49 48 48 48 48-21.49 48-48-21.491-48-48-48z"
    /></svg
  >
{/snippet}

<div class="song-row">
  <div class="song-name" onclick={play} onkeydown={handleKeydown} role="button" tabindex="0">
    {data.name}
  </div>
  <div class="song-buttons-wrapper">
    <button
      class="song-button"
      onclick={download}
      aria-label={`Import song ${data.name}`}
      style="background-color:{ThemeProvider.layer('primary', 0.2).hex()};margin-right:0"
    >
      {#if fetching}
        {@render spinnerIcon()}
      {:else}
        {@render downloadIcon()}
      {/if}
    </button>
  </div>
</div>

<style>
  /* the icon is a static ring of dots (react-icons' FaSpinner never span itself), so the
     rotation has to come from CSS */
  .spinner {
    animation: spinner-rotate 1.2s linear infinite;
  }

  @keyframes spinner-rotate {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation-duration: 3s;
    }
  }
</style>
