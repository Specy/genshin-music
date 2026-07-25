<script lang="ts">
    import {game} from '$game'
    import SheetFrame from '$cmp/pages/SheetVisualizer/SheetFrame.svelte'
    import {playerControlsStore} from '$stores/PlayerControlsStore.svelte'
    import {ThemeProvider as theme} from '$core/theme/ThemeProvider.svelte'
    import './VisualSheet.css'

    // Old: src/components/pages/Player/PlayerPagesRenderer.tsx (42 lines) - the file's own default
    // export is named `_PlayerVisualSheetRenderer`/wrapped as `PlayerVisualSheetRenderer` (NOT
    // matching the FILE's name `PlayerPagesRenderer.tsx` - a real, pre-existing naming mismatch in
    // old, preserved here rather than "fixed"). Svelte has no way to add a second, differently-named
    // export of a component from within its own .svelte file (the file's default export IS the
    // component) - the direct structural equivalent of old's `import {PlayerVisualSheetRenderer}
    // from "./PlayerPagesRenderer"` is a default import aliased at the call site:
    // `import PlayerVisualSheetRenderer from '$cmp/pages/Player/PlayerPagesRenderer.svelte'`
    // (this task's own PlayerSongControls.svelte does exactly that). This is plain ES-module default-
    // import aliasing, not a workaround - the file/export-name mismatch is mechanically unavoidable
    // when translating a named export into Svelte's one-component-per-file model, not a behavior
    // change.
    //
    // `useObservableObject(playerControlsStore.pagesState)` -> `playerControlsStore.pagesState` is
    // already `$state`-backed (Task 1), so `.pages`/`.currentPage`/`.currentChunkIndex` are read
    // directly below and stay reactive wherever referenced, no wrapper needed (same precedent as
    // every other store read this migration).
    //
    // `useTheme()` (old, a debounced mobx subscription hook returning `[theme]`) -> the reactive
    // `ThemeProvider` singleton read directly (Task 4's established pattern, e.g. SheetFrame.svelte/
    // PlayerNote.svelte), passed straight through to SheetFrame's own `theme` prop exactly as old did.
    //
    // Two-tier: old's module-level constant `const layoutType = APP_NAME === 'Genshin' ? 'Keyboard
    // layout' : 'ABC'` (computed once, outside the component, game-independent per render) ->
    // `game.settings.defaultNoteNameType.sheetVisualizer` ($lib/games/types.ts:172, both
    // genshin/index.ts:466 and sky/index.ts:837 already cite this exact old ternary as its source).
    // Kept as a plain top-level `const` (not `$derived`) - `game` is a fixed, build-time-baked
    // singleton with no reactive dependency, so a derived rune would add reactivity machinery for a
    // value that structurally can never change while the app runs, same as old's own module-constant
    // shape.
    //
    // `pagesState.currentPage?.map((e, i) => <SheetFrame key={i} .../>)`'s optional-chain is a no-op
    // (`PagesState.currentPage: Chunk[]` is never actually undefined, Task 1) - dropped as a
    // mechanical simplification (same class of decision as dropping React fragments/memo() elsewhere
    // in this migration), and `key={i}` (index-based, not content-based) is preserved verbatim as the
    // `{#each ... (i)}` key below, matching old's own reconciliation key exactly.
    //
    // `chunk={e}` feeds a `$core/Songs/RecordedSong` `Chunk` instance into SheetFrame's own
    // `$core/Songs/VisualSong` `Chunk`-typed prop - a deliberate duck-typed mismatch old already had
    // (see VisualSong.ts's own header comment, Task 1, and SheetFrame.svelte's header comment,
    // Task 2) - preserved exactly as old wired it, not unified.
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
