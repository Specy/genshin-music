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

    // Old: src/app/_client-pages/error/index.tsx (149 lines) + local SongRow (ported as
    // pages/ErrorSongRow.svelte, a sibling component - see its own header comment).
    //
    // Namespace resolution: old's `useTranslation(['error','logs', 'confirm', 'common'])` makes
    // 'error' the implicit default ns for every bare (unprefixed) t() call below - each is written
    // out with its real, explicit ns per this codebase's established colon-namespace convention
    // (confirmed against the en locale bundle: confirm_delete_all_songs/settings_reset_notice/
    // error_page_description/reset_settings/delete_all_songs/error_logs/download_logs all live
    // under the `error:` key, not `confirm:`, despite 'confirm' being a separately-loaded ns old
    // also listed).
    //
    // DEAD-KEY QUIRK PRESERVED (per this task's dispatch): resetSettings removes BOTH
    // `${APP_NAME}_Composer_Settings` (the real key) and `${APP_NAME}_Main_Settings` (a dead key -
    // per the Phase-0 storage audit, nothing in this app ever writes to `_Main_Settings`, so this
    // second removeItem is a permanent no-op) - reproduced byte-for-byte, not "fixed" to whatever
    // the real settings key is.
    //
    // downloadsSongsInOldFormat (game.features, via $game) replaces old's `APP_NAME === 'Sky'`
    // check per the dispatch - same two-tier rule already established throughout Phase 3/4a
    // (game-conditional BEHAVIOR reads from $game, not a literal APP_NAME string compare).
    //
    // SongMenu called with only `SongComponent`/`songs`/`componentProps` (old passed no `exclude`/
    // `baseType`/`onCreateFolder` either) - shows all three default song-type folders, none
    // pre-expanded, no "create folder" button, matching old exactly.
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

<DefaultPage className="error-page">
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
    /* Old: src/app/_client-pages/error/ErrorPage.module.scss, inlined verbatim (no actual SCSS
       features used in the source - nesting/variables/mixins - so this ports as plain CSS). */

    /* :global() is required for this ONE selector - `.error-page` is applied to DefaultPage's OWN
       outer wrapper div via its `className` prop (a plain string), an element belonging to
       DefaultPage.svelte's compiled template/scope, not this file's - a plain scoped `.error-page`
       rule here would never match it. The other 4 selectors below target elements THIS component's
       own template authors directly (as DefaultPage's slotted children), which DO keep this file's
       scoping hash even though they're ultimately rendered inside DefaultPage's DOM - no :global()
       needed for those. */
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
