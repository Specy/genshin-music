<script lang="ts">
    import type {SerializedSong, SongStorable} from '$core/Songs/Song'
    import {songService} from '$core/Services/SongService'
    import {logger} from '$stores/LoggerStore.svelte'
    import {t} from '$i18n/binding.svelte'
    import SongActionButton from '$cmp/inputs/SongActionButton.svelte'

    // Old: src/app/_client-pages/error/index.tsx's local (non-exported) SongRow component, the
    // error page's own SongMenu row. Named ErrorSongRow (not the bare "SongRow" old used) since
    // every future SongMenu consumer (Composer/Player/VsrgComposer/VsrgPlayer/SheetVisualizer
    // menus, Phase 4b) needs its OWN row component with a different componentProps shape - a
    // shared bare name would collide.
    //
    // CSS (.song-row/.song-name/.song-buttons-wrapper/.song-button) is already global (App.css) -
    // no component-local <style> needed.
    //
    // Old rendered raw `<button className="song-button">` twice rather than reusing the
    // ALREADY-EXISTING (in old code too) `SongActionButton` component - an old inconsistency (the
    // component predates this file and produces byte-identical DOM/classes: `.song-button
    // {hasTooltip} {className}`, aria-label, onClick, children). Substituted here for the
    // already-ported inputs/SongActionButton.svelte instead of re-inlining a second copy of the
    // same button markup - zero DOM/class difference, matches this migration's established
    // component-reuse convention.
    //
    // FaDownload/FaTrash (react-icons/fa) inlined as raw <svg> local snippets, fetched from
    // unpkg.com/react-icons@5.6.0/fa/index.mjs - old passed these bare (default 1em) except FaTrash's
    // `color="#ed4557"` (maps to an inline `style="color:#ed4557"` per react-icons' IconBase source:
    // `style: {color: props.color || conf.color, ...}` - since fill stays "currentColor", the CSS
    // `color` property is what actually drives the paint).
    let {
        data,
        deleteSong,
        download,
    }: {
        data: SongStorable
        deleteSong: (name: string, id: string) => void
        download: (song: SerializedSong) => void
    } = $props()

    async function handleDownload() {
        const song = await songService.getOneSerializedFromStorable(data)
        if (!song) return logger.error(t('logs:could_not_find_song'))
        download(song)
    }
</script>

{#snippet downloadIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M216 0h80c13.3 0 24 10.7 24 24v168h87.7c17.8 0 26.7 21.5 14.1 34.1L269.7 378.3c-7.5 7.5-19.8 7.5-27.3 0L90.1 226.1c-12.6-12.6-3.7-34.1 14.1-34.1H192V24c0-13.3 10.7-24 24-24zm296 376v112c0 13.3-10.7 24-24 24H24c-13.3 0-24-10.7-24-24V376c0-13.3 10.7-24 24-24h146.7l49 49c20.1 20.1 52.5 20.1 72.6 0l49-49H488c13.3 0 24 10.7 24 24zm-124 88c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20zm64 0c0-11-9-20-20-20s-20 9-20 20 9 20 20 20 20-9 20-20z" /></svg>
{/snippet}

{#snippet trashIcon()}
    <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 448 512" style="color:#ed4557" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M432 32H312l-9.4-18.7A24 24 0 0 0 281.1 0H166.8a23.72 23.72 0 0 0-21.4 13.3L136 32H16A16 16 0 0 0 0 48v32a16 16 0 0 0 16 16h416a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16zM53.2 467a48 48 0 0 0 47.9 45h245.8a48 48 0 0 0 47.9-45L416 128H32z" /></svg>
{/snippet}

<div class="song-row">
    <div class="song-name">{data.name}</div>
    <div class="song-buttons-wrapper">
        <SongActionButton onclick={handleDownload} ariaLabel={t('menu:download_song', {song_name: data.name})}>
            {@render downloadIcon()}
        </SongActionButton>
        <SongActionButton onclick={() => deleteSong(data.name, data.id as string)} ariaLabel={t('menu:delete_song', {song_name: data.name})}>
            {@render trashIcon()}
        </SongActionButton>
    </div>
</div>
