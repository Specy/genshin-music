<script lang="ts">
  import { onMount } from 'svelte';
  import DefaultPage from '$cmp/shell/DefaultPage.svelte';
  import PageMetadata from '$cmp/shell/PageMetadata.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import AppLink from '$cmp/AppLink.svelte';
  import Row from '$cmp/layout/Row.svelte';
  import Column from '$cmp/layout/Column.svelte';
  import Card from '$cmp/layout/Card.svelte';
  import Header from '$cmp/header/Header.svelte';
  import FilePicker, { type FileElement } from '$cmp/inputs/FilePicker.svelte';
  import MultipleOptionSlider from '$cmp/MultipleOptionSlider.svelte';
  import { songService } from '$core/Services/SongService';
  import { _themeService } from '$core/Services/ThemeService';
  import { _folderService } from '$core/Services/FolderService';
  import { fileService, type UnknownFileTypes } from '$core/Services/FileService';
  import type { SerializedSong } from '$core/Songs/Song.svelte';
  import type { SerializedTheme } from '$core/theme/ThemeProvider.svelte';
  import { ThemeProvider as theme } from '$core/theme/ThemeProvider.svelte';
  import { Folder, type SerializedFolder } from '$core/Folder';
  import { asyncConfirm, asyncPrompt } from '$stores/AsyncPromptStore.svelte';
  import { logger } from '$stores/LoggerStore.svelte';
  import { folderStore } from '$stores/FoldersStore.svelte';
  import { songsStore } from '$stores/SongsStore.svelte';
  import { themeStore } from '$stores/ThemeStore.svelte';
  import { settingsService } from '$core/Services/SettingsService';
  import { delay } from '$core/utils/Utilities';
  import { APP_NAME } from '$core/legacyConfig';
  import { setPageVisited } from '$stores/PageVisitStore.svelte';
  import { t } from '$i18n/binding.svelte';
  import { strToU8, zip } from 'fflate';

  type BackupFormat = 'json' | 'zip';

  const iconStyle = 'margin-right:0.3rem;margin-left:-0.4rem';

  let downloadFormat = $state<BackupFormat>('json');

  onMount(() => {
    setPageVisited('backup');
    return () => logger.hidePill();
  });

  async function validateSongs(): Promise<SerializedSong[] | null> {
    logger.showPill(`${t('backup:validating_songs')}...`, { spinner: true });
    const songs = await songService.getSongs();
    const errors: SerializedSong[] = [];
    for (const song of songs) {
      try {
        songService.parseSong(song);
      } catch (e) {
        console.error(e);
        errors.push(song);
        logger.error(t('backup:error_validating_song', { song_name: song?.name }));
      }
    }
    if (errors.length > 0) {
      // QUIRK: gates on asyncPrompt (a free-text prompt), not asyncConfirm (a real yes/no
      // dialog) - `if (!keepDownloading)` only works because any non-empty typed string is
      // truthy. A text prompt used as a boolean gate, but exactly what old does. Same
      // pattern in validateFolders/validateThemes below.
      const keepDownloading = await asyncPrompt(t('backup:confirm_after_songs_validation_error'));
      if (!keepDownloading) return null;
    }
    logger.hidePill();
    return [...songs];
  }

  async function validateFolders(): Promise<SerializedFolder[] | null> {
    logger.showPill(`${t('backup:validating_folders')}...`, { spinner: true });
    const folderErrors: SerializedFolder[] = [];
    const folders = await _folderService.getFolders();
    for (const folder of folders) {
      try {
        Folder.deserialize(folder);
      } catch (e) {
        console.error(e);
        folderErrors.push(folder);
        logger.error(t('backup:error_validating_folder', { folder_name: folder?.name }));
      }
    }
    if (folderErrors.length > 0) {
      const keepDownloading = await asyncPrompt(t('backup:confirm_after_folders_validation_error'));
      if (!keepDownloading) return null;
    }
    logger.hidePill();
    return [...folders];
  }

  async function validateThemes(): Promise<SerializedTheme[] | null> {
    logger.showPill(`${t('backup:validating_themes')}...`, { spinner: true });
    const themes = await _themeService.getThemes();
    const errors: SerializedTheme[] = [];
    for (const theme of themes) {
      try {
        // QUIRK: empty try body - nothing inside can ever throw, so `errors` is always []
        // and this per-theme validation is dead code (unlike validateSongs/validateFolders
        // above, which really do call a parse/deserialize that can throw). The
        // theme-import-error toast below is consequently unreachable. Preserved as-is.
      } catch (e) {
        console.error(e);
        errors.push(theme);
        logger.error(t('backup:error_validating_theme', { theme_name: theme?.other?.name }));
      }
    }
    if (errors.length > 0) {
      const keepDownloading = await asyncPrompt(t('backup:confirm_after_themes_validation_error'));
      if (!keepDownloading) return null;
    }
    logger.hidePill();
    return [...themes];
  }

  async function onFilePick(files: FileElement<UnknownFileTypes[] | UnknownFileTypes>[]) {
    for (const file of files) {
      try {
        const fileArray = (
          Array.isArray(file.data) ? file.data : [file.data]
        ) as UnknownFileTypes[];
        await fileService.importAndLog(fileArray);
      } catch (e) {
        console.error(e);
        logger.error(t('logs:error_importing_file', { file_name: file?.file?.name }));
      }
    }
  }

  async function deleteAllSongsAndFolders() {
    const confirm = await asyncPrompt(t('backup:confirm_delete_songs_step_1'));
    if (confirm !== 'delete') return logger.warn(t('backup:action_cancelled'));
    await delay(200);
    const confirmAgain = await asyncConfirm(t('backup:confirm_delete_songs_step_2'));
    if (!confirmAgain) return logger.warn(t('backup:action_cancelled'));
    await songsStore._DANGEROUS_CLEAR_ALL_SONGS();
    await folderStore._DANGEROUS_CLEAR_ALL_FOLDERS();
    logger.success(t('backup:deleted_all_songs_notice'));
  }

  async function deleteAllThemes() {
    const confirm = await asyncPrompt(t('backup:confirm_delete_themes_step_1'));
    if (confirm !== 'delete') return logger.warn(t('backup:action_cancelled'));
    await delay(200);
    const confirmAgain = await asyncConfirm(t('backup:confirm_delete_themes_step_2'));
    if (!confirmAgain) return logger.warn(t('backup:action_cancelled'));
    await themeStore._DANGEROUS_CLEAR_ALL_THEMES();
    logger.success(t('backup:deleted_all_themes_notice'));
  }

  async function downloadFiles(files: UnknownFileTypes[], fileName: string) {
    if (downloadFormat === 'json') {
      fileService.downloadFiles(files, fileName);
    } else {
      try {
        logger.showPill(`${t('backup:zipping_files')}...`, { spinner: true });
        // Typed Uint8Array (matches fflate's own FlateCallback `data` param) rather than
        // `any`, which is banned. `as const` on each fileEntries tuple below is required:
        // without it each entry widens to (string | Uint8Array)[], which
        // Object.fromEntries (typed Iterable<readonly [PropertyKey, T]>) rejects.
        const result = await new Promise<Uint8Array>((resolve, reject) => {
          const fileEntries = files.map((file) => {
            const nameAndFormat = fileService.getUnknownFileExtensionAndName(file);
            if (!nameAndFormat)
              return [
                `unknown${Math.floor(Math.random() * 1000)}.${file.type}`,
                strToU8(JSON.stringify(file)),
              ] as const;
            const { name, extension } = nameAndFormat;
            const arrayFile = Array.isArray(file) ? file : [file];
            return [`${name}.${extension}`, strToU8(JSON.stringify(arrayFile))] as const;
          });
          zip(
            {
              [`${fileName}`]: strToU8(JSON.stringify(files)),
              individualFiles: Object.fromEntries(fileEntries),
            },
            (err, data) => {
              if (err) return reject(err);
              fileService.downloadBlob(new Blob([new Uint8Array(data)]), `${fileName}.zip`);
              resolve(data);
            }
          );
        });
        logger.hidePill();
        return result;
      } catch (e) {
        logger.hidePill();
        throw e;
      }
    }
  }

  function getDateString() {
    const date = new Date();
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }
</script>

