<script lang="ts">
  import { onMount } from 'svelte';
  import { isMobile } from 'is-mobile';
  import Analytics from '$core/Analytics';
  import { homeStore } from '$stores/HomeStore.svelte';
  import { logger } from '$stores/LoggerStore.svelte';
  import { songsStore } from '$stores/SongsStore.svelte';
  import { folderStore } from '$stores/FoldersStore.svelte';
  import { globalConfigStore } from '$stores/GlobalConfigStore.svelte';
  import { asyncConfirm, asyncPrompt } from '$stores/AsyncPromptStore.svelte';
  import { setPendingMidiImport } from '$stores/PendingMidiImportStore';
  import { fileService } from '$core/Services/FileService';
  import { KeyboardProvider } from '$lib/providers/KeyboardProvider';
  import { clickOutside } from '$lib/utils/clickOutside';
  import { createMediaQuery } from '$lib/utils/mediaQuery.svelte';
  import { COMPOSER_DESKTOP_MEDIA_QUERY } from './composerCanvasGeometry';
  import { isAudioFormat, isMidiFormat, isVideoFormat } from '$core/utils/Utilities';
  import type { SerializedSong, SongType } from '$core/Songs/Song.svelte';
  import type { ComposerSettingsDataType } from '$core/BaseSettings';
  import type { SettingUpdate, SettingVolumeUpdate } from '$core/types/SettingsPropriety';
  import { t } from '$i18n/binding.svelte';
  import MenuSidebar from '$cmp/menu/MenuSidebar.svelte';
  import MenuItem from '$cmp/menu/MenuItem.svelte';
  import MenuButton from '$cmp/menu/MenuButton.svelte';
  import MenuPanel from '$cmp/menu/MenuPanel.svelte';
  import MenuPanelWrapper from '$cmp/menu/MenuPanelWrapper.svelte';
  import SongMenu from '$cmp/SongMenu.svelte';
  import ComposerSongRow from './ComposerSongRow.svelte';
  import SettingsPane from '$cmp/settings/SettingsPane.svelte';
  import Separator from '$cmp/Separator.svelte';
  import LanguageSelector from '$cmp/i18n/LanguageSelector.svelte';
  import AppLink from '$cmp/AppLink.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import FilePicker, { type FileElement } from '$cmp/inputs/FilePicker.svelte';
  import IconUpload from '~icons/fa6-solid/upload';
  import IconPlus from '~icons/fa6-solid/plus';
  import HelpTooltip from '$cmp/utility/HelpTooltip.svelte';
  import DonateButton from '$cmp/DonateButton.svelte';

  let {
    data,
    functions,
    inPreview = false,
    onPanelOpenChange,
  }: {
    data: {
      settings: ComposerSettingsDataType;
      hasChanges: boolean;
      // the id of the song open in the composer (null while it is unsaved), so its row in the
      // song list can show it is the one being edited
      currentSongId: string | null;
    };
    functions: {
      loadSong: (song: SerializedSong) => void;
      renameSong: (newName: string, id: string) => void;
      downloadSong: (song: SerializedSong, as: 'song' | 'midi') => void;
      exportSongAudio: (song: SerializedSong) => void;
      exportCurrentSongAudio: () => void;
      createNewSong: () => void;
      changePage: (page: string) => void;
      updateThisSong: () => void;
      handleSettingChange: (data: SettingUpdate) => void;
      changeVolume: (data: SettingVolumeUpdate) => void;
      changeMidiVisibility: (visible: boolean) => void;
    };
    inPreview?: boolean;
    /**
     * WHETHER A CLICK OUTSIDE THIS MENU IS NOW A DISMISSAL - the predicate the clickOutside action
     * below runs on, published so the composer can decline to ALSO treat that click as an edit.
     * Reported rather than asked for, because the condition is made of this component's own state.
     */
    onPanelOpenChange?: (open: boolean) => void;
  } = $props();

  const excludedSongs: SongType[] = ['vsrg'];

  // THE SIDEBAR IS A COLUMN OF THE PAGE ON DESKTOP, not something the user opens. Above
  // COMPOSER_MOBILE_MAX_WIDTH App.css pushes `.composer-grid` clear of the strip and hides both
  // controls that used to toggle it (the hamburger and the close button), so the only thing left to
  // open and close there is the sliding panel. Below it nothing changes: the strip still starts
  // hidden behind the hamburger, which is what a phone has room for.
  //
  // `inPreview` opts /theme's composer preview out. That is a small box inside a scrolling page
  // rather than the composer route, and it keeps its own hamburger - the same exclusion
  // `.canvas-wrapper-in-preview` and composerCanvasCssSize already make.
  const desktopLayout = createMediaQuery(COMPOSER_DESKTOP_MEDIA_QUERY);
  const isSidebarPinned = $derived(desktopLayout.matches && !inPreview);

  let isOpen = $state(false);
  /** The strip's own state, consulted only while the sidebar is NOT pinned. */
  let isStripVisible = $state(false);
  const isVisible = $derived(isSidebarPinned || isStripVisible);
  let selectedMenu = $state('Settings');
  let wrapperEl: HTMLDivElement | undefined = $state();

  /**
   * WHEN AN OUTSIDE CLICK MEANS "PUT THIS AWAY" - the one expression, read both by the clickOutside
   * action below and by whoever this component reports it to. Not two spellings of "the menu is
   * open": a consumer that guessed the condition from `isOpen` alone would disagree with the menu
   * about which clicks are dismissals, and the composer suppresses note edits on exactly those.
   */
  const dismissesOutsideClicks = $derived(isOpen && isVisible);

  //REPORTED FROM THE PREDICATE and not from the writes that move it: `isOpen`, `isStripVisible` and
  //the media query behind `isSidebarPinned` all feed it from different places (setVisible, the
  //sidebar's setOpen, the panel's own buttons), so notifying at each write is a list that the next
  //new write site silently drops off.
  $effect(() => {
    onPanelOpenChange?.(dismissesOutsideClicks);
  });

  /**
   * EVERY "hide the menu" PATH GOES THROUGH HERE - the close button, Escape, click-outside, and the
   * song/MIDI actions that dismiss the menu once they have done their work.
   *
   * While the sidebar is pinned there is no hiding the strip, so the request lands on the sliding
   * panel instead: that is the thing actually covering the composer, and it is what every one of
   * those call sites wanted gone.
   */
  function setVisible(visible: boolean) {
    if (!isSidebarPinned) {
      isStripVisible = visible;
      return;
    }
    if (!visible) isOpen = false;
  }

  $effect(() => {
    if (!wrapperEl) return;
    const action = clickOutside(wrapperEl, {
      active: dismissesOutsideClicks,
      ignoreFocusable: true,
      onOutside: () => {
        // On mobile this closes only the panel (isVisible), leaving the hamburger
        // sidebar open; on desktop it closes the whole sidebar (isOpen). With the sidebar
        // pinned the mobile branch lands on the panel too - see setVisible - which is what
        // keeps a UA-mobile tablet wide enough for the desktop layout from being left with an
        // open panel it just asked to dismiss.
        if (isMobile()) {
          setVisible(false);
        } else {
          isOpen = false;
        }
      },
    });
    return () => action.destroy?.();
  });

  onMount(() => {
    // Hardcoded key, not routed through createShortcutListener - unlike this codebase's other
    // shortcut registrations, this one is not user-rebindable.
    KeyboardProvider.register(
      'Escape',
      () => {
        setVisible(false);
      },
      { id: 'composer_menu' }
    );
    return () => KeyboardProvider.unregisterById('composer_menu');
  });

  function toggleMenu(override?: boolean) {
    setVisible(override !== undefined ? override : !isVisible);
  }

  async function removeSong(name: string, id: string) {
    const confirm = await asyncConfirm(t('confirm:delete_song', { song_name: name }));
    if (confirm) {
      await songsStore.removeSong(id);
      Analytics.userSongs('delete', { page: 'composer' });
    }
  }

  async function createFolder() {
    const name = await asyncPrompt(t('question:enter_folder_name'));
    if (!name) return;
    folderStore.createFolder(name);
  }

  async function importFile(files: FileElement<SerializedSong[] | SerializedSong>[]) {
    for (const file of files) {
      try {
        const songs = Array.isArray(file.data) ? file.data : [file.data];
        await fileService.importAndLog(songs);
      } catch (e) {
        console.error(e);
        if (e) console.error(e);
        logger.error(t('logs:error_importing_invalid_format'), 8000);
      }
    }
  }

  function jsonImportError(e: unknown, files: File[]) {
    if (e) console.error(e);
    if (files.length > 0) {
      const file = files[0];
      const name = file.name;
      if (!isMidiFormat(name) && !isVideoFormat(name) && !isAudioFormat(name))
        return logger.error(t('composer:error_importing_file_invalid_format'), 8000);
      // Carry the file over instead of making the user pick it again inside the importer; the
      // importer takes it while opening, so this must be set BEFORE changeMidiVisibility. The
      // hand-off is silent: the importer opens with the file already in it, so there is nothing
      // to tell the user to do.
      setPendingMidiImport(file);
      functions.changeMidiVisibility(true);
      toggleMenu();
    } else {
      logger.error(t('composer:error_importing_file_invalid_format_audio_video'), 8000);
    }
  }
