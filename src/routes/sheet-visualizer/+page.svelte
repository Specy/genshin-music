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
  const dotColor = $derived(theme.layer('primary', 0.2).toString());
  const rowColors = $derived.by(() => {
    if (!multiColor) return ['var(--accent)', 'var(--accent)', 'var(--accent)'];
    const base = theme.get('accent');
    return [base.hue(90).toString(), base.toString(), base.hue(-30).toString()];
  });

  onMount(() => {
    settings = settingsService.getSheetVisualizerSettings();
    setPageVisited('sheetVisualizer');
  });

  function handleSettingChange({ key, data }: SettingUpdate) {
    // REFUSED RATHER THAN CLAMPED, and only upward: the frames are laid out by a CSS grid, so how
    // wide each one ends up is a measurement rather than something a threshold can express. This
    // is the guard the old +/- buttons carried - asking for more frames does nothing once the ones
    // on screen are already under 50px - kept here because it is the only place that can see them.
    // In portrait the stylesheet holds its own floor (7rem a frame), so the measurement below
    // never falls that far there and this guard simply never fires; the CSS clamp is what stops
    // the frames shrinking instead.
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
      <div class="sheet-header">
        <h2 class="sheet-title text-ellipsis" style="margin-top:0.8rem">
          {currentSong ? currentSong.name : t('sheet_visualizer:no_song_selected')}
        </h2>
        {#if currentSong}
          <!-- The 0.4rem that used to be an inline margin-left is the .sheet-header gap now:
               identical spacing between the two while they sit side by side, and nothing inline
               for the portrait rule (which stacks them) to have to fight with !important. -->
          <AppButton onclick={() => window.print()} style="min-width:fit-content">
            {t('sheet_visualizer:print_as_pdf')}
          </AppButton>
        {/if}
      </div>
      <div style="color:var(--background-text)">
        {t('sheet_visualizer:sheet_visualizer_instructions')}
      </div>
    </div>
    <!-- framesPerRow rides in as a custom property rather than as an inline grid-template-columns,
         so the portrait rule below can restate the track list (clamping how narrow a frame may get)
         from the stylesheet instead of having to outrank an inline declaration. -->
    <div
      class="visualizer-frame-wrapper"
      style="--frames-per-row:{framesPerRow};--sheet-cols:{game.notes
        .perRow};--sheet-dot-color:{dotColor};--sheet-row-color-0:{rowColors[0]};--sheet-row-color-1:{rowColors[1]};--sheet-row-color-2:{rowColors[2]}"
      bind:this={ref}
    >
      {#if sheet}
        {#each sheet.chunks as chunk, i (i)}
          <SheetFrame2 {chunk} rows={3} {hasText} {keyboardLayout} />
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
       template renders directly. The portrait block further down needs it for the same reason on
       two more selectors (AppButton's <button>, SheetFrame2's note squares), each descended from
       a wrapper this file does author so the reach stays inside this page. Everything else here
       targets elements from this file's own template and keeps normal Svelte scoping. */
  .sheet-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.4rem;
  }

  .visualizer-frame-wrapper {
    width: 100%;
    margin-top: 1rem;
    display: grid;
    justify-items: center;
    row-gap: 0.2rem;
    padding-top: 1rem;
    grid-template-columns: repeat(var(--frames-per-row, 5), 1fr);
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

  /* PORTRAIT. A phone held upright is roughly a third as wide as the layout this page was drawn
     for, and the sheet is the page - so the frames are what the rules below are about. Keyed on
     orientation to match the shared shell (which puts the menu on the bottom edge here), not on a
     width: a landscape phone is narrow too but keeps the wide layout. */
  @media screen and (orientation: portrait) {
    /* Title and print button stop competing for one line: the song name gets the full width and
       wraps instead of being cut to "new-format-com...", and the button drops under it. Left
       aligned rather than stretched - printing is a side errand, not the page's main action - and
       grown to a 2.75rem thumb target, since at its natural size it is only 32px tall. */
    .sheet-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .sheet-title {
      white-space: normal;
      overflow: visible;
      overflow-wrap: anywhere;
    }

    /* :global() because the element is AppButton's own <button>, not one this file renders. */
    .sheet-header :global(.app-button) {
      min-height: 2.75rem;
      padding-inline: 1.4rem;
    }

    /* THE FRAME-WIDTH FLOOR. `framesPerRow` is a count, and a count is the wrong unit once the
       row it divides is 361px wide: the default 7 lands each frame at ~50px, where the 7x3 dot
       grid inside it is a smudge and the note names overlap each other. The track list keeps
       asking for the user's count (100% / --frames-per-row) but refuses to go under 7rem, which
       is where a 7-column grid still reads and a note name still fits its dot; auto-fit then
       fits as many of those as the row has room for, so the setting still does something in
       portrait (fewer frames per row = bigger ones) and only its top end is clamped away.
       The outer min(100%, ...) is the guard for a viewport narrower than the floor itself - a
       track wider than the grid would overflow the page sideways. */
    .visualizer-frame-wrapper {
      grid-template-columns: repeat(
        auto-fit,
        minmax(min(100%, max(7rem, calc(100% / var(--frames-per-row, 5)))), 1fr)
      );
    }

    /* The note names are sized for a desktop frame; the portrait ones are wider than that, and
       the text is what a phone reads the sheet by. :global() for the same reason as above - the
       element belongs to SheetFrame2. */
    .visualizer-frame-wrapper :global(.frame-note-s) {
      font-size: 0.7rem;
    }

    /* The text notation wraps on spaces, so it normally fits; a single unbroken run of notes
       longer than the viewport would not, and it scrolls inside its own box rather than taking
       the page sideways with it. */
    .text-notation-wrapper {
      overflow-x: auto;
    }
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
