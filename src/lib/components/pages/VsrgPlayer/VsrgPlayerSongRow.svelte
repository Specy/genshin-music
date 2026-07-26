<script module lang="ts">
    // Old: src/app/_client-pages/vsrg-player/index.tsx's own exported `VsrgSongSelectType = 'play'`
    // - a trivial one-member literal type, kept alongside its sole real consumers (this file's own
    // props + the +page.svelte route's `onSongSelect` handler) rather than a dedicated shared types
    // file, same "small supporting type lives with its sole consumer" idiom SongMenu.svelte's own
    // `SongMenuRowProps`/PlayerSongRow.svelte's own `RecordedOrComposed` already established.
    export type VsrgSongSelectType = 'play'
</script>

<script lang="ts">
    import type {Folder} from '$core/Folder'
    import type {SongStorable} from '$core/Songs/Song'
    import type {VsrgSong} from '$core/Songs/VsrgSong'
    import {songService} from '$core/Services/SongService'
    import {songsStore} from '$stores/SongsStore.svelte'
    import {logger} from '$stores/LoggerStore.svelte'
    import {fileService} from '$core/Services/FileService'
    import {asyncConfirm} from '$stores/AsyncPromptStore.svelte'
    import {ThemeProvider} from '$core/theme/ThemeProvider.svelte'
    import {APP_NAME} from '$core/legacyConfig'
    import {t} from '$i18n/binding.svelte'
    import FloatingDropdown from '$cmp/utility/FloatingDropdown.svelte'
    import FloatingDropdownRow from '$cmp/utility/FloatingDropdownRow.svelte'
    import FloatingDropdownText from '$cmp/utility/FloatingDropdownText.svelte'
    import FaEllipsisH from '$cmp/icons/FaEllipsisH.svelte'
    import Tooltip from '$cmp/utility/Tooltip.svelte'
    import {hasTooltip} from '$cmp/utility/tooltip'

    // Old: src/components/pages/VsrgPlayer/VsrgPlayerMenu.tsx's local (non-exported) `SongRow`
    // component (lines ~161-265). Sibling file NOT explicitly named in this task's brief, required
    // for the SAME reason ComposerSongRow.svelte/PlayerSongRow.svelte/VsrgComposerSongRow.svelte
    // were before it: SongMenu.svelte's generic `SongComponent` prop needs a real `Component<T>`
    // reference, not a locally-scoped function - a "brief-silent sibling", same established
    // precedent. Named VsrgPlayerSongRow (not old's bare "SongRow") for the same
    // collision-avoidance reason as those three siblings.
    //
    // Old's `theme: Theme` prop DROPPED (same rationale as every other SongRow sibling this
    // migration ported): `ThemeProvider` imported directly instead, still used for the identical
    // `theme.layer('primary', 0.15).toString()` button-background computation.
    //
    // UNLIKE its structurally-closest sibling VsrgComposerSongRow.svelte (no practice/approach mode
    // buttons, no edit-song link, no MIDI-download row here either - same reduced action set: play/
    // rename/folder/download/delete), this file's OWN old blob genuinely routes every user-facing
    // string through `t()` (verified against the raw old blob - `useTranslation(['common', 'logs',
    // 'settings', 'menu', 'confirm'])`), NOT the raw untranslated English literals
    // VsrgComposerSongRow.svelte's own old blob used - a real, disclosed difference between the two
    // old files, not an inconsistency introduced here. `logs:could_not_find_song` (bare `t('...')`
    // calls resolve against the array's FIRST namespace, 'common' - but old's THREE
    // `logger.error(...)` call sites all explicitly use `i18n.t('logs:could_not_find_song')` or
    // `t('logs:could_not_find_song')`, already namespaced) and `confirm:delete_song` (WITH the
    // `{song_name: data.name}` interpolation old passed) are both reproduced exactly.
    let {
        data,
        folders,
        functions,
    }: {
        data: SongStorable
        folders: Folder[]
        functions: {
            onSongSelect: (song: VsrgSong, type: VsrgSongSelectType) => void
            setMenuVisible: (override: boolean) => void
        }
    } = $props()

    const buttonStyle = $derived(`background-color:${ThemeProvider.layer('primary', 0.15).toString()}`)

    let isRenaming = $state(false)
    // old: `useState(data.name)` + `useEffect(() => setSongName(data.name), [data.name])` - same
    // writable-$derived rewrite already established by every other SongRow sibling's own
    // "songName" field.
    let songName = $derived(data.name)

    async function openSong() {
        if (isRenaming) return
        const song = await songService.fromStorableSong(data)
        if (!song) return logger.error(t('logs:could_not_find_song'))
        functions.onSongSelect(song as VsrgSong, 'play')
        functions.setMenuVisible(false)
    }

    // old had no keyboard handler on the (bare onClick) song-name div - pre-existing a11y gap, same
    // additive role/tabindex/onkeydown fix already applied to every other SongRow sibling.
    function handleNameKeydown(e: KeyboardEvent) {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        openSong()
    }

    function toggleRename() {
        const wasRenaming = isRenaming
        if (wasRenaming) {
            songsStore.renameSong(data.id!, songName)
        }
        isRenaming = !wasRenaming
    }

    async function changeFolder(e: Event & {currentTarget: HTMLSelectElement}) {
        const id = e.currentTarget.value
        const song = await songService.getOneSerializedFromStorable(data)
        if (!song) return logger.error(t('logs:could_not_find_song'))
        songsStore.addSongToFolder(song, id !== '_None' ? id : null)
    }

    async function downloadSong() {
        const song = await songService.getOneSerializedFromStorable(data)
        if (!song) return logger.error(t('logs:could_not_find_song'))
        fileService.downloadSong(song, `${data.name}.${APP_NAME.toLowerCase()}sheet`)
    }

    async function deleteSong() {
        const confirm = await asyncConfirm(t('confirm:delete_song', {song_name: data.name}))
        if (!confirm) return
        songsStore.removeSong(data.id!)
    }
