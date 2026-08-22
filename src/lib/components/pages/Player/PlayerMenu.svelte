<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import type { Midi } from '@tonejs/midi';
  import { APP_NAME } from '$core/legacyConfig';
  import Analytics from '$core/Analytics';
  import { playerStore } from '$stores/PlayerStore.svelte';
  import { homeStore } from '$stores/HomeStore.svelte';
  import { logger } from '$stores/LoggerStore.svelte';
  import { songsStore } from '$stores/SongsStore.svelte';
  import { folderStore } from '$stores/FoldersStore.svelte';
  import { globalConfigStore } from '$stores/GlobalConfigStore.svelte';
  import { createShortcutListener } from '$stores/KeybindsStore.svelte';
  import { asyncConfirm, asyncPrompt } from '$stores/AsyncPromptStore.svelte';
  import { settingsService } from '$core/Services/SettingsService';
  import { fileService } from '$core/Services/FileService';
  import { songService } from '$core/Services/SongService';
  import { _folderService } from '$core/Services/FolderService';
  import { ThemeProvider } from '$core/theme/ThemeProvider.svelte';
  import { ComposedSong } from '$core/Songs/ComposedSong.svelte';
  import { RecordedSong } from '$core/Songs/RecordedSong';
  import type { SerializedSong, SongStorable, SongType } from '$core/Songs/Song.svelte';
  import type { SettingUpdate, SettingVolumeUpdate } from '$core/types/SettingsPropriety';
  import type { PlayerSettingsDataType } from '$core/BaseSettings';
  import { isAudioFormat, isMidiFormat, isVideoFormat } from '$core/utils/Utilities';
  import { clickOutside } from '$lib/utils/clickOutside';
  import { t } from '$i18n/binding.svelte';
  import MenuSidebar from '$cmp/menu/MenuSidebar.svelte';
  import MenuItem from '$cmp/menu/MenuItem.svelte';
  import MenuButton from '$cmp/menu/MenuButton.svelte';
  import MenuPanel from '$cmp/menu/MenuPanel.svelte';
  import MenuPanelWrapper from '$cmp/menu/MenuPanelWrapper.svelte';
  import SongMenu from '$cmp/SongMenu.svelte';
  import PlayerSongRow, { type RecordedOrComposed } from './PlayerSongRow.svelte';
  import SettingsPane from '$cmp/settings/SettingsPane.svelte';
  import Separator from '$cmp/Separator.svelte';
  import LanguageSelector from '$cmp/i18n/LanguageSelector.svelte';
  import AppLink from '$cmp/AppLink.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import FilePicker, { type FileElement } from '$cmp/inputs/FilePicker.svelte';
  import IconUpload from '~icons/fa6-solid/upload';
  //the composer's own icon, and the same one the Home menu's composer card wears
  //(Home.svelte's `faCompactDiscIcon`) - this button goes to the same place, so it says so
  //with the same glyph
  import IconCompactDisc from '~icons/fa6-solid/compact-disc';
  import HelpTooltip from '$cmp/utility/HelpTooltip.svelte';
  import Tooltip from '$cmp/utility/Tooltip.svelte';
  import { hasTooltip } from '$cmp/utility/tooltip';
  import HelpTab from '$cmp/pages/HelpTab/HelpTab.svelte';
  import PlayerShortcuts from '$cmp/pages/HelpTab/PlayerShortcuts.svelte';
  import ComposerShortcuts from '$cmp/pages/HelpTab/ComposerShortcuts.svelte';
  import DonateButton from '$cmp/DonateButton.svelte';
  import LibrarySearchedSong, { type SearchedSongType } from '$cmp/LibrarySearchedSong.svelte';

  type MenuFunctions = {
    addSong: (song: RecordedSong | ComposedSong) => void;
    removeSong: (name: string, id: string) => void;
    renameSong: (newName: string, id: string) => void;
    handleSettingChange: (override: SettingUpdate) => void;
    changeVolume: (override: SettingVolumeUpdate) => void;
    exportSongAudio: (song: SongStorable) => void;
  };

  let {
    functions,
    data,
    inPreview = false,
  }: {
    functions: MenuFunctions;
    data: { settings: PlayerSettingsDataType };
    inPreview?: boolean;
  } = $props();

  const excludedSongs: SongType[] = ['vsrg'];

  // functions.xxx is read inline at each call site (not destructured into local consts at setup
  // time): a top-level destructure of a $props() field only captures its initial value, so it
  // would go stale if the parent later passes new functions. Same reasoning in PlayerSongRow.svelte.

  let isOpen = $state(false);
  let selectedMenu = $state('Songs');
  let searchInput = $state('');
  let searchedSongs: SearchedSongType[] = $state([]);
  let searchStatus = $state('');
  let isPersistentStorage = $state(false);
  let wrapperEl: HTMLDivElement | undefined = $state();

  $effect(() => {
    if (!wrapperEl) return;
    const action = clickOutside(wrapperEl, {
      active: isOpen,
      ignoreFocusable: true,
      onOutside: () => {
        isOpen = false;
      },
    });
    return () => action.destroy?.();
  });

  onMount(() => {
    async function checkStorage() {
      if (navigator.storage && navigator.storage.persist) {
        let persisted = await navigator.storage.persisted();
        if (!persisted) persisted = await navigator.storage.persist();
        isPersistentStorage = persisted;
      }
    }

    checkStorage();
    return createShortcutListener('player', 'player_menu', ({ shortcut }) => {
      const { name } = shortcut;
      if (name === 'close_menu') isOpen = false;
      if (name === 'toggle_menu') isOpen = !isOpen;
    });
  });

  function clearSearch() {
    searchInput = '';
    searchStatus = '';
    searchedSongs = [];
  }

  async function searchSongs() {
    if (searchStatus === 'Searching...') return;
    if (searchInput.trim().length === 0) {
      searchStatus = t('logs:no_empty_name');
      return;
    }
    searchStatus = 'Searching...';
    const fetchedSongs = await fetch(
      'https://sky-music.herokuapp.com/api/songs?search=' + encodeURI(searchInput)
    ).then((res) => res.json());
    if (fetchedSongs.error) {
      searchStatus = t('logs:no_empty_name');
      logger.error(fetchedSongs.error);
      return;
    }
    searchStatus = 'success';
    searchedSongs = fetchedSongs as SearchedSongType[];
    Analytics.songSearch({ name: searchInput });
  }

  function toggleMenu(override?: boolean | null) {
    if (typeof override !== 'boolean') override = null;
    isOpen = override !== null ? override : !isOpen;
  }

  async function importSong(files: FileElement<SerializedSong[] | SerializedSong>[]) {
    for (const file of files) {
      try {
        const songs = Array.isArray(file.data) ? file.data : [file.data];
        await fileService.importAndLog(songs);
      } catch (e) {
        console.error(e);
        logger.error(t('logs:error_importing_file_generic'), 8000);
      }
    }
  }

  async function downloadSong(song: RecordedOrComposed | Midi) {
    if (!(song instanceof RecordedSong) && !(song instanceof ComposedSong)) {
      const agrees = await asyncConfirm(t('menu:midi_download_warning'));
      if (!agrees) return;
      fileService.downloadMidi(song);
      return;
    }
    const songName = song.name;
    // Downloads write the current format. The legacy old-format export was retired at ADR-0007
    // (it cannot state an absolute Note Number) and its producer is kept, commented, in
    // ComposedSong/RecordedSong — old-format files still IMPORT fine.
    const converted = [song.serialize()];
    fileService.downloadSong(converted, `${songName}.${APP_NAME.toLowerCase()}sheet`);
    logger.success(t('logs:song_downloaded'));
    Analytics.userSongs('download', { page: 'player' });
  }

  async function createFolder() {
    const name = await asyncPrompt(t('question:enter_folder_name'));
    if (!name) return;
    folderStore.createFolder(name);
  }

  async function askForComposerImport(file: File) {
    const fileName = file.name || 'unknown';
    if (isAudioFormat(fileName) || isVideoFormat(fileName) || isMidiFormat(fileName)) {
      const confirmed = await asyncConfirm(t('player:midi_or_audio_import_redirect_warning'));
      if (confirmed) {
        await goto(resolve('/composer?showMidi=true'));
      }
    } else {
      logger.error(t('logs:error_importing_invalid_format'), 8000);
    }
  }

  async function jsonImportError(error?: unknown, files?: File[]) {
    if (error) console.error(error);
    if (files) {
      const first = files[0];
      if (first) return askForComposerImport(first);
      logger.error(t('logs:error_importing_invalid_format'), 8000);
    } else {
      logger.error(t('logs:error_importing_invalid_format'), 8000);
    }
  }

  async function downloadAllSongs() {
    try {
      const songs = await songService.getSongs();
      // Backups carry the current format, same as single-song downloads: the legacy old-format
      // export was retired at ADR-0007 (see ComposedSong's commented block).
      const toDownload = songs.map((song) => songService.parseSong(song).serialize());
      const date = new Date().toISOString().split('T')[0];
      const folders = await _folderService.getFolders();
      const files = [...folders, ...toDownload];
      if (files.length === 0) {
        logger.warn(t('logs:no_songs_to_backup'));
        return;
      }
      fileService.downloadFiles(
        files,
        `${APP_NAME}_Backup_${date}.${APP_NAME.toLowerCase()}backup`
      );
      logger.success(t('logs:song_backup_downloaded'));
      settingsService.setLastBackupWarningTime(Date.now());
    } catch (e) {
      console.error(e);
      logger.error(t('logs:error_downloading_songs'));
    }
  }

  const layer1Color = $derived(ThemeProvider.layer('menu_background', 0.35).lighten(0.2));
  const layer2Color = $derived(ThemeProvider.layer('menu_background', 0.32).desaturate(0.4));
  const layer1ColorText = $derived(ThemeProvider.getTextColorFromBackground(layer1Color));
  const layer2ColorText = $derived(ThemeProvider.getTextColorFromBackground(layer2Color));
