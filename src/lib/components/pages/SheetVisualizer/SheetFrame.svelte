<script module lang="ts">
    import {Instrument} from '$lib/audio/Instrument.svelte'

    // old: `const baseInstrument = new Instrument()` declared at the TOP of SheetFrame.tsx, outside
    // the component function - a true module-scope singleton shared by every rendered frame (this
    // component is instantiated once per chunk, often dozens of times per page). `<script module>`
    // is the Svelte-5 equivalent: it runs once per module load and is shared across every instance,
    // matching old exactly (and avoiding rebuilding an Instrument's note/layout arrays per frame).
    const baseInstrument = new Instrument()
</script>

<script lang="ts">
    import {game} from '$game'
    import type {Chunk} from '$core/Songs/VisualSong'
    import type {Theme} from '$core/theme/ThemeProvider.svelte'
    import type {NoteNameType} from '$lib/games/types'
    import {cn, cs} from '$core/utils/Utilities'
    import './SheetFrame.css'

    // Old: src/components/pages/SheetVisualizer/SheetFrame.tsx (64 lines). One note-grid "frame"
    // tile - the small per-chunk sheet-music preview block. Pre-positioned here ahead of its real
    // consumer: Task 5's PlayerPagesRenderer renders this under the player keyboard (fed
    // RecordedSong chunks, duck-typed against this file's `Chunk` import - see VisualSong.ts's own
    // header comment, Task 1). The sheet-visualizer page itself (this task) uses the sibling
    // SheetFrame2, not this file.
    //
    // `memo(_SheetFrame, customComparator)` dropped: Svelte 5's fine-grained reactivity already
    // only re-runs the exact `$derived`/template expressions whose tracked dependencies changed -
    // there is no React-style "whole component re-renders whenever its parent re-renders" problem
    // to guard against here, so the manual shallow-prop-equality comparator has no equivalent need
    // (same reasoning already applied to this migration's `Memoized`/`MemoizedIcon` drops).
    //
    // Two-tier: `APP_NAME === 'Genshin' ? 7 : 5` -> `game.notes.perRow` (UI file, reads `$game`
    // directly per the P4b plan's mapping table row 2).
    //
    // `theme: Theme` stays an explicit prop (not read from the ThemeProvider singleton directly),
    // matching old exactly - callers (Task 5) pass their own theme value through, same as old.
    let {
        chunk,
        rows,
        hasText,
        keyboardLayout,
        selected,
        theme,
    }: {
        chunk: Chunk
        rows: number
        hasText: boolean
        keyboardLayout: NoteNameType
        selected?: boolean
        theme: Theme
    } = $props()

    const columnsPerRow = $derived(game.notes.perRow)
    const color = $derived(theme.layer('primary', 0.2).toString())
    const notes = $derived.by(() => {
        const result = new Array(columnsPerRow * rows).fill(false)
        chunk.notes.forEach(note => {
            result[note.index] = true
        })
        return result
    })
    // `cs([selected, {borderColor: 'var(--accent)'}])` returns a CSSProperties-shaped object (old's
    // React inline-style idiom) - Svelte's `style` attribute is string-only, so the single property
    // this call ever produces is read directly rather than generically stringifying the whole
    // object. This is the ONLY real consumer of `cs()` anywhere in the old codebase (verified via
    // `git grep '\bcs(' migration/next16-react19` - zero other hits outside its own Utilities.ts
    // definition), so there is no other call shape this would need to generalize for.
    const borderColor = $derived(cs([selected, {borderColor: 'var(--accent)'}]).borderColor)
</script>

<div
    class={cn(
        'frame-outer-smaller',
        [chunk.notes.length === 0, 'visualizer-ball']
    )}
    style={borderColor ? `border-color:${borderColor}` : ''}
>
    {#if chunk.notes.length === 0}
        <div></div>
    {:else}
        <div
            class="visualizer-frame"
            style="grid-template-columns:repeat({columnsPerRow},1fr);--selected-note-background:var(--accent)"
        >
            {#each notes as exists, i (i)}
                <div
                    class={exists ? 'frame-note-s' : 'frame-note-ns'}
                    style={!exists ? `background-color:${color}` : ''}
                >
                    {exists && hasText ? baseInstrument.getNoteText(i, keyboardLayout, 'C') : ''}
                </div>
            {/each}
        </div>
    {/if}
</div>
