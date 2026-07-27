<script module lang="ts">
    import type {ComposedSong} from '$core/Songs/ComposedSong'
    import type {RecordedSong} from '$core/Songs/RecordedSong'

    export type RecordedOrComposed = RecordedSong | ComposedSong
</script>

<script lang="ts">
    import type {Midi} from '@tonejs/midi'
    import type {Folder} from '$core/Folder'
    import type {SongStorable} from '$core/Songs/Song'
    import {songService} from '$core/Services/SongService'
    import {songsStore} from '$stores/SongsStore.svelte'
    import {playerStore} from '$stores/PlayerStore.svelte'
    import {logger} from '$stores/LoggerStore.svelte'
    import {ThemeProvider} from '$core/theme/ThemeProvider.svelte'
    import {t} from '$i18n/binding.svelte'
    import SongActionButton from '$cmp/inputs/SongActionButton.svelte'
    import FloatingDropdown from '$cmp/utility/FloatingDropdown.svelte'
    import FloatingDropdownRow from '$cmp/utility/FloatingDropdownRow.svelte'
    import FloatingDropdownText from '$cmp/utility/FloatingDropdownText.svelte'
    import FaEllipsisH from '$cmp/icons/FaEllipsisH.svelte'
    import Tooltip from '$cmp/utility/Tooltip.svelte'
    import {hasTooltip} from '$cmp/utility/tooltip'
    import AppLink from '$cmp/AppLink.svelte'

    let {
        data,
        folders,
        functions,
    }: {
        data: SongStorable
        folders: Folder[]
        functions: {
            removeSong: (name: string, id: string) => void
            renameSong: (newName: string, id: string) => void
            toggleMenu: (override?: boolean) => void
            downloadSong: (song: RecordedOrComposed | Midi) => void
        }
    } = $props()

    // functions.xxx is read inline at each call site (not destructured into local consts at setup
    // time): a top-level destructure of a $props() field only captures its initial value, so it
    // would go stale if the parent later passes new functions.
    const buttonStyle = $derived(`background-color:${ThemeProvider.layer('primary', 0.15).toString()}`)

    let isRenaming = $state(false)
    // songName is a $derived directly overridden by the rename input below (Svelte 5.25+ allows
    // this) - it still resets to data.name whenever that upstream value changes.
    let songName = $derived(data.name)

    async function playSong() {
        if (isRenaming) return
        playerStore.play(await songService.fromStorableSong(data) as RecordedOrComposed, 0)
        functions.toggleMenu(false)
    }

    function handleNameKeydown(e: KeyboardEvent) {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        playSong()
    }

    async function practiceSong() {
        const parsed = await songService.fromStorableSong(data) as RecordedOrComposed
        playerStore.practice(parsed, 0, parsed.notes.length)
        functions.toggleMenu(false)
    }

    async function approachSong() {
        const parsed = await songService.fromStorableSong(data) as RecordedOrComposed
        playerStore.approaching(parsed, 0, parsed.notes.length)
        functions.toggleMenu(false)
    }

    function toggleRename() {
        const wasRenaming = isRenaming
        if (wasRenaming) functions.renameSong(songName, data.id!)
        isRenaming = !wasRenaming
    }

    async function changeFolder(e: Event & {currentTarget: HTMLSelectElement}) {
        const id = e.currentTarget.value
        const song = await songService.getOneSerializedFromStorable(data)
        if (!song) return logger.error(t('logs:could_not_find_song'))
        songsStore.addSongToFolder(song, id !== '_None' ? id : null)
    }

    function onEditClick() {
        if (data?.type === 'recorded') logger.warn(t('logs:converting_recorded_to_composed_warning'), 5000)
    }

    async function downloadSheet() {
        const song = await songService.fromStorableSong(data) as RecordedOrComposed
        functions.downloadSong(song)
    }

    async function downloadMidi() {
        const song = await songService.fromStorableSong(data) as RecordedOrComposed
        functions.downloadSong(song.toMidi())
    }
</script>

