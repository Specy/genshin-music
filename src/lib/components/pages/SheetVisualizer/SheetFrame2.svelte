<script module lang="ts">
  import { Instrument } from '$lib/audio/Instrument.svelte';

  // Own module-scope singleton (see SheetFrame.svelte) - a separate Instrument instance, not
  // shared with that file's baseInstrument.
  const baseInstrument = new Instrument();
</script>

<script lang="ts">
  import { game } from '$game';
  import type { TempoChunk } from '$core/Songs/VisualSong';
  import type { NoteNameType } from '$lib/games/types';
  import './SheetFrame.css';

  // The tempo-bracketed sheet-music frame row the sheet-visualizer page renders - one call per
  // `VisualSong` chunk, each producing 1+ column tiles (tempo-changer brackets can group several
  // `TempoChunkColumn`s into one visual chunk).
  let {
    chunk,
    rows,
    hasText,
    keyboardLayout,
  }: {
    chunk: TempoChunk;
    rows: number;
    hasText: boolean;
    keyboardLayout: NoteNameType;
  } = $props();

  function getBackgroundColor(tempoChanger: number) {
    if (tempoChanger === 0) return 'transparent';
    return `var(--tempo-changer-${tempoChanger})`;
  }

  function getBorderStyle(index: number, total: number): string {
    if (index === 0) {
      return 'border-top-left-radius:0.5rem;border-bottom-left-radius:0.5rem';
    } else if (index === total - 1) {
      return 'border-top-right-radius:0.5rem;border-bottom-right-radius:0.5rem';
    }
    return '';
  }

  const columnsPerRow = $derived(game.notes.perRow);
  // Produces the {column, filledNotes, outerStyle} triples the template below iterates; outerStyle
  // folds the background/getBorderStyle(...) values into one CSS-text string per column so the
  // template attribute stays a simple single-expression interpolation.
  const columnsWithNotes = $derived.by(() => {
    return chunk.columns.map((column, i) => {
      // eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local accumulator, never UI-observed
      const byCell = new Map<number, boolean>();
      const max = columnsPerRow * rows;
      column.notes.forEach((note) => {
        const cell = note.note;
        if (cell < 0 || cell >= max) return;
        const held = note.held || (byCell.get(cell) ?? false);
        byCell.set(cell, held);
      });
      const filledNotes = [...byCell.entries()].map(([cell, held]) => {
        const rowIndex = Math.floor(cell / columnsPerRow);
        return {
          cell,
          held,
          rowIndex,
          gridRow: rowIndex + 1,
          gridColumn: (cell % columnsPerRow) + 1,
        };
      });
      const background =
        chunk.columns.length - 1 === i && chunk.endingTempoChanger !== chunk.tempoChanger
          ? `linear-gradient(to right, ${getBackgroundColor(chunk.tempoChanger)} 50%, ${getBackgroundColor(chunk.endingTempoChanger)} 50%)`
          : getBackgroundColor(chunk.tempoChanger);
      const outerStyle = `background:${background};${getBorderStyle(i, chunk.columns.length)}`;
      return { column, filledNotes, outerStyle };
    });
  });
</script>

{#each columnsWithNotes as { column, filledNotes, outerStyle }, i (i)}
  <div class="frame-outer-background" style={outerStyle}>
    <div class={['frame-outer', column.notes.length === 0 && 'visualizer-ball']}>
      <!-- Dead code, deliberately kept inert (disabled in old too, never rendered either
                 way): a never-finished "emptyAhead" hourglass-icon counter. Not a cleanup miss -
                 check with product before deleting or reviving it. -->
      {#if column.notes.length === 0}
        <div></div>
      {:else}
        <div class="visualizer-frame">
          {#each filledNotes as f (f.cell)}
            <div
              class={f.held ? 'frame-note-s frame-note-held' : 'frame-note-s'}
              style="grid-row:{f.gridRow};grid-column:{f.gridColumn};--selected-note-background:var(--sheet-row-color-{f.rowIndex})"
            >
              {f && hasText ? baseInstrument.getNoteText(f.cell, keyboardLayout, 'C') : ''}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/each}
