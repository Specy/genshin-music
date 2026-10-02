<script module lang="ts">
  export type SearchedSongType = {
    name: string;
    file: string;
    error: string;
  };
</script>

<script lang="ts">
  import { logger } from '$stores/LoggerStore.svelte';
  import { t } from '$i18n/binding.svelte';
  import { convertedSongLostNotes, isForeignSong, songService } from '$core/Services/SongService';
  import { ThemeProvider } from '$core/theme/ThemeProvider.svelte';
  import type { ComposedSong } from '$core/Songs/ComposedSong.svelte';
  import type { RecordedSong } from '$core/Songs/RecordedSong';
  import IconDownload from '~icons/fa6-solid/download';
  import IconSpinner from '~icons/fa6-solid/spinner';

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
  // Answered where the song is PARSED, and kept beside the cache, because a preview populates the
  // cache too: without it, previewing then importing (the natural order on this screen) would
  // import through the early return below and never warn. Plain, not $state - nothing renders it.
  let cacheLostNotes = false;

  async function fetchAndParse() {
    fetching = true;
    try {
      const raw = await fetch(
        'https://sky-music.herokuapp.com/api/songs?get=' + encodeURI(data.file)
      ).then((res) => res.json());
      // This library serves Sky files, so in any other build every download is a conversion — the
      // only import surface that never goes through FileService, hence its own warning.
      const converted = isForeignSong(raw);
      const song = songService.parseSong(raw) as RecordedSong | ComposedSong;
      cacheLostNotes = converted && convertedSongLostNotes(song);
      cache = song;
      return song;
    } finally {
      fetching = false;
    }
  }

  // Raised on IMPORT only: play() converts too, but nothing is stored and the toast would fire
  // again on every preview.
  function warnIfLostNotes() {
    if (cacheLostNotes) logger.warn(t('logs:converted_song_stranded_notes'), 8000);
  }

  async function download() {
    if (fetching) return;
    try {
      if (cache) {
        warnIfLostNotes();
        return importSong(cache.clone());
      }
      const song = await fetchAndParse();
      warnIfLostNotes();
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
      onClick(await fetchAndParse(), 0);
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
        <IconSpinner class="library-song-spinner" />
      {:else}
        <IconDownload />
      {/if}
    </button>
  </div>
</div>

<style>
  /* The icon is a static ring of dots (neither react-icons' FaSpinner nor Font Awesome's own
     spins by itself), so the rotation has to come from CSS. :global() because the class is
     handed to an unplugin-icons component, which puts it on an <svg> belonging to ITS template,
     not this file's - hence the deliberately specific class name. */
  :global(.library-song-spinner) {
    animation: spinner-rotate 1.2s linear infinite;
  }

  @keyframes spinner-rotate {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.library-song-spinner) {
      animation-duration: 3s;
    }
  }
</style>
