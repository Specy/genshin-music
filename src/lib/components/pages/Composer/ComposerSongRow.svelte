<script lang="ts">
    import type {Folder} from '$core/Folder'
    import type {SerializedSong, SongStorable} from '$core/Songs/Song'
    import {songService} from '$core/Services/SongService'
    import {songsStore} from '$stores/SongsStore.svelte'
    import {logger} from '$stores/LoggerStore.svelte'
    import {ThemeProvider} from '$core/theme/ThemeProvider.svelte'
    import {t} from '$i18n/binding.svelte'
    import AppButton from '$cmp/inputs/AppButton.svelte'
    import FloatingDropdown from '$cmp/utility/FloatingDropdown.svelte'
    import FloatingDropdownRow from '$cmp/utility/FloatingDropdownRow.svelte'
    import FloatingDropdownText from '$cmp/utility/FloatingDropdownText.svelte'
    import FaEllipsisH from '$cmp/icons/FaEllipsisH.svelte'
    import Tooltip from '$cmp/utility/Tooltip.svelte'
    import {hasTooltip} from '$cmp/utility/tooltip'

    // Old: src/components/pages/Composer/ComposerMenu.tsx's local (non-exported) `SongRow`
    // component (ComposerMenu.tsx lines ~330-410). Sibling file required for the same reason as
    // `PlayerSongRow.svelte`/`SheetVisualizerSongRow.svelte` before it: `SongMenu.svelte`'s generic
    // `SongComponent` prop needs a real `Component<T>` reference, not a snippet. Named
    // `ComposerSongRow` (not old's bare "SongRow") for the same collision-avoidance reason as those
    // two siblings.
    //
    // Real, disclosed differences from `PlayerSongRow.svelte` (old's OWN two SongRow blobs differ,
    // this is not a porting inconsistency - each reproduces its own old file exactly):
    //  - no practice/approach `SongActionButton`s outside the dropdown - Composer's SongRow only
    //    has the single ellipsis `FloatingDropdown`, all actions live inside it (rename/folder/
    //    edit/download/download-midi/CLONE - clone has no Player equivalent at all/delete).
    //  - the rename toggle is a plain `AppButton` (`class="row row-centered" style="padding:0.4rem"`
    //    - note: NO `min-width:unset`, unlike `FloatingDropdownRow`'s own hardcoded style, which
    //    Player's equivalent row effectively gets for free by using `FloatingDropdownRow` there
    //    instead) - reproduced literally as an `AppButton`, not `FloatingDropdownRow`, a real old
    //    per-file inconsistency (`FloatingDropdownRow.svelte` is itself just an `AppButton` with
    //    `class="row row-centered" style="padding:0.4rem;min-width:unset"` baked in - this file's
    //    own inline `AppButton` differs from that only by the missing `min-width:unset`).
    //  - the song-name click path shows a `logger.showPill`/`hidePill` "loading song" pill (Player's
    //    doesn't); the tooltip text is `menu:open_in_composer` (not `menu:play_song`).
    //  - `loadSong`/`downloadSong` take a raw `SerializedSong` (+ an explicit 'song'|'midi'
    //    discriminator for downloads) rather than a resolved class instance - `ComposerMenu.svelte`'s
    //    own callback-prop signatures, matching old's `MenuProps.functions` exactly.
    //  - icon sizes are a real per-icon-per-call-site old inconsistency, reproduced literally:
    //    FaPen/FaFolder/FaDownload(song row)/FaClone/FaTrash all default "1em" (no explicit size);
    //    FaEdit and FaDownload(midi row) both explicit size={14}.
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
            loadSong: (song: SerializedSong) => void
            downloadSong: (song: SerializedSong, as: 'midi' | 'song') => void
        }
    } = $props()

    // old: `theme: Theme` prop DROPPED (same rationale as `PlayerSongRow.svelte`'s own header
    // comment) - `ThemeProvider` imported directly instead, still used for `buttonStyle` below
    // (old's `const buttonStyle = {backgroundColor: theme.layer('primary', 0.15).toString()}`,
    // passed as the `FloatingDropdown`'s own `style` prop).
    const buttonStyle = $derived(`background-color:${ThemeProvider.layer('primary', 0.15).toString()}`)

    let isRenaming = $state(false)
    // old: `useState(data.name)` + `useEffect(() => setSongName(data.name), [data.name])` - same
    // writable-$derived rewrite already established by `SongFolder.svelte`'s own `folderName`/
    // `PlayerSongRow.svelte`'s own `songName`.
    let songName = $derived(data.name)

    async function openInComposer() {
        if (isRenaming) return
        logger.showPill(t('logs:loading_song'))
        const song = await songService.getOneSerializedFromStorable(data)
        logger.hidePill()
        if (!song) return logger.error(t('logs:could_not_find_song'))
        functions.loadSong(song)
        functions.toggleMenu(false)
    }

    // old had no keyboard handler on the (bare onClick) song-name div - pre-existing a11y gap,
    // same additive role/tabindex/onkeydown fix already applied to every other SongRow sibling.
    function handleNameKeydown(e: KeyboardEvent) {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        openInComposer()
    }

    function toggleRename() {
        const wasRenaming = isRenaming
        if (wasRenaming) {
            functions.renameSong(songName, data.id!)
        }
        isRenaming = !wasRenaming
    }

    async function changeFolder(e: Event & {currentTarget: HTMLSelectElement}) {
        const id = e.currentTarget.value
        const song = await songService.getOneSerializedFromStorable(data)
        if (!song) return logger.error(t('logs:could_not_find_song'))
        songsStore.addSongToFolder(song, id !== '_None' ? id : null)
    }

    async function editSong() {
        if (data?.type === 'recorded') logger.warn(t('logs:converting_recorded_to_composed_warning'))
        const song = await songService.getOneSerializedFromStorable(data)
        if (!song) return logger.error(t('logs:could_not_find_song'))
        functions.loadSong(song)
        functions.toggleMenu(false)
    }

    async function downloadSong() {
        const song = await songService.getOneSerializedFromStorable(data)
        if (!song) return logger.error(t('logs:could_not_find_song'))
        functions.downloadSong(song, 'song')
    }

    async function downloadMidi() {
        const song = await songService.getOneSerializedFromStorable(data)
        if (!song) return logger.error(t('logs:could_not_find_song'))
        functions.downloadSong(song, 'midi')
    }

    async function cloneSong() {
        const parsed = await songService.fromStorableSong(data)
        const clone = parsed.clone()
        clone.name = `${parsed.name} - (clone)`
        await songsStore.addSong(clone)
        logger.log(t('logs:cloned_song', {song_name: data.name}))
    }
