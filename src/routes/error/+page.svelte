<script lang="ts">
    import {onMount} from 'svelte'
    import DefaultPage from '$cmp/shell/DefaultPage.svelte'
    import PageMetadata from '$cmp/shell/PageMetadata.svelte'
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import SongMenu from '$cmp/SongMenu.svelte'
    import ErrorSongRow from '$cmp/pages/ErrorSongRow.svelte'
    import {songsStore} from '$stores/SongsStore.svelte'
    import {logsStore} from '$stores/LogsStore.svelte'
    import {logger} from '$stores/LoggerStore.svelte'
    import {asyncConfirm} from '$stores/AsyncPromptStore.svelte'
    import {setPageVisited} from '$stores/PageVisitStore.svelte'
    import {fileService} from '$core/Services/FileService'
    import {songService} from '$core/Services/SongService'
    import {ComposedSong} from '$core/Songs/ComposedSong'
    import {RecordedSong} from '$core/Songs/RecordedSong'
    import type {SerializedSong} from '$core/Songs/Song'
    import {APP_NAME} from '$core/legacyConfig'
    import {game} from '$game'
    import {t} from '$i18n/binding.svelte'

    onMount(() => {
        setPageVisited('error')
    })

    const deleteSong = async (name: string, id: string) => {
        if (await asyncConfirm(t('confirm:delete_song', {song_name: name}))) {
            await songsStore.removeSong(id)
        }
    }

    const deleteAllSongs = async () => {
        if (await asyncConfirm(t('error:confirm_delete_all_songs'))) {
            await songsStore._DANGEROUS_CLEAR_ALL_SONGS()
        }
    }

    const resetSettings = () => {
        // QUIRK: also removes `${APP_NAME}_Main_Settings`, a key nothing in this app ever writes
        // to - a dead, permanent no-op removeItem. Reproduced byte-for-byte, not "fixed" to
        // whatever the real settings key is.
        localStorage.removeItem(`${APP_NAME}_Composer_Settings`)
        localStorage.removeItem(`${APP_NAME}_Main_Settings`)
        logger.success(t('error:settings_reset_notice'))
    }

    const downloadSong = (song: SerializedSong) => {
        try {
            const songName = song.name
            const parsed = songService.parseSong(song)
            const converted = [game.features.downloadsSongsInOldFormat && (parsed instanceof ComposedSong || parsed instanceof RecordedSong)
                ? parsed.toOldFormat()
                : parsed.serialize()
            ]
            fileService.downloadSong(converted, `${songName}.${APP_NAME.toLowerCase()}sheet`)
            logger.success(t('logs:song_downloaded'))
        } catch (e) {
            console.error(e)
            logger.error(t('logs:error_downloading_song'))
        }
    }

    function downloadLogs() {
        const logs = logsStore.logs.map(l => l.message)
        fileService.downloadObject(logs, `${APP_NAME}_logs`)
    }
</script>

<DefaultPage class="error-page">
    <PageMetadata
        text={t('common:error')}
        description="View the errors that happened in the app to send bug reports and to try to recover your songs"
    />
    <div style="text-align:center">
        {t('error:error_page_description')}
        <a
            href="https://discord.gg/Arsf65YYHq"
            target="_blank"
            rel="noreferrer"
            style="margin:0 0.4rem;color:var(--accent)"
        >
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
            componentProps={{deleteSong, download: downloadSong}}
        />
    </div>
    <div class="row space-between" style="margin:1rem 0">
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
</style>
