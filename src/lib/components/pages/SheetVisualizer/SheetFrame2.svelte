<script module lang="ts">
    import {Instrument} from '$lib/audio/Instrument.svelte'

    // Same module-scope-singleton rationale as the sibling SheetFrame.svelte - old declared this
    // at file top-level too (a SEPARATE instance from SheetFrame.tsx's own `baseInstrument`, not
    // shared across the two files either there or here).
    const baseInstrument = new Instrument()
</script>

<script lang="ts">
    import {game} from '$game'
    import type {TempoChunk} from '$core/Songs/VisualSong'
    import type {Theme} from '$core/theme/ThemeProvider.svelte'
    import type {NoteNameType} from '$lib/games/types'
    import './SheetFrame.css'

    // Old: src/components/pages/SheetVisualizer/SheetFrame2.tsx (127 lines). The tempo-bracketed
    // sheet-music frame row the sheet-visualizer page (this task) actually renders - one call per
    // `VisualSong` chunk, each producing 1+ column tiles (tempo-changer brackets can group several
    // `TempoChunkColumn`s into one visual chunk).
    //
    // `memo(_SheetFrame2, customComparator)` dropped - same rationale as the sibling SheetFrame.svelte
    // (Svelte 5's fine-grained reactivity has no equivalent need for a manual shallow-prop guard).
    //
    // Old did NOT import `cn`/`cs` here (only SheetFrame.tsx did) - classes/styles below are built
    // as plain template strings, matching old's own template-literal className/inline-style-object
    // approach 1:1 in spirit.
    //
    // Two-tier: `APP_NAME === 'Genshin' ? 7 : 5` -> `game.notes.perRow` (UI file, table row 2).
    let {
        chunk,
        rows,
        hasText,
        keyboardLayout,
        multiColorRows,
        theme,
    }: {
        chunk: TempoChunk
        rows: number
        hasText: boolean
        keyboardLayout: NoteNameType
        multiColorRows: boolean
        theme: Theme
    } = $props()

    function getBackgroundColor(tempoChanger: number) {
        if (tempoChanger === 0) return 'transparent'
        return `var(--tempo-changer-${tempoChanger})`
    }

    // old returned a `React.CSSProperties` object; ported as a CSS-text fragment (Svelte's `style`
    // attribute is string-only) - same values, same two-branch/else-empty shape.
    function getBorderStyle(index: number, total: number): string {
        if (index === 0) {
            return 'border-top-left-radius:0.5rem;border-bottom-left-radius:0.5rem'
        } else if (index === total - 1) {
            return 'border-top-right-radius:0.5rem;border-bottom-right-radius:0.5rem'
        }
        return ''
    }

    const columnsPerRow = $derived(game.notes.perRow)
    const colors = $derived.by(() => {
        const color = theme.layer('primary', 0.2).toString()
        if (multiColorRows) {
            const base = theme.get('accent')
            return {
                none: color,
                rows: [
                    base.hue(90).toString(),
                    base.toString(),
                    base.hue(-30).toString()
                ]
            }
        }
        return {
            none: color,
            rows: [
                'var(--accent)',
                'var(--accent)',
                'var(--accent)',
            ]
        }
    })
    // old built this same per-column `notes` boolean array inline inside its `.map()` callback
    // (recomputed fresh every render, no memoization) - ported as a single $derived producing the
    // {column, notes, outerStyle} triples the template below iterates, the direct Svelte equivalent
    // of that same per-render (here: per-dependency-change) recomputation. `outerStyle` folds
    // together old's `background`/`getBorderStyle(...)` spread into one CSS-text string per column
    // (computed here rather than inline in the template attribute, purely to keep that attribute a
    // simple single-expression interpolation - same values/branches as old, no behavior change).
    const columnsWithNotes = $derived.by(() => {
        return chunk.columns.map((column, i) => {
            const notes = new Array(columnsPerRow * rows).fill(false)
            column.notes.forEach(note => {
                notes[note.note] = true
            })
            const background = (chunk.columns.length - 1) === i && chunk.endingTempoChanger !== chunk.tempoChanger
                ? `linear-gradient(to right, ${getBackgroundColor(chunk.tempoChanger)} 50%, ${getBackgroundColor(chunk.endingTempoChanger)} 50%)`
                : getBackgroundColor(chunk.tempoChanger)
            const outerStyle = `background:${background};${getBorderStyle(i, chunk.columns.length)}`
            return {column, notes, outerStyle}
        })
    })
</script>

{#each columnsWithNotes as {column, notes, outerStyle}, i (i)}
    <div class="frame-outer-background" style={outerStyle}>
        <div class="frame-outer {column.notes.length === 0 ? 'visualizer-ball' : ''}">
            <!--
                PRESERVED (commented out in old too, kept inert - JSX comment syntax translated to
                Svelte's equivalent, structure/intent unchanged, never rendered either way):
            {#if chunk.emptyAhead && i === chunk.columns.length - 1}
                <div class="frame-empty-counter">
                    <span style="font-size:0.6rem">
                        [FaHourglass icon]
                    </span>
                    {chunk.emptyAhead}
                </div>
            {/if}
            -->
            {#if column.notes.length === 0}
                <div></div>
            {:else}
                <div class="visualizer-frame" style="grid-template-columns:repeat({columnsPerRow},1fr)">
                    {#each notes as exists, j (j)}
                        <div
                            class={exists ? 'frame-note-s' : 'frame-note-ns'}
                            style="{!exists ? `background-color:${colors.none};` : ''}--selected-note-background:{colors.rows[Math.floor(j / columnsPerRow)]}"
                        >
                            {exists && hasText ? baseInstrument.getNoteText(j, keyboardLayout, 'C') : ''}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    </div>
{/each}
