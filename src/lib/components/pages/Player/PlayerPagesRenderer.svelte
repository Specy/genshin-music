<script lang="ts">
    import {game} from '$game'
    import SheetFrame from '$cmp/pages/SheetVisualizer/SheetFrame.svelte'
    import {playerControlsStore} from '$stores/PlayerControlsStore.svelte'
    import {ThemeProvider as theme} from '$core/theme/ThemeProvider.svelte'
    import './VisualSheet.css'

    // RecordedSong.ts and VisualSong.ts each declare their own, unrelated Chunk class - SheetFrame's
    // chunk prop is typed against VisualSong's, but the value passed below is a RecordedSong Chunk.
    // TypeScript accepts this structurally; don't assume the two types stay in sync.
    let {columns}: {columns: number} = $props()

    const layoutType = game.settings.defaultNoteNameType.sheetVisualizer
</script>

{#if playerControlsStore.pagesState.pages.length > 0}
    <div
        class="player-chunks-page"
        style="grid-template-columns:repeat({columns}, 1fr)"
    >
        {#each playerControlsStore.pagesState.currentPage as chunk, i (i)}
            <SheetFrame
                keyboardLayout={layoutType}
                {theme}
                selected={i === playerControlsStore.pagesState.currentChunkIndex}
                {chunk}
                rows={3}
                hasText={false}
            />
        {/each}
    </div>
{/if}
