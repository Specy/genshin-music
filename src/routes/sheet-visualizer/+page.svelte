<script lang="ts">
  import { onMount } from 'svelte';
  import { game } from '$game';
  import { ThemeProvider as theme } from '$core/theme/ThemeProvider.svelte';
  import { isComposedOrRecorded } from '$core/utils/Utilities';
  import { songService } from '$core/Services/SongService';
  import { VisualSong } from '$core/Songs/VisualSong';
  import { ComposedSong } from '$core/Songs/ComposedSong.svelte';
  import { RecordedSong } from '$core/Songs/RecordedSong';
  import type { SerializedSong } from '$core/Songs/Song.svelte';
  import type { NoteNameType } from '$lib/games/types';
  import Analytics from '$core/Analytics';
  import { logger } from '$stores/LoggerStore.svelte';
  import { setPageVisited } from '$stores/PageVisitStore.svelte';
  import { settingsService } from '$core/Services/SettingsService';
  import type { SettingUpdate } from '$core/types/SettingsPropriety';
  import { t } from '$i18n/binding.svelte';
  import DefaultPage from '$cmp/shell/DefaultPage.svelte';
  import PageMetadata from '$cmp/shell/PageMetadata.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import SheetVisualizerMenu from '$cmp/pages/SheetVisualizer/SheetVisualizerMenu.svelte';
  import SheetFrame2 from '$cmp/pages/SheetVisualizer/SheetFrame2.svelte';

  let sheet = $state<VisualSong | null>(null);
  let currentSong = $state<SerializedSong | null>(null);
  let songAsText = $state('');
  let ref = $state<HTMLDivElement>();
  // The page's settings, on the app's standard channel: defaults at module load, the persisted
  // ones in onMount (localStorage is not readable during prerender), and every edit written back
  // through handleSettingChange. The five values below are read off this rather than held
  // separately, so there is one source for each.
  let settings = $state(settingsService.getDefaultSheetVisualizerSettings());

  const hasText = $derived(settings.noteNames.value);
  const keyboardLayout = $derived(settings.noteNameType.value);
  const flattenSpaces = $derived(settings.mergeEmptySpaces.value);
  const multiColor = $derived(settings.multiColorRows.value);
  const framesPerRow = $derived(settings.framesPerRow.value);

  onMount(() => {
    settings = settingsService.getSheetVisualizerSettings();
    setPageVisited('sheetVisualizer');
  });

  function handleSettingChange({ key, data }: SettingUpdate) {
    // REFUSED RATHER THAN CLAMPED, and only upward: the frames are laid out by a CSS grid, so how
    // wide each one ends up is a measurement rather than something a threshold can express. This
    // is the guard the old +/- buttons carried - asking for more frames does nothing once the ones
    // on screen are already under 50px - kept here because it is the only place that can see them.
    if (key === 'framesPerRow' && ref) {
      const requested = data.value as number;
      const frame = ref.children[0]?.children[0] as HTMLDivElement | undefined;
      const width = frame?.getBoundingClientRect().width ?? Infinity;
      if (requested > framesPerRow && width < 50) return;
    }
    settings = { ...settings, [key]: { ...settings[key as keyof typeof settings], ...data } };
    settingsService.updateSheetVisualizerSettings(settings);
  }

  function loadSong(song: SerializedSong, layout: NoteNameType) {
    try {
      const temp = songService.parseSong(song);
      const isValid = isComposedOrRecorded(temp);
      if (!isValid) return logger.error(t('sheet_visualizer:invalid_song_to_visualize'));
      try {
        const vs = VisualSong.from(temp, flattenSpaces);
        sheet = vs;
        songAsText = vs.toText(layout);
      } catch (e) {
        console.error(e);
        logger.error(t('sheet_visualizer:error_converting_to_visual_song_try_convert_in_recorded'));
        try {
          const vs = VisualSong.from(
            (temp as RecordedSong | ComposedSong).toRecordedSong(),
            flattenSpaces
          );
          sheet = vs;
          songAsText = vs.toText(layout);
        } catch (e) {
          console.error(e);
          logger.error(t('sheet_visualizer:error_converting_to_visual_song'));
          sheet = null;
          songAsText = '';
        }
      }
    } catch (e) {
      console.error(e);
      logger.error(t('sheet_visualizer:error_converting_to_visual_song'));
    }
    Analytics.songEvent({ type: 'visualize' });
  }

  $effect(() => {
    // QUIRK: void hasText is a deliberate no-op read - it makes this $effect re-fire (and
    // re-send Analytics.songEvent) whenever the note-name-text toggle changes, even though
    // loadSong's own body never reads hasText. Matches old's explicit effect-dependency list.
    // Removing this read would silently fire fewer Analytics events than old did.
    void hasText;
    if (currentSong) loadSong(currentSong, keyboardLayout);
  });

  const pageTitle = $derived(
    `${t('home:sheet_visualizer_name')}${currentSong ? ` - ${currentSong.name}` : ''}`
  );