</script>

{#snippet faBarsIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M16 132h416c8.837 0 16-7.163 16-16V76c0-8.837-7.163-16-16-16H16C7.163 60 0 67.163 0 76v40c0 8.837 7.163 16 16 16zm0 160h416c8.837 0 16-7.163 16-16v-40c0-8.837-7.163-16-16-16H16c-8.837 0-16 7.163-16 16v40c0 8.837 7.163 16 16 16zm0 160h416c8.837 0 16-7.163 16-16v-40c0-8.837-7.163-16-16-16H16c-8.837 0-16 7.163-16 16v40c0 8.837 7.163 16 16 16z"
    /></svg
  >
{/snippet}

{#snippet faTimesIcon()}
  <svg
    class="icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 352 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"
    /></svg
  >
{/snippet}

{#snippet faSaveIcon()}
  <svg
    class="icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M433.941 129.941l-83.882-83.882A48 48 0 0 0 316.118 32H48C21.49 32 0 53.49 0 80v352c0 26.51 21.49 48 48 48h352c26.51 0 48-21.49 48-48V163.882a48 48 0 0 0-14.059-33.941zM224 416c-35.346 0-64-28.654-64-64 0-35.346 28.654-64 64-64s64 28.654 64 64c0 35.346-28.654 64-64 64zm96-304.52V212c0 6.627-5.373 12-12 12H76c-6.627 0-12-5.373-12-12V108c0-6.627 5.373-12 12-12h228.52c3.183 0 6.235 1.264 8.485 3.515l3.48 3.48A11.996 11.996 0 0 1 320 111.48z"
    /></svg
  >
{/snippet}

{#snippet faMusicIcon()}
  <svg
    class="icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M470.38 1.51L150.41 96A32 32 0 0 0 128 126.51v261.41A139 139 0 0 0 96 384c-53 0-96 28.66-96 64s43 64 96 64 96-28.66 96-64V214.32l256-75v184.61a138.4 138.4 0 0 0-32-3.93c-53 0-96 28.66-96 64s43 64 96 64 96-28.65 96-64V32a32 32 0 0 0-41.62-30.49z"
    /></svg
  >
{/snippet}

{#snippet faCogIcon()}
  <svg
    class="icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M487.4 315.7l-42.6-24.6c4.3-23.2 4.3-47 0-70.2l42.6-24.6c4.9-2.8 7.1-8.6 5.5-14-11.1-35.6-30-67.8-54.7-94.6-3.8-4.1-10-5.1-14.8-2.3L380.8 110c-17.9-15.4-38.5-27.3-60.8-35.1V25.8c0-5.6-3.9-10.5-9.4-11.7-36.7-8.2-74.3-7.8-109.2 0-5.5 1.2-9.4 6.1-9.4 11.7V75c-22.2 7.9-42.8 19.8-60.8 35.1L88.7 85.5c-4.9-2.8-11-1.9-14.8 2.3-24.7 26.7-43.6 58.9-54.7 94.6-1.7 5.4.6 11.2 5.5 14L67.3 221c-4.3 23.2-4.3 47 0 70.2l-42.6 24.6c-4.9 2.8-7.1 8.6-5.5 14 11.1 35.6 30 67.8 54.7 94.6 3.8 4.1 10 5.1 14.8 2.3l42.6-24.6c17.9 15.4 38.5 27.3 60.8 35.1v49.2c0 5.6 3.9 10.5 9.4 11.7 36.7 8.2 74.3 7.8 109.2 0 5.5-1.2 9.4-6.1 9.4-11.7v-49.2c22.2-7.9 42.8-19.8 60.8-35.1l42.6 24.6c4.9 2.8 11 1.9 14.8-2.3 24.7-26.7 43.6-58.9 54.7-94.6 1.5-5.5-.7-11.3-5.6-14.1zM256 336c-44.1 0-80-35.9-80-80s35.9-80 80-80 80 35.9 80 80-35.9 80-80 80z"
    /></svg
  >
{/snippet}

{#snippet faHomeIcon()}
  <svg
    class="icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 576 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M280.37 148.26L96 300.11V464a16 16 0 0 0 16 16l112.06-.29a16 16 0 0 0 15.92-16V368a16 16 0 0 1 16-16h64a16 16 0 0 1 16 16v95.64a16 16 0 0 0 16 16.05L464 480a16 16 0 0 0 16-16V300L295.67 148.26a12.19 12.19 0 0 0-15.3 0zM571.6 251.47L488 182.56V44.05a12 12 0 0 0-12-12h-56a12 12 0 0 0-12 12v72.61L318.47 43a48 48 0 0 0-61 0L4.34 251.47a12 12 0 0 0-1.6 16.9l25.5 31A12 12 0 0 0 45.15 301l235.22-193.74a12.19 12.19 0 0 1 15.3 0L530.9 301a12 12 0 0 0 16.9-1.6l25.5-31a12 12 0 0 0-1.7-16.93z"
    /></svg
  >
{/snippet}

<!-- `composer-menu-sidebar` is what App.css's desktop block hangs the pinned sidebar off: it pins
     the strip open and hides the hamburger and the close button below. Dropped in preview, so
     /theme's composer keeps the hamburger it has always had - the class going missing IS the
     exclusion here, where the shared `.menu`/`.hamburger` class names leave nothing else to
     select on. -->
<MenuSidebar
  bind:wrapperEl
  class={inPreview ? '' : 'composer-menu-sidebar'}
  style={inPreview ? 'position:absolute' : ''}
  current={selectedMenu}
  setCurrent={(c) => (selectedMenu = c)}
  open={isOpen}
  setOpen={(o) => (isOpen = o)}
  visible={isVisible}
  {setVisible}
>
  {#snippet hamburger()}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="hamburger" onclick={() => setVisible(!isVisible)}>
      {@render faBarsIcon()}
    </div>
  {/snippet}
  <MenuButton onclick={() => toggleMenu()} class="close-menu" ariaLabel={t('menu:close_menu')}>
    {@render faTimesIcon()}
  </MenuButton>
  <MenuButton
    onclick={functions.updateThisSong}
    class={data.hasChanges ? 'not-saved' : ''}
    ariaLabel="Save"
    style="margin-top:auto"
  >
    {@render faSaveIcon()}
  </MenuButton>
  <MenuItem id="Songs" ariaLabel={t('menu:open_songs_menu')}>
    {@render faMusicIcon()}
  </MenuItem>
  <MenuItem id="Settings" ariaLabel={t('menu:open_settings_menu')}>
    {@render faCogIcon()}
  </MenuItem>
  <MenuButton
    onclick={() => homeStore.open()}
    ariaLabel="Open home menu"
    style="border:solid 0.1rem var(--secondary)"
  >
    {@render faHomeIcon()}
  </MenuButton>

  {#snippet panel()}
    <MenuPanelWrapper style={inPreview ? 'position:absolute' : ''}>
      <MenuPanel id="Songs">
        <div class="songs-buttons-wrapper">
          <HelpTooltip>
            <ul>
              <li>{t('tutorials:composer.li_1')}</li>
              <li>{t('tutorials:composer.li_2')}</li>
              <li>{t('tutorials:composer.li_3')}</li>
              <li>{t('tutorials:composer.li_4')}</li>
              <li>{t('tutorials:composer.li_5')}</li>
              <li>{t('tutorials:composer.li_6')}</li>
            </ul>
          </HelpTooltip>
          <AppButton
            onclick={() => {
              functions.changeMidiVisibility(true);
              toggleMenu();
            }}
            style="margin-left:auto"
          >
            {t('composer:create_from_midi_or_audio')}
          </AppButton>
          <AppButton onclick={functions.createNewSong}>
            {#snippet icon()}
              <IconPlus />
            {/snippet}
            {t('composer:create_new_song')}
          </AppButton>
        </div>
        <!-- functions.loadSong/.downloadSong/.renameSong are read inline here, not
                     destructured into a top-level const: that would only capture $props()'s
                     initial functions reference and go stale on later updates. -->
        <SongMenu
          songs={songsStore.songs}
          exclude={excludedSongs}
          SongComponent={ComposerSongRow}
          style="margin-top:0.6rem"
          onCreateFolder={createFolder}
          componentProps={{
            folders: folderStore.folders,
            currentSongId: data.currentSongId,
            functions: {
              loadSong: functions.loadSong,
              removeSong,
              toggleMenu,
              downloadSong: functions.downloadSong,
              exportSongAudio: functions.exportSongAudio,
              renameSong: functions.renameSong,
            },
          }}
        >
          {#snippet importButton()}
            <FilePicker onPick={importFile} onError={jsonImportError} as="json" multiple={true}>
              <AppButton>
                {#snippet icon()}
                  <IconUpload />
                {/snippet}
                {t('menu:import_song_sheet')}
              </AppButton>
            </FilePicker>
          {/snippet}
        </SongMenu>
        <div class="songs-buttons-wrapper" style="margin-top:auto">
          <!-- Closing the panel is still worth doing (the format dialog would otherwise open over
               an open menu), but not behind a timer any more: the old recorder waited 300 ms so
               the panel had finished sliding away before it started capturing the performance,
               and an offline render has nothing to be disturbed by. -->
          <AppButton
            style="margin-top:0.5rem;width:fit-content"
            onclick={() => {
              isOpen = false;
              functions.exportCurrentSongAudio();
            }}
          >
            {t('composer:export_audio')}
          </AppButton>
        </div>
      </MenuPanel>
      <MenuPanel id="Settings">
        <SettingsPane
          settings={data.settings}
          onUpdate={functions.handleSettingChange}
          changeVolume={functions.changeVolume}
        />
        <Separator background="var(--secondary)" height="0.1rem" verticalMargin="0.5rem" />
        <div class="settings-row-wrap">
          {#if globalConfigStore.state.IS_MIDI_AVAILABLE}
            <AppLink href="/keybinds">
              <AppButton style="width:fit-content">
                {t('menu:connect_midi_keyboard')}
              </AppButton>
            </AppLink>
          {/if}
          <AppLink href="/theme" onclick={(e) => e.preventDefault()}>
            <AppButton onclick={() => functions.changePage('theme')} style="width:fit-content">
              {t('menu:change_app_theme')}
            </AppButton>
          </AppLink>
          <LanguageSelector />
        </div>
        <DonateButton />
      </MenuPanel>
    </MenuPanelWrapper>
  {/snippet}
</MenuSidebar>
