<script lang="ts">
    import {onMount} from 'svelte'
    import DefaultPage from '$cmp/shell/DefaultPage.svelte'
    import PageMetadata from '$cmp/shell/PageMetadata.svelte'
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import AppLink from '$cmp/AppLink.svelte'
    import Row from '$cmp/layout/Row.svelte'
    import Column from '$cmp/layout/Column.svelte'
    import FilePicker, {type FileElement} from '$cmp/inputs/FilePicker.svelte'
    import MultipleOptionSlider from '$cmp/MultipleOptionSlider.svelte'
    import {songService} from '$core/Services/SongService'
    import {_themeService} from '$core/Services/ThemeService'
    import {_folderService} from '$core/Services/FolderService'
    import {fileService, type UnknownFileTypes} from '$core/Services/FileService'
    import type {SerializedSong} from '$core/Songs/Song'
    import type {SerializedTheme} from '$core/theme/ThemeProvider.svelte'
    import {ThemeProvider as theme} from '$core/theme/ThemeProvider.svelte'
    import {Folder, type SerializedFolder} from '$core/Folder'
    import {asyncConfirm, asyncPrompt} from '$stores/AsyncPromptStore.svelte'
    import {logger} from '$stores/LoggerStore.svelte'
    import {folderStore} from '$stores/FoldersStore.svelte'
    import {songsStore} from '$stores/SongsStore.svelte'
    import {themeStore} from '$stores/ThemeStore.svelte'
    import {settingsService} from '$core/Services/SettingsService'
    import {delay} from '$core/utils/Utilities'
    import {APP_NAME} from '$core/legacyConfig'
    import {setPageVisited} from '$stores/PageVisitStore.svelte'
    import {t} from '$i18n/binding.svelte'
    import {strToU8, zip} from 'fflate'

    // Old: src/app/_client-pages/backup/index.tsx (373 lines). NEW DEP fflate (strToU8/zip, already
    // typed - no @types/fflate package exists or is needed). `songs`/`userThemes` (old: useSongs()/
    // useObservableArray(themeStore.themes), both just reactive mirrors of the same stores) read
    // directly off songsStore.songs/themeStore.themes below - same replacement as every other
    // ported page this migration (e.g. error/+page.svelte's songsStore.songs). `theme` (old:
    // useTheme()) replaced by the reactive ThemeProvider singleton import, same as Select.svelte/
    // ThemeVars.svelte.
    //
    // Two pre-existing BUGS preserved byte-for-byte (flagged, not fixed) per this migration's
    // quirk-preservation rule:
    // (1) validateThemes()'s per-theme try/catch has an EMPTY try body - nothing inside it can ever
    //     throw, so `errors` is always [] and the whole per-theme validation is dead code (unlike
    //     validateSongs/validateFolders, which really do call songService.parseSong/Folder.deserialize
    //     inside their try blocks). The theme-import-error toast is consequently unreachable.
    // (2) All three validate*() functions gate on `asyncPrompt(...)` (a free-text prompt) rather
    //     than `asyncConfirm(...)` (a real yes/no dialog) for their "continue anyway?" question -
    //     `if (!keepDownloading) return null` only works because any non-empty typed string is
    //     truthy; it's a semantic mismatch (a text prompt used as a boolean gate) but exactly what
    //     old does.
    // (3) the three backup-download button handlers are asymmetric in their catch blocks: the
    //     "download all" button's catch only shows the error toast, while the songs-only and
    //     themes-only buttons' catches ALSO console.error(e) - preserved exactly, not normalized.
    type BackupFormat = 'json' | 'zip'

    const iconStyle = 'margin-right:0.3rem;margin-left:-0.4rem'

    let downloadFormat = $state<BackupFormat>('json')

    onMount(() => {
        setPageVisited('backup')
        // old: a separate mount-once effect whose only job was this cleanup - merged into this
        // same onMount (both were unconditional/mount-once, so the merge is behavior-neutral).
        return () => logger.hidePill()
    })

    async function validateSongs(): Promise<SerializedSong[] | null> {
        logger.showPill(`${t('backup:validating_songs')}...`)
        const songs = await songService.getSongs()
        const errors: SerializedSong[] = []
        for (const song of songs) {
            try {
                songService.parseSong(song)
            } catch (e) {
                console.error(e)
                errors.push(song)
                logger.error(t('backup:error_validating_song', {song_name: song?.name}))
            }
        }
        if (errors.length > 0) {
            const keepDownloading = await asyncPrompt(t('backup:confirm_after_songs_validation_error'))
            if (!keepDownloading) return null
        }
        logger.hidePill()
        return [...songs]
    }

    async function validateFolders(): Promise<SerializedFolder[] | null> {
        logger.showPill(`${t('backup:validating_folders')}...`)
        const folderErrors: SerializedFolder[] = []
        const folders = await _folderService.getFolders()
        for (const folder of folders) {
            try {
                Folder.deserialize(folder)
            } catch (e) {
                console.error(e)
                folderErrors.push(folder)
                logger.error(t('backup:error_validating_folder', {folder_name: folder?.name}))
            }
        }
        if (folderErrors.length > 0) {
            const keepDownloading = await asyncPrompt(t('backup:confirm_after_folders_validation_error'))
            if (!keepDownloading) return null
        }
        logger.hidePill()
        return [...folders]
    }

    async function validateThemes(): Promise<SerializedTheme[] | null> {
        logger.showPill(`${t('backup:validating_themes')}...`)
        const themes = await _themeService.getThemes()
        const errors: SerializedTheme[] = []
        for (const theme of themes) {
            try {
                // old: empty try body - see the BUG (1) note above, preserved verbatim.
            } catch (e) {
                console.error(e)
                errors.push(theme)
                logger.error(t('backup:error_validating_theme', {theme_name: theme?.other?.name}))
            }
        }
        if (errors.length > 0) {
            const keepDownloading = await asyncPrompt(t('backup:confirm_after_themes_validation_error'))
            if (!keepDownloading) return null
        }
        logger.hidePill()
        return [...themes]
    }

    async function onFilePick(files: FileElement<UnknownFileTypes[] | UnknownFileTypes>[]) {
        for (const file of files) {
            try {
                const fileArray = (Array.isArray(file.data) ? file.data : [file.data]) as UnknownFileTypes[]
                await fileService.importAndLog(fileArray)
            } catch (e) {
                console.error(e)
                logger.error(t('logs:error_importing_file', {file_name: file?.file?.name}))
            }
        }
    }

    async function deleteAllSongsAndFolders() {
        const confirm = await asyncPrompt(t('backup:confirm_delete_songs_step_1'))
        if (confirm !== 'delete') return logger.warn(t('backup:action_cancelled'))
        await delay(200)
        const confirmAgain = await asyncConfirm(t('backup:confirm_delete_songs_step_2'))
        if (!confirmAgain) return logger.warn(t('backup:action_cancelled'))
        await songsStore._DANGEROUS_CLEAR_ALL_SONGS()
        await folderStore._DANGEROUS_CLEAR_ALL_FOLDERS()
        logger.success(t('backup:deleted_all_songs_notice'))
    }

    async function deleteAllThemes() {
        const confirm = await asyncPrompt(t('backup:confirm_delete_themes_step_1'))
        if (confirm !== 'delete') return logger.warn(t('backup:action_cancelled'))
        await delay(200)
        const confirmAgain = await asyncConfirm(t('backup:confirm_delete_themes_step_2'))
        if (!confirmAgain) return logger.warn(t('backup:action_cancelled'))
        await themeStore._DANGEROUS_CLEAR_ALL_THEMES()
        logger.success(t('backup:deleted_all_themes_notice'))
    }

    async function downloadFiles(files: UnknownFileTypes[], fileName: string) {
        if (downloadFormat === 'json') {
            fileService.downloadFiles(files, fileName)
        } else {
            try {
                logger.showPill(`${t('backup:zipping_files')}...`)
                // old: `new Promise<any>(...)` - typed as Uint8Array here (matching fflate's own
                // FlateCallback `data` param, threaded through to `resolve(data)` below) since bare
                // `any` trips @typescript-eslint/no-explicit-any outside src/lib/core (this file is
                // not core - compiler/lint-forced, same class of change as every other new provider
                // file this migration). Same reasoning for the `as const` on each fileEntries tuple
                // below: without it each entry widens to `(string | Uint8Array)[]`, which
                // Object.fromEntries (typed `Iterable<readonly [PropertyKey, T]>`) rejects under
                // strict mode - old's untyped JS had no such check.
                const result = await new Promise<Uint8Array>((resolve, reject) => {
                    const fileEntries = files.map(file => {
                        const nameAndFormat = fileService.getUnknownFileExtensionAndName(file)
                        if (!nameAndFormat) return [`unknown${Math.floor(Math.random() * 1000)}.${file.type}`, strToU8(JSON.stringify(file))] as const
                        const {name, extension} = nameAndFormat
                        const arrayFile = Array.isArray(file) ? file : [file]
                        return [`${name}.${extension}`, strToU8(JSON.stringify(arrayFile))] as const
                    })
                    zip({
                        [`${fileName}`]: strToU8(JSON.stringify(files)),
                        individualFiles: Object.fromEntries(fileEntries)
                    }, (err, data) => {
                        if (err) return reject(err)
                        fileService.downloadBlob(new Blob([new Uint8Array(data)]), `${fileName}.zip`)
                        resolve(data)
                    })
                })
                logger.hidePill()
                return result
            } catch (e) {
                logger.hidePill()
                throw e
            }
        }
    }

    function getDateString() {
        const date = new Date()
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    }
</script>