</script>

<DefaultPage excludeMenu={true} class="page-no-print">
  {#snippet menu()}
    <SheetVisualizerMenu
      class="no-print"
      onSongLoaded={(song) => (currentSong = song)}
      {currentSong}
      {settings}
      onSettingsUpdate={handleSettingChange}
    />
  {/snippet}
  <PageMetadata
    text={pageTitle}
    description="Learn a sheet in a visual way, convert the song into text format or print it as pdf"
  />
  <div style="display:flex;align-items:center;flex-direction:column">
    <h1 class="onprint" style="color:black">
      {game.i18n.interpolation.APP_NAME} Music Nightly
    </h1>
    <h1 class="onprint" style="color:black">
      {currentSong ? currentSong?.name : ''}
    </h1>
    <div style="width:100%" class="noprint">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h2 class="text-ellipsis" style="margin-top:0.8rem">
          {currentSong ? currentSong.name : t('sheet_visualizer:no_song_selected')}
        </h2>
        {#if currentSong}
          <AppButton
            onclick={() => window.print()}
            style="min-width:fit-content;margin-left:0.4rem"
          >
            {t('sheet_visualizer:print_as_pdf')}
          </AppButton>
        {/if}
      </div>
      <div style="color:var(--background-text)">
        {t('sheet_visualizer:sheet_visualizer_instructions')}
      </div>
    </div>
    <div
      class="visualizer-frame-wrapper"
      style="grid-template-columns:repeat({framesPerRow},1fr)"
      bind:this={ref}
    >
      {#if sheet}
        {#each sheet.chunks as chunk, i (i)}
          <SheetFrame2
            {chunk}
            rows={3}
            {theme}
            multiColorRows={multiColor}
            {hasText}
            {keyboardLayout}
          />
        {/each}
      {/if}
    </div>
    {#if songAsText.trim().length > 0}
      <pre class="text-notation-wrapper">{songAsText}</pre>
    {/if}
  </div>
</DefaultPage>

<style>
  /* :global() is required for .page-no-print/.no-print - both are applied via a class prop
       forwarded into CHILD components' own elements (DefaultPage's outer div, and two layers
       deeper, SheetVisualizerMenu -> MenuSidebar's outer div), not elements this file's own
       template renders directly. The other selectors below target elements this file authors
       directly, so they keep normal Svelte scoping. */
  .visualizer-frame-wrapper {
    width: 100%;
    margin-top: 1rem;
    display: grid;
    justify-items: center;
    row-gap: 0.2rem;
    padding-top: 1rem;
    grid-template-columns: repeat(5, 1fr);
    justify-content: center;
  }

  .text-notation-wrapper {
    background-color: var(--primary);
    color: var(--primary-text);
    border-radius: 0.5rem;
    border: solid 1px var(--secondary);
    padding: 1rem;
    width: 100%;
    white-space: pre-wrap;
    -webkit-user-select: text;
    user-select: text;
    cursor: text;
    margin-top: 2rem;
  }

  @media print {
    :global(.page-no-print) {
      padding: 1rem;
    }
    :global(.no-print) {
      display: none;
    }
    .text-notation-wrapper {
      background-color: transparent;
      color: black;
    }
  }
</style>
