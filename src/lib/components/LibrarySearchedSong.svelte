<script module lang="ts">
    // Old: src/types/GeneralTypes.ts's `SearchedSongType` (3 fields) - not ported as a shared
    // types file this task (only this component and its sole consumer, PlayerMenu.svelte, need
    // it), so it's declared here instead and re-exported for PlayerMenu.svelte to import, the
    // same "component file also hosts its own small supporting type" idiom already established by
    // SongMenu.svelte's `SongMenuRowProps` / FilePicker.svelte's `FileElement`.
    export type SearchedSongType = {
        name: string
        file: string
        error: string
    }
</script>

<script lang="ts">
    import {logger} from '$stores/LoggerStore.svelte'
    import {songService} from '$core/Services/SongService'
    import {ThemeProvider} from '$core/theme/ThemeProvider.svelte'
    import type {ComposedSong} from '$core/Songs/ComposedSong'
    import type {RecordedSong} from '$core/Songs/RecordedSong'

    // Old: src/components/shared/Miscellaneous/LibrarySearchedSong.tsx (66 lines, default export
    // `SearchedSong`). CSS (.song-row/.song-name/.song-buttons-wrapper/.song-button) is already
    // global (App.css) - no component-local <style> needed, same as ErrorSongRow.svelte/
    // SheetVisualizerSongRow.svelte.
    //
    // `theme: Theme` prop DROPPED: old's sole call site (PlayerMenu.tsx) always passed the same
    // `useTheme()` singleton through as a prop; every already-ported component that needs the
    // current theme (SongMenu.svelte, SongFolder.svelte, etc.) instead imports the `ThemeProvider`
    // singleton directly rather than threading a live class instance through props - the
    // established convention this file follows too. Zero behavioral difference (ThemeProvider IS
    // the same singleton `useTheme()` always returned); disclosed here since it changes this
    // component's prop surface vs the literal old one.
    //
    // No i18n: old imported no `useTranslation` here at all (aria-label and the two logger.error
    // calls are raw, un-translated English literals) - a genuine pre-existing gap in the old app,
    // reproduced byte-for-byte rather than "fixed" by adding translation now.
    //
    // FaDownload/FaSpinner (react-icons/fa) inlined as raw <svg> local snippets, fetched from
    // unpkg.com/react-icons@5.6.0/fa/index.mjs - old passed both bare (default 1em, no
    // className/style), reproduced the same way.
    let {
        onClick,
        importSong,
        data,
    }: {
        onClick: (song: ComposedSong | RecordedSong, start: number) => void
        importSong: (song: ComposedSong | RecordedSong) => void
        data: SearchedSongType
    } = $props()

    let fetching = $state(false)
    let cache: RecordedSong | ComposedSong | null = $state(null)

    async function download() {
        if (fetching) return
        try {
            if (cache) return importSong(cache.clone())
            fetching = true
            let song = await fetch('https://sky-music.herokuapp.com/api/songs?get=' + encodeURI(data.file)).then(res => res.json())
            fetching = false
            song = songService.parseSong(song)
            cache = song
            importSong(song)
        } catch (e) {
            fetching = false
            console.error(e)
            logger.error('Error downloading song')
        }
    }

    async function play() {
        if (fetching) return
        try {
            if (cache) return onClick(cache, 0)
            fetching = true
            let song = await fetch('https://sky-music.herokuapp.com/api/songs?get=' + encodeURI(data.file)).then(res => res.json())
            fetching = false
            song = songService.parseSong(song)
            onClick(song, 0)
            cache = song
        } catch (e) {
            console.error(e)
            fetching = false
            logger.error('Error downloading song')
        }
    }

    // old had no keyboard handler on the (bare onClick) row div - pre-existing a11y gap, same
    // additive role/tabindex/onkeydown fix already applied to SongFolder.svelte/
    // SheetVisualizerSongRow.svelte's own bare-onClick divs in earlier tasks.
    function handleKeydown(e: KeyboardEvent) {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        play()
    }
</script>

{#snippet downloadIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M216 0h80c13.3 0 24 10.7 24 24v168h87.7c17.8 0 26.7 21.5 14.1 34.1L269.7 378.3c-7.5 7.5-19.8 7.5-27.3 0L90.1 226.1c-12.6-12.6-3.7-34.1 14.1-34.1H192V24c0-13.3 10.7-24 24-24zm296 376v112c0 13.3-10.7 24-24 24H24c-13.3 0-24-10.7-24-24V376c0-13.3 10.7-24 24-24h146.7l49 49c20.1 20.1 52.5 20.1 72.6 0l49-49H488c13.3 0 24 10.7 24 24zm-124 88c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20zm64 0c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20z"/></svg>
{/snippet}

{#snippet spinnerIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M304 48c0 26.51-21.49 48-48 48s-48-21.49-48-48 21.49-48 48-48 48 21.49 48 48zm-48 368c-26.51 0-48 21.49-48 48s21.49 48 48 48 48-21.49 48-48-21.49-48-48-48zm208-208c-26.51 0-48 21.49-48 48s21.49 48 48 48 48-21.49 48-48-21.49-48-48-48zM96 256c0-26.51-21.49-48-48-48S0 229.49 0 256s21.49 48 48 48 48-21.49 48-48zm12.922 99.078c-26.51 0-48 21.49-48 48s21.49 48 48 48 48-21.49 48-48c0-26.509-21.491-48-48-48zm294.156 0c-26.51 0-48 21.49-48 48s21.49 48 48 48 48-21.49 48-48c0-26.509-21.49-48-48-48zM108.922 60.922c-26.51 0-48 21.49-48 48s21.49 48 48 48 48-21.49 48-48-21.491-48-48-48z"/></svg>
{/snippet}

<div class="song-row">
    <div class="song-name" onclick={play} onkeydown={handleKeydown} role="button" tabindex="0">
        {data.name}
    </div>
    <div class="song-buttons-wrapper">
        <button
            class="song-button"
            onclick={download}
            aria-label={`Import song ${data.name}`}
            style="background-color:{ThemeProvider.layer('primary', 0.2).hex()};margin-right:0"
        >
            {#if fetching}
                {@render spinnerIcon()}
            {:else}
                {@render downloadIcon()}
            {/if}
        </button>
    </div>
</div>