</script>

{#snippet faPenIcon()}
    <!-- react-icons/fa's FaPen, same source already verified for ComposerSongRow.svelte/
         VsrgComposerSongRow.svelte's own copies; old passed size={14} here. -->
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" style="margin-right:0.4rem" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><path d="M290.74 93.24l128.02 128.02-277.99 277.99-114.14 12.6C11.35 513.54-1.56 500.62.14 485.34l12.7-114.22 277.9-277.88zm207.2-19.06l-60.11-60.11c-18.75-18.75-49.16-18.75-67.91 0l-56.55 56.55 128.02 128.02 56.55-56.55c18.75-18.76 18.75-49.16 0-67.91z"/></svg>
{/snippet}

{#snippet faFolderIcon()}
    <!-- react-icons/fa's FaFolder, same source; old passed no explicit size (1em). -->
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" style="margin-right:0.4rem" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M464 128H272l-64-64H48C21.49 64 0 85.49 0 112v288c0 26.51 21.49 48 48 48h416c26.51 0 48-21.49 48-48V176c0-26.51-21.49-48-48-48z"/></svg>
{/snippet}

{#snippet faDownloadIcon()}
    <!-- react-icons/fa's FaDownload, same source; old passed size={14} here. -->
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" style="margin-right:0.4rem" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><path d="M216 0h80c13.3 0 24 10.7 24 24v168h87.7c17.8 0 26.7 21.5 14.1 34.1L269.7 378.3c-7.5 7.5-19.8 7.5-27.3 0L90.1 226.1c-12.6-12.6-3.7-34.1 14.1-34.1H192V24c0-13.3 10.7-24 24-24zm296 376v112c0 13.3-10.7 24-24 24H24c-13.3 0-24-10.7-24-24V376c0-13.3 10.7-24 24-24h146.7l49 49c20.1 20.1 52.5 20.1 72.6 0l49-49H488c13.3 0 24 10.7 24 24zm-124 88c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20zm64 0c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20z"/></svg>
{/snippet}

{#snippet faTrashIcon()}
    <!-- react-icons/fa's FaTrash, same source; old passed color="#ed4557" + explicit size={14}. -->
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" style="color:#ed4557;margin-right:0.4rem" height="14" width="14" xmlns="http://www.w3.org/2000/svg"><path d="M432 32H312l-9.4-18.7A24 24 0 0 0 281.1 0H166.8a23.72 23.72 0 0 0-21.4 13.3L136 32H16A16 16 0 0 0 0 48v32a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16zM53.2 467a48 48 0 0 0 47.9 45h245.8a48 48 0 0 0 47.9-45L416 128H32z"/></svg>
{/snippet}

{#if data.type !== 'vsrg'}
    <div class="row">
        {t('menu:invalid_song')}
    </div>
{:else}
    <div class="song-row">
        <div class="song-name {hasTooltip(true)}" onclick={openSong} onkeydown={handleNameKeydown} role="button" tabindex="0">
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
                {isRenaming ? t('menu:song_name') : t('menu:play_song')}
            </Tooltip>
        </div>
        <div class="song-buttons-wrapper">
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
                <FloatingDropdownRow onclick={downloadSong}>
                    {@render faDownloadIcon()}
                    <FloatingDropdownText text={t('common:download')} />
                </FloatingDropdownRow>
                <FloatingDropdownRow onclick={deleteSong}>
                    {@render faTrashIcon()}
                    <FloatingDropdownText text={t('common:delete')} />
                </FloatingDropdownRow>
            </FloatingDropdown>
        </div>
    </div>
{/if}
