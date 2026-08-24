<script lang="ts">
  import { onMount } from 'svelte';
  import DefaultPage from '$cmp/shell/DefaultPage.svelte';
  import PageMetadata from '$cmp/shell/PageMetadata.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import SongMenu from '$cmp/SongMenu.svelte';
  import ErrorSongRow from '$cmp/pages/ErrorSongRow.svelte';
  import { songsStore } from '$stores/SongsStore.svelte';
  import { logsStore } from '$stores/LogsStore.svelte';
  import { logger } from '$stores/LoggerStore.svelte';
  import { asyncConfirm } from '$stores/AsyncPromptStore.svelte';
  import { setPageVisited } from '$stores/PageVisitStore.svelte';
  import { fileService } from '$core/Services/FileService';
  import { songService } from '$core/Services/SongService';
  import type { SerializedSong } from '$core/Songs/Song.svelte';
  import { APP_NAME } from '$core/legacyConfig';
  import { t } from '$i18n/binding.svelte';

  onMount(() => {
    setPageVisited('error');
  });

  const deleteSong = async (name: string, id: string) => {
    if (await asyncConfirm(t('confirm:delete_song', { song_name: name }))) {
      await songsStore.removeSong(id);
    }
  };

  const deleteAllSongs = async () => {
    if (await asyncConfirm(t('error:confirm_delete_all_songs'))) {
      await songsStore._DANGEROUS_CLEAR_ALL_SONGS();
    }
  };

  const resetSettings = () => {
    // QUIRK: also removes `${APP_NAME}_Main_Settings`, a key nothing in this app ever writes
    // to - a dead, permanent no-op removeItem. Reproduced byte-for-byte, not "fixed" to
    // whatever the real settings key is.
    localStorage.removeItem(`${APP_NAME}_Composer_Settings`);
    localStorage.removeItem(`${APP_NAME}_Main_Settings`);
    logger.success(t('error:settings_reset_notice'));
  };

  const downloadSong = (song: SerializedSong) => {
    try {
      const songName = song.name;
      const parsed = songService.parseSong(song);
      // Recovery downloads write the current format: the legacy old-format export was retired at
      // ADR-0007 (see ComposedSong's commented block).
      const converted = [parsed.serialize()];
      fileService.downloadSong(converted, `${songName}.${APP_NAME.toLowerCase()}sheet`);
      logger.success(t('logs:song_downloaded'));
    } catch (e) {
      console.error(e);
      logger.error(t('logs:error_downloading_song'));
    }
  };

  function downloadLogs() {
    const logs = logsStore.logs.map((l) => l.message);
    fileService.downloadObject(logs, `${APP_NAME}_logs`);
  }
</script>