{#snippet downloadIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 384 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    style={iconStyle}
    ><path
      d="M224 136V0H24C10.7 0 0 10.7 0 24v464c0 13.3 10.7 24 24 24h336c13.3 0 24-10.7 24-24V160H248c-13.2 0-24-10.8-24-24zm76.45 211.36l-96.42 95.7c-6.65 6.61-17.39 6.61-24.04 0l-96.42-95.7C73.42 337.29 80.54 320 94.82 320H160v-80c0-8.84 7.16-16 16-16h32c8.84 0 16 7.16 16 16v80h65.18c14.28 0 21.4 17.29 11.27 27.36zM377 105L279.1 7c-4.5-4.5-10.6-7-17-7H256v128h128v-6.1c0-6.3-2.5-12.4-7-16.9z"
    /></svg
  >
{/snippet}

{#snippet importIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    style="margin-right:0.5rem;margin-left:-0.4rem;font-size:1rem"
    ><path
      d="M16 288c-8.8 0-16 7.2-16 16v32c0 8.8 7.2 16 16 16h112v-64zm489-183L407.1 7c-4.5-4.5-10.6-7-17-7H384v128h128v-6.1c0-6.3-2.5-12.4-7-16.9zm-153 31V0H152c-13.3 0-24 10.7-24 24v264h128v-65.2c0-14.3 17.3-21.4 27.4-11.3L379 308c6.6 6.7 6.6 17.4 0 24l-95.7 96.4c-10.1 10.1-27.4 3-27.4-11.3V352H128v136c0 13.3 10.7 24 24 24h336c13.3 0 24-10.7 24-24V160H376c-13.2 0-24-10.8-24-24z"
    /></svg
  >
{/snippet}

{#snippet trashIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    style={iconStyle}
    ><path
      d="M432 32H312l-9.4-18.7A24 24 0 0 0 281.1 0H166.8a23.72 23.72 0 0 0-21.4 13.3L136 32H16A16 16 0 0 0 0 48v32a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16zM53.2 467a48 48 0 0 0 47.9 45h245.8a48 48 0 0 0 47.9-45L416 128H32z"
    /></svg
  >
{/snippet}

<DefaultPage>
  <PageMetadata
    text={t('home:backup_name')}
    description="Manage the backups in the app, download or import songs, themes, or all of them"
  />
  <div class="backup-page">
    <Column gap="1rem" style="padding-bottom:1rem">
      <Card background="none" border="secondary" gap="0.8rem">
        <Header type="h2">
          {t('backup:transfer_from_other_domain')}
        </Header>
        <Row class="backup-transfer-row">
          <div>
            {t('backup:transfer_data_notice')}
          </div>
          <AppLink href="/transfer" class="backup-action-link">
            <AppButton class="backup-action" cssVar="accent" style="gap:0.2rem">
              {t('backup:transfer')}
            </AppButton>
          </AppLink>
        </Row>
      </Card>

      <Card background="none" border="secondary" gap="0.8rem">
        <Row class="backup-format-row">
          <Header type="h2">
            {t('backup:backup_as')}
          </Header>
          <MultipleOptionSlider
            options={[
              {
                value: 'zip',
                color: theme.getValue('accent').toString(),
                text: 'zip',
              },
              {
                value: 'json',
                color: theme.getValue('accent').toString(),
                text: 'json',
              },
            ]}
            selected={downloadFormat}
            onChange={(v) => (downloadFormat = v)}
          />
        </Row>
        <div>
          {t('backup:backup_advice')}
        </div>
        <Row class="backup-actions">
          <AppButton
            tooltip={t('backup:download_all_backup_tooltip')}
            class="flex-centered backup-action"
            onclick={async () => {
              const songs = await validateSongs();
              if (!songs) return;
              const folders = await validateFolders();
              if (!folders) return;
              const themes = await validateThemes();
              if (!themes) return;
              const files = [...songs, ...folders, ...themes];
              if (files.length === 0) return logger.warn(t('backup:no_items_to_backup'));
              try {
                await downloadFiles(
                  files,
                  `${getDateString()}-all.${APP_NAME.toLowerCase()}backup`
                );
                logger.success(t('backup:backup_downloaded'));
                settingsService.setLastBackupWarningTime(Date.now());
              } catch {
                // QUIRK: unlike the songs-only/themes-only buttons' catches below, this one
                // doesn't console.error(e) - old's own asymmetry, reproduced. The binding is
                // omitted (valid ES2019+ optional catch binding) rather than kept-but-unused.
                logger.error(t('backup:backup_download_error'));
              }
            }}
          >
            {@render downloadIcon()}
            {t('backup:download_all_backup')}
          </AppButton>
          <AppButton
            tooltip={t('backup:download_songs_tooltip')}
            class="flex-centered backup-action"
            onclick={async () => {
              const songs = await validateSongs();
              if (!songs) return;
              const folders = await validateFolders();
              if (!folders) return;
              const files = [...songs, ...folders];
              if (files.length === 0) return logger.warn(t('logs:no_songs_to_backup'));
              try {
                await downloadFiles(
                  files,
                  `${getDateString()}-songs.${APP_NAME.toLowerCase()}backup`
                );
                logger.success(t('backup:downloaded_songs_notice'));
                settingsService.setLastBackupWarningTime(Date.now());
              } catch (e) {
                logger.error(t('backup:backup_download_error'));
                console.error(e);
              }
            }}
          >
            {@render downloadIcon()}
            {t('backup:download_songs_backup')}
          </AppButton>
          <AppButton
            tooltip={t('backup:download_themes_tooltip')}
            class="flex-centered backup-action"
            onclick={async () => {
              const themes = await validateThemes();
              if (!themes) return;
              if (themes.length === 0) return logger.warn(t('backup:no_themes_to_backup'));
              try {
                await downloadFiles(
                  themes,
                  `${getDateString()}-themes.${APP_NAME.toLowerCase()}backup`
                );
                logger.success(t('backup:downloaded_themes_notice'));
              } catch (e) {
                logger.error(t('backup:backup_download_error'));
                console.error(e);
              }
            }}
          >
            {@render downloadIcon()}
            {t('backup:download_themes_backup')}
          </AppButton>
        </Row>
      </Card>

      <Card background="none" border="secondary" gap="0.8rem">
        <Header type="h2">
          {t('backup:import_backup')}
        </Header>
        <div>
          {t('backup:import_backup_description')}
        </div>
        <Row class="backup-import-row">
          <div class="backup-import-picker">
            <FilePicker
              onPick={onFilePick}
              as="json"
              onError={() => logger.error(t('backup:error_reading_file'))}
            >
              <AppButton
                class="flex-centered backup-action"
                cssVar="accent"
                tooltip={t('backup:import_backup_tooltip')}
                style="padding:0.8rem"
              >
                {@render importIcon()}
                {t('backup:import_backup')}
              </AppButton>
            </FilePicker>
          </div>
          <Column class="backup-counts">
            <span>
              {songsStore.songs.length}
              {t('backup:songs')}
            </span>

            <span>
              {themeStore.themes.length}
              {t('backup:themes')}
            </span>
          </Column>
        </Row>
      </Card>

      <Card background="none" border="secondary" gap="0.8rem">
        <Header type="h2">
          {t('backup:delete_data')}
        </Header>
        <div>
          {t('backup:delete_data_description')}
        </div>
        <Row class="backup-actions">
          <AppButton
            class="flex-centered backup-action"
            tooltip={t('backup:delete_songs_and_folders_tooltip')}
            tooltipPosition="top"
            style="background-color:var(--red-bg);color:var(--red-text)"
            onclick={deleteAllSongsAndFolders}
          >
            {@render trashIcon()}
            {t('backup:delete_songs_and_folders')}
          </AppButton>
          <AppButton
            class="flex-centered backup-action"
            tooltip={t('backup:delete_themes_tooltip')}
            tooltipPosition="top"
            style="background-color:var(--red-bg);color:var(--red-text)"
            onclick={deleteAllThemes}
          >
            {@render trashIcon()}
            {t('backup:delete_themes')}
          </AppButton>
        </Row>
      </Card>
    </Column>
  </div>
</DefaultPage>

<style>
  /* `display: contents` and nothing else: this wrapper adds no box, so every card keeps the exact
     layout it had, and it exists purely to give the rules below an ancestor Svelte can hash. Every
     class they target (the Rows, the Columns, the AppButtons) is rendered by a CHILD component, so
     scoped CSS can't see it and `:global()` is the only way in - hanging those globals off this
     wrapper keeps them from reaching any other page's `.row`s and buttons. */
  .backup-page {
    display: contents;
  }

  /* The four action strips used to carry `align`/`justify`/`gap`/`flex-wrap` as Row PROPS, which
     Row emits as an inline `style` - and an inline declaration outranks every rule that isn't
     `!important`, so the portrait block could never have restacked them. Same declarations, same
     landscape rendering; they just live somewhere a media query can reach now. */
  .backup-page :global(.backup-transfer-row),
  .backup-page :global(.backup-format-row) {
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .backup-page :global(.backup-import-row) {
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .backup-page :global(.backup-actions) {
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .backup-page :global(.backup-counts) {
    opacity: 0.8;
  }

  /* PORTRAIT. Width-tiered as well as orientation-keyed on purpose, matching App.css's own
     `max-width: 920px and (orientation: portrait)` block: below that tier `.default-page` drops to
     a 1rem gutter and the page really is phone-narrow, while a portrait TABLET is a wide window
     that keeps the desktop 20vw margins and reads fine as the desktop row of chips. */
  @media screen and (orientation: portrait) and (max-width: 920px) {
    /* ONE ACTION PER LINE, FULL WIDTH. `flex-wrap` alone already broke these rows onto several
       lines at 393px, but as a ragged left-aligned stack of differently-sized chips - the wrapping
       was survival, not a layout. A column of equal, full-width bars is what this page's cards are
       actually made of: one destination per row, each one a real thumb target. */
    .backup-page :global(.backup-transfer-row),
    .backup-page :global(.backup-format-row),
    .backup-page :global(.backup-import-row),
    .backup-page :global(.backup-actions) {
      flex-direction: column;
      align-items: stretch;
      gap: 0.6rem;
    }

    /* `width` and not `flex: 1`: AppLink and FilePicker each wrap their button in a plain element
       of their own, so the button is not always the flex item the stretch above applies to. */
    .backup-page :global(.backup-action) {
      width: 100%;
      min-height: 2.75rem;
    }

    .backup-page :global(.backup-action-link) {
      display: flex;
    }

    /* MultipleOptionSlider sizes itself `width: fit-content` / `height: 100%`, which in a stretched
       column would leave a 62x27 pair of options - too small to hit and adrift on a full-width row.
       Beating its own scoped `.multiple-option-slider` rule needs the extra `div` in the selector;
       the buttons inside are already `height: 100%`, so they follow this height. */
    .backup-page :global(div.multiple-option-slider) {
      width: 100%;
      height: 2.75rem;
    }

    /* The two counts stop being a right-hand gutter (there is no right-hand gutter any more) and
       become a caption under the import button. */
    .backup-page :global(div.backup-counts) {
      flex-direction: row;
      justify-content: center;
      gap: 1.2rem;
    }
  }
</style>