{#snippet downloadIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 384 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" style={iconStyle}><path d="M224 136V0H24C10.7 0 0 10.7 0 24v464c0 13.3 10.7 24 24 24h336c13.3 0 24-10.7 24-24V160H248c-13.2 0-24-10.8-24-24zm76.45 211.36l-96.42 95.7c-6.65 6.61-17.39 6.61-24.04 0l-96.42-95.7C73.42 337.29 80.54 320 94.82 320H160v-80c0-8.84 7.16-16 16-16h32c8.84 0 16 7.16 16 16v80h65.18c14.28 0 21.4 17.29 11.27 27.36zM377 105L279.1 7c-4.5-4.5-10.6-7-17-7H256v128h128v-6.1c0-6.3-2.5-12.4-7-16.9z" /></svg>
{/snippet}

{#snippet importIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" style="margin-right:0.5rem;margin-left:-0.4rem;font-size:1rem"><path d="M16 288c-8.8 0-16 7.2-16 16v32c0 8.8 7.2 16 16 16h112v-64zm489-183L407.1 7c-4.5-4.5-10.6-7-17-7H384v128h128v-6.1c0-6.3-2.5-12.4-7-16.9zm-153 31V0H152c-13.3 0-24 10.7-24 24v264h128v-65.2c0-14.3 17.3-21.4 27.4-11.3L379 308c6.6 6.7 6.6 17.4 0 24l-95.7 96.4c-10.1 10.1-27.4 3-27.4-11.3V352H128v136c0 13.3 10.7 24 24 24h336c13.3 0 24-10.7 24-24V160H376c-13.2 0-24-10.8-24-24z" /></svg>
{/snippet}

{#snippet trashIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg" style={iconStyle}><path d="M432 32H312l-9.4-18.7A24 24 0 0 0 281.1 0H166.8a23.72 23.72 0 0 0-21.4 13.3L136 32H16A16 16 0 0 0 0 48v32a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16zM53.2 467a48 48 0 0 0 47.9 45h245.8a48 48 0 0 0 47.9-45L416 128H32z" /></svg>
{/snippet}

<DefaultPage>
    <PageMetadata
        text={t('home:backup_name')}
        description="Manage the backups in the app, download or import songs, themes, or all of them"
    />
    <h1 style="font-size:1.8rem">
        {t('backup:transfer_from_other_domain')}
    </h1>
    <Row align="center" gap="1rem" style="padding-left:1.5rem">
        <div>
            {t('backup:transfer_data_notice')}
        </div>
        <AppLink href="/transfer" style="margin-left:1rem">
            <AppButton cssVar="accent" style="gap:0.2rem">
                {t('backup:transfer')}
            </AppButton>
        </AppLink>
    </Row>

    <Row align="center" gap="1rem" style="margin:1rem 0;margin-top:2rem">
        <div style="font-size:1.8rem">
            {t('backup:backup_as')}
        </div>
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
                    text: 'json'
                },
            ]}
            selected={downloadFormat}
            onChange={(v) => downloadFormat = v}
        />
    </Row>
    <div style="padding-left:1.5rem">
        {t('backup:backup_advice')}
    </div>
    <Row gap="0.5rem" style="margin-top:1rem;padding-left:1.5rem">
        <AppButton
            tooltip={t('backup:download_all_backup_tooltip')}
            className="flex-centered"
            onclick={async () => {
                const songs = await validateSongs()
                if (!songs) return
                const folders = await validateFolders()
                if (!folders) return
                const themes = await validateThemes()
                if (!themes) return
                const files = [...songs, ...folders, ...themes]
                if (files.length === 0) return logger.warn(t('backup:no_items_to_backup'))
                try {
                    await downloadFiles(files, `${getDateString()}-all.${APP_NAME.toLowerCase()}backup`)
                    logger.success(t('backup:backup_downloaded'))
                    settingsService.setLastBackupWarningTime(Date.now())
                } catch {
                    // old: `catch (e) { logger.error(...) }` - `e` was never read here (unlike the
                    // songs-only/themes-only buttons' catches below, which DO console.error(e) -
                    // BUG (3) in the header comment, preserved). The binding is simply omitted
                    // (valid ES2019+ optional catch binding) rather than kept-but-unused, to
                    // satisfy no-unused-vars without adding the console.error(e) call old's own
                    // asymmetry deliberately leaves out here.
                    logger.error(t('backup:backup_download_error'))
                }
            }}
        >
            {@render downloadIcon()}
            {t('backup:download_all_backup')}
        </AppButton>
        <AppButton
            tooltip={t('backup:download_songs_tooltip')}
            className="flex-centered"
            onclick={async () => {
                const songs = await validateSongs()
                if (!songs) return
                const folders = await validateFolders()
                if (!folders) return
                const files = [...songs, ...folders]
                if (files.length === 0) return logger.warn(t('logs:no_songs_to_backup'))
                try {
                    await downloadFiles(files, `${getDateString()}-songs.${APP_NAME.toLowerCase()}backup`)
                    logger.success(t('backup:downloaded_songs_notice'))
                    settingsService.setLastBackupWarningTime(Date.now())
                } catch (e) {
                    logger.error(t('backup:backup_download_error'))
                    console.error(e)
                }
            }}
        >
            {@render downloadIcon()}
            {t('backup:download_songs_backup')}
        </AppButton>
        <AppButton
            tooltip={t('backup:download_themes_tooltip')}
            className="flex-centered"
            onclick={async () => {
                const themes = await validateThemes()
                if (!themes) return
                if (themes.length === 0) return logger.warn(t('backup:no_themes_to_backup'))
                try {
                    await downloadFiles(themes, `${getDateString()}-themes.${APP_NAME.toLowerCase()}backup`)
                    logger.success(t('backup:downloaded_themes_notice'))
                } catch (e) {
                    logger.error(t('backup:backup_download_error'))
                    console.error(e)
                }
            }}
        >
            {@render downloadIcon()}
            {t('backup:download_themes_backup')}
        </AppButton>
    </Row>
    <h1 style="font-size:1.8rem">
        {t('backup:import_backup')}
    </h1>
    <div style="padding-left:1.5rem">
        {t('backup:import_backup_description')}
    </div>
    <Row align="center">
        <FilePicker
            onPick={onFilePick}
            as="json"
            onError={() => logger.error(t('backup:error_reading_file'))}
        >
            <AppButton
                className="flex-centered"
                tooltip={t('backup:import_backup_tooltip')}
                style="margin-top:1rem;background-color:var(--accent);color:var(--accent-text);padding:0.8rem"
            >
                {@render importIcon()}
                {t('backup:import_backup')}
            </AppButton>
        </FilePicker>
    </Row>
    <Column justify="center" padding="1rem" style="flex:1">
        <Column style="width:fit-content">
            <span>
                {songsStore.songs.length} {t('backup:songs')}
            </span>

            <span>
                {themeStore.themes.length} {t('backup:themes')}
            </span>
        </Column>
    </Column>
    <h1 style="font-size:1.8rem">
        {t('backup:delete_data')}
    </h1>
    <div style="padding-left:1.5rem">
        {t('backup:delete_data_description')}
    </div>
    <Row gap="0.5rem" style="margin-top:1rem;padding-left:1.5rem">
        <AppButton
            className="flex-centered"
            tooltip={t('backup:delete_songs_and_folders_tooltip')}
            tooltipPosition="top"
            style="background-color:var(--red-bg);color:var(--red-text)"
            onclick={deleteAllSongsAndFolders}
        >
            {@render trashIcon()}
            {t('backup:delete_songs_and_folders')}
        </AppButton>
        <AppButton
            className="flex-centered"
            tooltip={t('backup:delete_themes_tooltip')}
            tooltipPosition="top"
            style="background-color:var(--red-bg);color:var(--red-text)"
            onclick={deleteAllThemes}
        >
            {@render trashIcon()}
            {t('backup:delete_themes')}
        </AppButton>
    </Row>
</DefaultPage>