<DefaultPage class="error-page">
  <PageMetadata
    text={t('common:error')}
    description="View the errors that happened in the app to send bug reports and to try to recover your songs"
  />
  <div style="text-align:center">
    {t('error:error_page_description')}
    <a href="https://discord.gg/Arsf65YYHq" target="_blank" rel="noreferrer" class="discord-link">
      Discord
    </a>
  </div>
  <div class="error-buttons-wrapper">
    <AppButton onclick={resetSettings}>{t('error:reset_settings')}</AppButton>
    <AppButton onclick={deleteAllSongs}>{t('error:delete_all_songs')}</AppButton>
  </div>
  <div class="error-songs-wrapper">
    <SongMenu
      SongComponent={ErrorSongRow}
      songs={songsStore.songs}
      componentProps={{ deleteSong, download: downloadSong }}
    />
  </div>
  <div class="row space-between error-logs-header" style="margin:1rem 0">
    <div style="font-size:2rem">{t('error:error_logs')}</div>
    <AppButton onclick={downloadLogs}>{t('error:download_logs')}</AppButton>
  </div>
  <div class="error-logs">
    {#each logsStore.logs as log, i (i)}
      <pre class="error-log-row row">{log.message}</pre>
    {/each}
  </div>
</DefaultPage>

<style>
  /* :global() is required for .error-page only - it's applied to DefaultPage's OWN outer
       wrapper via its class prop (foreign element), not this file's own template. The other
       selectors below target elements this file authors directly as DefaultPage's slotted
       children, which keep this file's scoping hash - no :global() needed for those. */
  :global(.error-page) {
    background-color: #863545;
    color: white;
    flex-direction: column;
    justify-content: center;
    padding-top: 10vh;
    overflow-y: auto;
  }

  .error-buttons-wrapper {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    margin-top: 4vh;
  }

  /* Was two inline declarations on the anchor; moved into a class so the portrait query below
     can grow the app's only "get help" link into a real tap target - an inline declaration
     outranks any stylesheet rule short of !important. Both values are unchanged. */
  .discord-link {
    margin: 0 0.4rem;
    color: var(--accent);
  }

  .error-logs {
    display: flex;
    flex-direction: column-reverse;
    padding: 0.5rem;
    background-color: var(--primary);
    color: var(--primary-text);
    border-radius: 0.5rem;
  }

  .error-log-row {
    white-space: pre-wrap;
    border-top: solid 0.1rem var(--secondary);
    padding: 1rem 0.5rem;
    margin: 0;
  }

  .error-log-row:last-child {
    border-top: unset;
  }

  .error-songs-wrapper {
    padding: 0.4rem;
    margin-top: 4vh;
    border-radius: 0.5rem;
    display: grid;
    gap: 0.4rem;
    min-height: 3.6rem;
  }

  /* PORTRAIT ONLY - the landscape layout above is untouched.
     This is the page someone reaches when the app is already broken, so everything on it has
     to be readable and pressable on a phone held upright:
       - a log line is the one piece of content here with no soft break in it (stack frames
         carry a full URL). At 852px wide that fits; at 393 it painted straight off the right
         edge of its own box, unreadable and unreachable, because `pre-wrap` only breaks at
         spaces. Breaking anywhere keeps the whole line on screen, which beats a per-row
         sideways scroll on a phone.
       - the two recovery buttons sat at opposite ends of a `space-between` row, 32px tall.
         An even two-column grid makes them one pair of proper targets.
       - `padding-top: 10vh` is 85px of nothing at the top of a tall, narrow screen.
     The `:global()` rules reach controls that come from shared components (the buttons, and
     the search bar and song rows inside SongMenu). All but one hang off a wrapper this file
     authors, so the selector still carries this file's scoping hash on its left and cannot
     leak; the exception is `.error-page` itself, which is DefaultPage's element and is already
     reached the same bare way by the base rule at the top of this block. */
  @media (orientation: portrait) {
    :global(.error-page) {
      padding-top: 1.5rem;
    }

    .error-log-row {
      overflow-wrap: anywhere;
    }

    /* the one link out of a broken app, so it gets a chip's worth of hit area instead of one
       62x20 word floating at the end of a centred paragraph */
    .discord-link {
      display: inline-block;
      margin: 0.25rem 0.15rem 0;
      padding: 0.4rem 0.7rem;
      border-radius: 0.4rem;
      background-color: var(--primary);
    }

    .error-buttons-wrapper {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
      margin-top: 2rem;
    }

    .error-buttons-wrapper :global(.app-button) {
      min-height: 2.75rem;
      justify-content: center;
      text-align: center;
    }

    .error-songs-wrapper {
      margin-top: 2rem;
    }

    /* SongMenu's search box is a 6rem-capped input sitting in a row of full-width folders -
       fine next to a sidebar, adrift on a phone. It takes the line, and its icon button (a
       1rem square) grows into something a fingertip can hit. */
    .error-songs-wrapper :global(.search) {
      flex: 1;
    }

    .error-songs-wrapper :global(.search input) {
      max-width: none;
      width: 100%;
      /* fill the row the (now larger) icon button sets the height of, so the whole bar is the
         text field's hit area rather than a 31px strip inside it */
      align-self: stretch;
    }

    /* !important is load-bearing: IconButton writes its `size` prop straight onto the element
       as an inline width/height/min-width/min-height, and only !important outranks an inline
       declaration. The alternative is a new size prop threaded through a shared component for
       one page's sake. */
    .error-songs-wrapper :global(.icon-app-button) {
      width: 2.25rem !important;
      height: 2.25rem !important;
      min-width: 2.25rem !important;
      min-height: 2.25rem !important;
    }

    .error-songs-wrapper :global(.song-button) {
      width: 2.5rem;
      height: 2.5rem;
    }

    /* the logs header and its download button stop fighting for one line */
    .error-logs-header {
      flex-wrap: wrap;
      gap: 0.5rem 1rem;
      align-items: center;
    }
  }
</style>
