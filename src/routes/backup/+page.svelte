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

    type BackupFormat = 'json' | 'zip'

    const iconStyle = 'margin-right:0.3rem;margin-left:-0.4rem'

    let downloadFormat = $state<BackupFormat>('json')

    onMount(() => {
        setPageVisited('backup')
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
            // QUIRK: gates on asyncPrompt (a free-text prompt), not asyncConfirm (a real yes/no
            // dialog) - `if (!keepDownloading)` only works because any non-empty typed string is
            // truthy. A text prompt used as a boolean gate, but exactly what old does. Same
            // pattern in validateFolders/validateThemes below.
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
                // QUIRK: empty try body - nothing inside can ever throw, so `errors` is always []
                // and this per-theme validation is dead code (unlike validateSongs/validateFolders
                // above, which really do call a parse/deserialize that can throw). The
                // theme-import-error toast below is consequently unreachable. Preserved as-is.
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
                // Typed Uint8Array (matches fflate's own FlateCallback `data` param) rather than
                // `any`, which is banned. `as const` on each fileEntries tuple below is required:
                // without it each entry widens to (string | Uint8Array)[], which
                // Object.fromEntries (typed Iterable<readonly [PropertyKey, T]>) rejects.
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
                    // QUIRK: unlike the songs-only/themes-only buttons' catches below, this one
                    // doesn't console.error(e) - old's own asymmetry, reproduced. The binding is
                    // omitted (valid ES2019+ optional catch binding) rather than kept-but-unused.
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