</script>

{#snippet faTimesCloseIcon()}
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

{#snippet faTimesIcon()}
  <svg
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

{#snippet faQuestionIcon()}
  <svg
    class="icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 384 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M202.021 0C122.202 0 70.503 32.703 29.914 91.026c-7.363 10.58-5.093 25.086 5.178 32.874l43.138 32.709c10.373 7.865 25.132 6.026 33.253-4.148 25.049-31.381 43.63-49.449 82.757-49.449 30.764 0 68.816 19.799 68.816 49.631 0 22.552-18.617 34.134-48.993 51.164-35.423 19.86-82.299 44.576-82.299 106.405V320c0 13.255 10.745 24 24 24h72.471c13.255 0 24-10.745 24-24v-5.773c0-42.86 125.268-44.645 125.268-160.627C377.504 66.256 286.902 0 202.021 0zM192 373.459c-38.196 0-69.271 31.075-69.271 69.271 0 38.195 31.075 69.27 69.271 69.27s69.271-31.075 69.271-69.271-31.075-69.27-69.271-69.27z"
    /></svg
  >
{/snippet}

{#snippet riPlayListFillIcon()}
  <svg
    class="icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 24 24"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M2 18H12V20H2V18ZM2 11H16V13H2V11ZM2 4H22V6H2V4ZM19 15.1707V9H24V11H21V18C21 19.6569 19.6569 21 18 21C16.3431 21 15 19.6569 15 18C15 16.3431 16.3431 15 18 15C18.3506 15 18.6872 15.0602 19 15.1707Z"
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

{#snippet faCrosshairsListIcon()}
  <svg
    style="margin-right:0.2rem"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M500 224h-30.364C455.724 130.325 381.675 56.276 288 42.364V12c0-6.627-5.373-12-12-12h-40c-6.627 0-12 5.373-12 12v30.364C130.325 56.276 56.276 130.325 42.364 224H12c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h30.364C56.276 381.675 130.325 455.724 224 469.636V500c0 6.627 5.373 12 12 12h40c6.627 0 12-5.373 12-12v-30.364C381.675 455.724 455.724 381.675 469.636 288H500c6.627 0 12-5.373 12-12v-40c0-6.627-5.373-12-12-12zM288 404.634V364c0-6.627-5.373-12-12-12h-40c-6.627 0-12 5.373-12 12v40.634C165.826 392.232 119.783 346.243 107.366 288H148c6.627 0 12-5.373 12-12v-40c0-6.627-5.373-12-12-12h-40.634C119.768 165.826 165.757 119.783 224 107.366V148c0 6.627 5.373 12 12 12h40c6.627 0 12-5.373 12-12v-40.634C346.174 119.768 392.217 165.757 404.634 224H364c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h40.634C392.232 346.174 346.243 392.217 288 404.634zM288 256c0 17.673-14.327 32-32 32s-32-14.327-32-32c0-17.673 14.327-32 32-32s32 14.327 32 32z"
    /></svg
  >
{/snippet}

{#snippet faRegCircleListIcon()}
  <svg
    style="margin-right:0.2rem"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zm0 448c-110.5 0-200-89.5-200-200S145.5 56 256 56s200 89.5 200 200-89.5 200-200 200z"
    /></svg
  >
{/snippet}

{#snippet faSearchIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M505 442.7L405.3 343c-4.5-4.5-10.6-7-17-7H372c27.6-35.3 44-79.7 44-128C416 93.1 322.9 0 208 0S0 93.1 0 208s93.1 208 208 208c48.3 0 92.7-16.4 128-44v16.3c0 6.4 2.5 12.5 7 17l99.7 99.7c9.4 9.4 24.6 9.4 33.9 0l28.3-28.3c9.4-9.4 9.4-24.6.1-34zM208 336c-70.7 0-128-57.2-128-128 0-70.7 57.2-128 128-128 70.7 0 128 57.2 128 128 0 70.7-57.2 128-128 128z"
    /></svg
  >
{/snippet}

{#snippet faDiscordIcon()}
  <svg
    class="help-icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 640 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M524.531,69.836a1.5,1.5,0,0,0-.764-.7A485.065,485.065,0,0,0,404.081,32.03a1.816,1.816,0,0,0-1.923.91,337.461,337.461,0,0,0-14.9,30.6,447.848,447.848,0,0,0-134.426,0,309.541,309.541,0,0,0-15.135-30.6,1.89,1.89,0,0,0-1.924-.91A483.689,483.689,0,0,0,116.085,69.137a1.712,1.712,0,0,0-.788.676C39.068,183.651,18.186,294.69,28.43,404.354a2.016,2.016,0,0,0,.765,1.375A487.666,487.666,0,0,0,176.02,479.918a1.9,1.9,0,0,0,2.063-.676A348.2,348.2,0,0,0,208.12,430.4a1.86,1.86,0,0,0-1.019-2.588,321.173,321.173,0,0,1-45.868-21.853,1.885,1.885,0,0,1-.185-3.126c3.082-2.309,6.166-4.711,9.109-7.137a1.819,1.819,0,0,1,1.9-.256c96.229,43.917,200.41,43.917,295.5,0a1.812,1.812,0,0,1,1.924.233c2.944,2.426,6.027,4.851,9.132,7.16a1.884,1.884,0,0,1-.162,3.126,301.407,301.407,0,0,1-45.89,21.83,1.875,1.875,0,0,0-1,2.611,391.055,391.055,0,0,0,30.014,48.815,1.864,1.864,0,0,0,2.063.7A486.048,486.048,0,0,0,610.7,405.729a1.882,1.882,0,0,0,.765-1.352C623.729,277.594,590.933,167.465,524.531,69.836ZM222.491,337.58c-28.972,0-52.844-26.587-52.844-59.239S193.056,219.1,222.491,219.1c29.665,0,53.306,26.82,52.843,59.239C275.334,310.993,251.924,337.58,222.491,337.58Zm195.38,0c-28.971,0-52.843-26.587-52.843-59.239S388.437,219.1,417.871,219.1c29.667,0,53.307,26.82,52.844,59.239C470.715,310.993,447.538,337.58,417.871,337.58Z"
    /></svg
  >
{/snippet}

{#snippet faGithubIcon()}
  <svg
    class="help-icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 496 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"
    /></svg
  >
{/snippet}

<MenuSidebar
  bind:wrapperEl
  style={inPreview ? 'position:absolute' : ''}
  opacity="0.9"
  current={selectedMenu}
  setCurrent={(c) => (selectedMenu = c)}
  open={isOpen}
  setOpen={(o) => (isOpen = o)}
  visible={true}
>
  {#if isOpen}
    <MenuButton onclick={toggleMenu} class="close-menu" ariaLabel={t('menu:close_menu')}>
      {@render faTimesCloseIcon()}
    </MenuButton>
  {/if}
  <MenuItem id="Help" style="margin-top:auto" ariaLabel={t('menu:open_info_menu')}>
    {@render faQuestionIcon()}
  </MenuItem>
  <MenuItem id="Library" ariaLabel={t('menu:open_library_menu')}>
    {@render riPlayListFillIcon()}
  </MenuItem>
  <MenuItem id="Songs" ariaLabel={t('menu:open_songs_menu')}>
    {@render faMusicIcon()}
  </MenuItem>
  <MenuItem id="Settings" ariaLabel={t('menu:open_settings_menu')}>
    {@render faCogIcon()}
  </MenuItem>
  <MenuButton
    onclick={homeStore.open}
    ariaLabel={t('menu:open_home_menu')}
    style="border:solid 0.1rem var(--secondary)"
  >
    {@render faHomeIcon()}
  </MenuButton>

  {#snippet panel()}
    <MenuPanelWrapper style={inPreview ? 'position:absolute' : ''}>
      <MenuPanel title="No selection" id="No selection">
        {t('menu:select_menu')}
      </MenuPanel>
      <MenuPanel id="Songs">
        <div class="songs-buttons-wrapper">
          <HelpTooltip>
            <ul>
              <li>{t('tutorials:player.li_1')}</li>
              <li>{t('tutorials:player.li_2')}</li>
              <li>{t('tutorials:player.li_3')}</li>
              <li>{@render faCrosshairsListIcon()}: {t('tutorials:player.li_4')}</li>
              <li>{@render faRegCircleListIcon()}: {t('tutorials:player.li_5')}</li>
              {#if globalConfigStore.state.IS_MIDI_AVAILABLE}
                <li>{t('tutorials:player.li_6')}</li>
              {/if}
            </ul>
          </HelpTooltip>
          <AppLink href="/composer" style="margin-left:auto">
            <AppButton>
              {#snippet icon()}
                <IconCompactDisc />
              {/snippet}
              {t('menu:compose_song')}
            </AppButton>
          </AppLink>
        </div>
        <SongMenu
          songs={songsStore.songs}
          exclude={excludedSongs}
          onCreateFolder={createFolder}
          style="margin-top:0.6rem"
          SongComponent={PlayerSongRow}
          componentProps={{
            folders: folderStore.folders,
            currentSongId: playerStore.song?.id ?? null,
            functions: {
              removeSong: functions.removeSong,
              toggleMenu,
              downloadSong,
              renameSong: functions.renameSong,
              exportSongAudio: functions.exportSongAudio,
            },
          }}
        >
          {#snippet importButton()}
            <FilePicker onPick={importSong} onError={jsonImportError} as="json" multiple={true}>
              <AppButton>
                {#snippet icon()}
                  <IconUpload />
                {/snippet}
                {t('menu:import_song_sheet')}
              </AppButton>
            </FilePicker>
          {/snippet}
        </SongMenu>
        <div
          style="margin-top:auto;padding-top:0.5rem;width:100%;display:flex;justify-content:flex-end"
        >
          <AppButton style="margin-left:auto" onclick={downloadAllSongs}>
            {t('menu:download_all_songs_backup')}
          </AppButton>
        </div>
      </MenuPanel>

      <MenuPanel id="Settings">
        <SettingsPane
          settings={data.settings}
          changeVolume={functions.changeVolume}
          onUpdate={functions.handleSettingChange}
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
          <AppLink href="/theme">
            <AppButton style="width:fit-content">
              {t('menu:change_app_theme')}
            </AppButton>
          </AppLink>
          <LanguageSelector />
        </div>
        {#if !isPersistentStorage}
          <div
            style="margin-top:0.4rem;margin-bottom:0.6rem; text-align:center"
            class={hasTooltip(true)}
          >
            {t('settings:memory_not_persisted')}
            <Tooltip position="top">
              {t('settings:memory_not_persisted_description')}
            </Tooltip>
          </div>
        {/if}
        <DonateButton />
      </MenuPanel>

      <MenuPanel title={t('menu:song_library')} id="Library">
        <div>
          {t('player:song_search_description')}
        </div>
        <div class="library-search-row">
          <input
            class="library-search-input"
            style="background-color:{layer1Color.toString()};color:{layer1ColorText.toString()}"
            placeholder={t('menu:song_name')}
            onkeydown={(e) => {
              if (e.code === 'Enter') searchSongs();
            }}
            oninput={(e) => (searchInput = e.currentTarget.value)}
            value={searchInput}
          />
          <button
            class="library-search-btn"
            onclick={clearSearch}
            style="background-color:{layer1Color.toString()};color:{layer1ColorText.toString()}"
          >
            {@render faTimesIcon()}
          </button>
          <button
            class="library-search-btn"
            onclick={searchSongs}
            style="background-color:{layer1Color.toString()};color:{layer1ColorText.toString()}"
          >
            {@render faSearchIcon()}
          </button>
        </div>
        {#if searchStatus || searchedSongs.length > 0}
          <div
            class="library-search-songs-wrapper"
            style="background-color:{layer2Color.toString()};color:{layer2ColorText.toString()};margin-bottom:0.5rem"
          >
            {#if searchStatus === 'success'}
              {#if searchedSongs.length > 0}
                {#each searchedSongs as song (song.file)}
                  <LibrarySearchedSong
                    data={song}
                    importSong={functions.addSong}
                    onClick={playerStore.play}
                  />
                {/each}
              {:else}
                <div class="library-search-result-text">
                  {t('player:song_search_no_results')}
                </div>
              {/if}
            {:else}
              <div class="library-search-result-text">
                {searchStatus}
              </div>
            {/if}
          </div>
        {/if}
        <DonateButton style="margin-top:auto" />
      </MenuPanel>
      <MenuPanel title={t('common:help')} id="Help">
        <div class="help-icon-wrapper">
          <a href="https://discord.gg/Arsf65YYHq" target="_blank">
            {@render faDiscordIcon()}
          </a>
          <a href="https://github.com/Specy/genshin-music" target="_blank">
            {@render faGithubIcon()}
          </a>
        </div>
        <HelpTab />
        <PlayerShortcuts />
        <ComposerShortcuts />
        <DonateButton style="margin-top:0.5rem" />
      </MenuPanel>
    </MenuPanelWrapper>
  {/snippet}
</MenuSidebar>

<style>
  .help-icon {
    width: 3rem;
    height: 3rem;
    color: var(--primary-layer-10);
  }

  .help-icon-wrapper {
    display: flex;
    flex-direction: row;
    width: 100%;
    margin-top: 1vh;
    justify-content: space-around;
  }
</style>