{#snippet faCrosshairsIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M500 224h-30.364C455.724 130.325 381.675 56.276 288 42.364V12c0-6.627-5.373-12-12-12h-40c-6.627 0-12 5.373-12 12v30.364C130.325 56.276 56.276 130.325 42.364 224H12c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h30.364C56.276 381.675 130.325 455.724 224 469.636V500c0 6.627 5.373 12 12 12h40c6.627 0 12-5.373 12-12v-30.364C381.675 455.724 455.724 381.675 469.636 288H500c6.627 0 12-5.373 12-12v-40c0-6.627-5.373-12-12-12zM288 404.634V364c0-6.627-5.373-12-12-12h-40c-6.627 0-12 5.373-12 12v40.634C165.826 392.232 119.783 346.243 107.366 288H148c6.627 0 12-5.373 12-12v-40c0-6.627-5.373-12-12-12h-40.634C119.768 165.826 165.757 119.783 224 107.366V148c0 6.627 5.373 12 12 12h40c6.627 0 12-5.373 12-12v-40.634C346.174 119.768 392.217 165.757 404.634 224H364c-6.627 0-12 5.373-12 12v40c0 6.627 5.373 12 12 12h40.634C392.232 346.174 346.243 392.217 288 404.634zM288 256c0 17.673-14.327 32-32 32s-32-14.327-32-32c0-17.673 14.327-32 32-32s32 14.327 32 32z"/></svg>
{/snippet}

{#snippet faRegCircleIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zm0 448c-110.5 0-200-89.5-200-200S145.5 56 256 56s200 89.5 200 200-89.5 200-200 200z"/></svg>
{/snippet}

{#snippet faPenIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" style="margin-right:0.4rem" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><path d="M290.74 93.24l128.02 128.02-277.99 277.99-114.14 12.6C11.35 513.54-1.56 500.62.14 485.34l12.7-114.22 277.9-277.88zm207.2-19.06l-60.11-60.11c-18.75-18.75-49.16-18.75-67.91 0l-56.55 56.55 128.02 128.02 56.55-56.55c18.75-18.76 18.75-49.16 0-67.91z"/></svg>
{/snippet}

{#snippet faFolderIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" style="margin-right:0.4rem" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M464 128H272l-64-64H48C21.49 64 0 85.49 0 112v288c0 26.51 21.49 48 48 48h416c26.51 0 48-21.49 48-48V176c0-26.51-21.49-48-48-48z"/></svg>
{/snippet}

{#snippet faEditIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 576 512" style="margin-right:0.4rem" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><path d="M402.6 83.2l90.2 90.2c3.8 3.8 3.8 10 0 13.8L274.4 405.6l-92.8 10.3c-12.4 1.4-22.9-9.1-21.5-21.5l10.3-92.8L388.8 83.2c3.8-3.8 10-3.8 13.8 0zm162-22.9l-48.8-48.8c-15.2-15.2-39.9-15.2-55.2 0l-35.4 35.4c-3.8 3.8-3.8 10 0 13.8l90.2 90.2c3.8 3.8 10 3.8 13.8 0l35.4-35.4c15.2-15.3 15.2-40 0-55.2zM384 346.2V448H64V128h229.8c3.2 0 6.2-1.3 8.5-3.5l40-40c7.6-7.6 2.2-20.5-8.5-20.5H48C21.5 64 0 85.5 0 112v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V306.2c0-10.7-12.9-16-20.5-8.5l-40 40c-2.2 2.3-3.5 5.3-3.5 8.5z"/></svg>
{/snippet}

{#snippet faDownloadIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" style="margin-right:0.4rem" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><path d="M216 0h80c13.3 0 24 10.7 24 24v168h87.7c17.8 0 26.7 21.5 14.1 34.1L269.7 378.3c-7.5 7.5-19.8 7.5-27.3 0L90.1 226.1c-12.6-12.6-3.7-34.1 14.1-34.1H192V24c0-13.3 10.7-24 24-24zm296 376v112c0 13.3-10.7 24-24 24H24c-13.3 0-24-10.7-24-24V376c0-13.3 10.7-24 24-24h146.7l49 49c20.1 20.1 52.5 20.1 72.6 0l49-49H488c13.3 0 24 10.7 24 24zm-124 88c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20zm64 0c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20z"/></svg>
{/snippet}

{#snippet faTrashIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" style="color:#ed4557;margin-right:0.4rem" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><path d="M432 32H312l-9.4-18.7A24 24 0 0 0 281.1 0H166.8a23.72 23.72 0 0 0-21.4 13.3L136 32H16A16 16 0 0 0 0 48v32a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16zM53.2 467a48 48 0 0 0 47.9 45h245.8a48 48 0 0 0 47.9-45L416 128H32z"/></svg>
{/snippet}

{#if data.type === 'vsrg'}
    <div class="row">
        {t('menu:invalid_song')}
    </div>
{:else}
    <div class="song-row">
        <div class={['song-name', hasTooltip(true)]} onclick={playSong} onkeydown={handleNameKeydown} role="button" tabindex="0">
            {#if isRenaming}
                <input
                    class={['song-name-input', isRenaming && 'song-rename']}
                    disabled={!isRenaming}
                    oninput={(e) => songName = e.currentTarget.value}
                    style="width:100%;color:var(--primary-text)"
                    value={songName}
                />
            {:else}
                <div style="margin-left:0.3rem">
                    {songName}
                </div>
            {/if}
            <Tooltip>
                {isRenaming ? t('menu:song_name') : t('menu:play_song')}
            </Tooltip>
        </div>
        <div class="song-buttons-wrapper">
            <SongActionButton
                onclick={practiceSong}
                ariaLabel={t('player:practice_mode_description', {song_name: data.name})}
                tooltip={t('player:practice_mode')}
                style={buttonStyle}
            >
                {@render faCrosshairsIcon()}
            </SongActionButton>

            <SongActionButton
                onclick={approachSong}
                tooltip={t('player:approach_mode')}
                ariaLabel={t('player:approach_mode_description', {song_name: data.name})}
                style={buttonStyle}
            >
                {@render faRegCircleIcon()}
            </SongActionButton>
            <FloatingDropdown
                Icon={FaEllipsisH}
                style={buttonStyle}
                ignoreClickOutside={isRenaming}
                tooltip={t('settings:more_options')}
                onClose={() => isRenaming = false}
            >
                <FloatingDropdownRow onclick={toggleRename}>
                    {@render faPenIcon()}
                    <FloatingDropdownText text={isRenaming ? t('common:save') : t('common:rename')} />
                </FloatingDropdownRow>
                <FloatingDropdownRow style="padding:0 0.4rem">
                    {@render faFolderIcon()}
                    <select class="dropdown-select" value={data.folderId || '_None'} onchange={changeFolder}>
                        <option value="_None">
                            {t('common:none')}
                        </option>
                        {#each folders as folder (folder.id)}
                            <option value={folder.id}>{folder.name}</option>
                        {/each}
                    </select>
                </FloatingDropdownRow>
                <AppLink href={'/composer?songId=' + encodeURIComponent(data.id ?? '')} style="width:100%">
                    <FloatingDropdownRow style="width:100%" onclick={onEditClick}>
                        {@render faEditIcon()}
                        <FloatingDropdownText text={t('common:edit_song')} />
                    </FloatingDropdownRow>
                </AppLink>
                <FloatingDropdownRow onclick={downloadSheet}>
                    {@render faDownloadIcon()}
                    <FloatingDropdownText text={t('common:download')} />
                </FloatingDropdownRow>
                <FloatingDropdownRow onclick={downloadMidi}>
                    {@render faDownloadIcon()}
                    <FloatingDropdownText text={t('common:download_midi')} />
                </FloatingDropdownRow>
                <FloatingDropdownRow onclick={() => functions.removeSong(data.name, data.id!)}>
                    {@render faTrashIcon()}
                    <FloatingDropdownText text={t('common:delete')} />
                </FloatingDropdownRow>
            </FloatingDropdown>
        </div>
    </div>
{/if}
