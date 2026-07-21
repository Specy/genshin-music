<script lang="ts">
    import type {SerializedSong, SongStorable} from '$core/Songs/Song'
    import {songService} from '$core/Services/SongService'
    import {logger} from '$stores/LoggerStore.svelte'
    import {t} from '$i18n/binding.svelte'

    // Old: src/components/pages/SheetVisualizer/SheetVisualizerMenu.tsx's local (non-exported)
    // `SongRow` component, the sheet-visualizer menu's own SongMenu row. Not literally named in
    // this task's brief Files list (the brief describes it as "inline SongRow" living inside
    // SheetVisualizerMenu.tsx, matching old's file layout) - but SongMenu.svelte's own generics
    // contract requires an actual `Component<T>` reference for its `SongComponent` prop (a real
    // capitalized component, not a snippet - see SongMenu.svelte's own header comment), so a
    // sibling file is required the same way ErrorSongRow.svelte already was for the error page's
    // own row (P4a Task 5) - same "restore/add-with-consumer" disclosure category. Named
    // SheetVisualizerSongRow (not old's bare "SongRow") for the same collision-avoidance reason
    // ErrorSongRow was: every future SongMenu consumer (Composer/Player/VsrgComposer/VsrgPlayer
    // menus, still to come) needs its own row component with a different componentProps shape.
    //
    // CSS (.song-row/.song-name) is already global (App.css) - no component-local <style> needed,
    // same as ErrorSongRow.svelte.
    let {
        data,
        current,
        onClick,
    }: {
        data: SongStorable
        current: SerializedSong | null
        onClick: (song: SerializedSong) => void
    } = $props()

    // old: `current?.id === data.id ? {backgroundColor: 'rgb(124, 116, 106)'} : {}`, spread before
    // a literal `padding: '0.5rem 0.8rem'` in the same style object - ported as a plain CSS-text
    // string (this migration's established idiom for inline style objects, e.g. Card.svelte), same
    // rgb() literal preserved verbatim.
    const selectedStyle = $derived(current?.id === data.id ? 'background-color:rgb(124, 116, 106);' : '')

    async function handleClick() {
        logger.showPill(t('logs:loading_song'))
        const song = await songService.getOneSerializedFromStorable(data)
        if (!song) return logger.error(t('logs:could_not_load_song'))
        onClick(song)
        setTimeout(() => logger.hidePill(), 300)
    }

    // old had no keyboard handler on the (bare onClick) row div - pre-existing a11y gap, same
    // additive role/tabindex/onkeydown fix already applied to SongFolder.svelte/DecoratedCard.svelte
    // /Home.svelte's own bare-onClick divs in earlier tasks.
    function handleKeydown(e: KeyboardEvent) {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        handleClick()
    }
</script>

<div
    class="song-row"
    style="{selectedStyle}padding:0.5rem 0.8rem"
    onclick={handleClick}
    onkeydown={handleKeydown}
    role="button"
    tabindex="0"
>
    <div class="song-name">{data.name}</div>
</div>