</script>

{#snippet faPenIcon()}
    <!-- react-icons/fa's FaPen (unpkg.com/react-icons@5.6.0/fa/index.mjs); old passed no explicit
         size (default "1em") - unlike PlayerSongRow.svelte's own FaPen, which has size={14}. -->
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" style="margin-right:0.4rem" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M290.74 93.24l128.02 128.02-277.99 277.99-114.14 12.6C11.35 513.54-1.56 500.62.14 485.34l12.7-114.22 277.9-277.88zm207.2-19.06l-60.11-60.11c-18.75-18.75-49.16-18.75-67.91 0l-56.55 56.55 128.02 128.02 56.55-56.55c18.75-18.76 18.75-49.16 0-67.91z"/></svg>
{/snippet}

{#snippet faFolderIcon()}
    <!-- react-icons/fa's FaFolder, same sourcing; old passed no explicit size. -->
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" style="margin-right:0.4rem" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M464 128H272l-64-64H48C21.49 64 0 85.49 0 112v288c0 26.51 21.49 48 48 48h416c26.51 0 48-21.49 48-48V176c0-26.51-21.49-48-48-48z"/></svg>
{/snippet}

{#snippet faEditIcon()}
    <!-- react-icons/fa's FaEdit, same sourcing; old passed size={14} explicitly. -->
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 576 512" style="margin-right:0.4rem" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><path d="M402.6 83.2l90.2 90.2c3.8 3.8 3.8 10 0 13.8L274.4 405.6l-92.8 10.3c-12.4 1.4-22.9-9.1-21.5-21.5l10.3-92.8L388.8 83.2c3.8-3.8 10-3.8 13.8 0zm162-22.9l-48.8-48.8c-15.2-15.2-39.9-15.2-55.2 0l-35.4 35.4c-3.8 3.8-3.8 10 0 13.8l90.2 90.2c3.8 3.8 10 3.8 13.8 0l35.4-35.4c15.2-15.3 15.2-40 0-55.2zM384 346.2V448H64V128h229.8c3.2 0 6.2-1.3 8.5-3.5l40-40c7.6-7.6 2.2-20.5-8.5-20.5H48C21.5 64 0 85.5 0 112v352c0 26.5 21.5 48 48 48h352c26.5 0 48-21.5 48-48V306.2c0-10.7-12.9-16-20.5-8.5l-40 40c-2.2 2.3-3.5 5.3-3.5 8.5z"/></svg>
{/snippet}

{#snippet faDownloadIcon(size: string)}
    <!-- react-icons/fa's FaDownload, same sourcing; song-download call site below passes no
         explicit size (default "1em"), midi-download passes size={14} - a real old
         per-call-site inconsistency, reproduced via this one parameterized snippet. -->
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" style="margin-right:0.4rem" height={size} width={size} xmlns="http://www.w3.org/2000/svg"><path d="M216 0h80c13.3 0 24 10.7 24 24v168h87.7c17.8 0 26.7 21.5 14.1 34.1L269.7 378.3c-7.5 7.5-19.8 7.5-27.3 0L90.1 226.1c-12.6-12.6-3.7-34.1 14.1-34.1H192V24c0-13.3 10.7-24 24-24zm296 376v112c0 13.3-10.7 24-24 24H24c-13.3 0-24-10.7-24-24V376c0-13.3 10.7-24 24-24h146.7l49 49c20.1 20.1 52.5 20.1 72.6 0l49-49H488c13.3 0 24 10.7 24 24zm-124 88c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20zm64 0c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20z"/></svg>
{/snippet}

{#snippet faCloneIcon()}
    <!-- react-icons/fa's FaClone - first consumer in this migration, sourced from Font Awesome
         Free's own canonical solid/clone.svg (github.com/FortAwesome/Font-Awesome, 5.x branch);
         confirmed "FaClone" (bare, no "Reg" prefix) is the SOLID variant by cross-checking
         react-icons@5.6.0's fa/index.d.ts, which exports BOTH "FaClone" and "FaRegClone" (the
         same bare-vs-Reg convention this migration already relies on for FaCircle/FaRegCircle
         elsewhere). Old passed no explicit size (default "1em"). -->
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" style="margin-right:0.4rem" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M464 0c26.51 0 48 21.49 48 48v288c0 26.51-21.49 48-48 48H176c-26.51 0-48-21.49-48-48V48c0-26.51 21.49-48 48-48h288M176 416c-44.112 0-80-35.888-80-80V128H48c-26.51 0-48 21.49-48 48v288c0 26.51 21.49 48 48 48h288c26.51 0 48-21.49 48-48v-48H176z"/></svg>
{/snippet}

{#snippet faTrashIcon()}
    <!-- react-icons/fa's FaTrash, same sourcing; old passed color="#ed4557" (matching Player's own
         SongRow) + no explicit size. -->
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" style="color:#ed4557;margin-right:0.4rem" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M432 32H312l-9.4-18.7A24 24 0 0 0 281.1 0H166.8a23.72 23.72 0 0 0-21.4 13.3L136 32H16A16 16 0 0 0 0 48v32a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16zM53.2 467a48 48 0 0 0 47.9 45h245.8a48 48 0 0 0 47.9-45L416 128H32z"/></svg>
{/snippet}

{#if data.type === 'vsrg'}
    <div class="row">
        {t('menu:invalid_song')}
    </div>
{:else}
    <div class="song-row">
        <div class="song-name {hasTooltip(true)}" onclick={openInComposer} onkeydown={handleNameKeydown} role="button" tabindex="0">
            {#if isRenaming}
                <input
                    class="song-name-input {isRenaming ? 'song-rename' : ''}"
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
                {isRenaming ? t('menu:song_name') : t('menu:open_in_composer')}
            </Tooltip>
        </div>
        <div class="song-buttons-wrapper">
            <FloatingDropdown
                Icon={FaEllipsisH}
                ignoreClickOutside={isRenaming}
                style={buttonStyle}
                tooltip={t('settings:more_options')}
                onClose={() => isRenaming = false}
            >
                <AppButton
                    className="row row-centered"
                    style="padding:0.4rem"
                    onclick={toggleRename}
                >
                    {@render faPenIcon()}
                    <FloatingDropdownText text={isRenaming ? t('common:save') : t('common:rename')} />
                </AppButton>
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
                <FloatingDropdownRow style="width:100%" onclick={editSong}>
                    {@render faEditIcon()}
                    <FloatingDropdownText text={t('common:edit_song')} />
                </FloatingDropdownRow>
                <FloatingDropdownRow onclick={downloadSong}>
                    {@render faDownloadIcon('1em')}
                    <FloatingDropdownText text={t('common:download')} />
                </FloatingDropdownRow>
                {#if data.type === 'recorded' || data.type === 'composed'}
                    <FloatingDropdownRow onclick={downloadMidi}>
                        {@render faDownloadIcon('14')}
                        <FloatingDropdownText text={t('common:download_midi')} />
                    </FloatingDropdownRow>
                {/if}
                <FloatingDropdownRow onclick={cloneSong}>
                    {@render faCloneIcon()}
                    <FloatingDropdownText text={t('composer:clone_song')} />
                </FloatingDropdownRow>
                <FloatingDropdownRow onclick={() => functions.removeSong(data.name, data.id!)}>
                    {@render faTrashIcon()}
                    <FloatingDropdownText text={t('common:delete')} />
                </FloatingDropdownRow>
            </FloatingDropdown>
        </div>
    </div>
{/if}
