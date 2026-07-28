<script module lang="ts">
  import { Instrument } from '$lib/audio/Instrument.svelte';

  // Own module-scope singleton (see SheetFrame.svelte) - a separate Instrument instance, not
  // shared with that file's baseInstrument.
  const baseInstrument = new Instrument();
</script>

<script lang="ts">
  import { game } from '$game';
  import type { TempoChunk } from '$core/Songs/VisualSong';
  import type { Theme } from '$core/theme/ThemeProvider.svelte';
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
    multiColorRows,
    theme,
  }: {
    chunk: TempoChunk;
    rows: number;
    hasText: boolean;
    keyboardLayout: NoteNameType;
    multiColorRows: boolean;
    theme: Theme;
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
  const colors = $derived.by(() => {
    const color = theme.layer('primary', 0.2).toString();
    if (multiColorRows) {
      const base = theme.get('accent');
      return {
        none: color,
        rows: [base.hue(90).toString(), base.toString(), base.hue(-30).toString()],
      };
    }
    return {
      none: color,
      rows: ['var(--accent)', 'var(--accent)', 'var(--accent)'],
    };
  });
  // Produces the {column, notes, outerStyle} triples the template below iterates; outerStyle
  // folds the background/getBorderStyle(...) values into one CSS-text string per column so the
  // template attribute stays a simple single-expression interpolation.
  const columnsWithNotes = $derived.by(() => {
    return chunk.columns.map((column, i) => {
      const notes = new Array(columnsPerRow * rows).fill(false);
      column.notes.forEach((note) => {
        notes[note.note] = true;
      });
      const background =
        chunk.columns.length - 1 === i && chunk.endingTempoChanger !== chunk.tempoChanger
          ? `linear-gradient(to right, ${getBackgroundColor(chunk.tempoChanger)} 50%, ${getBackgroundColor(chunk.endingTempoChanger)} 50%)`
          : getBackgroundColor(chunk.tempoChanger);
      const outerStyle = `background:${background};${getBorderStyle(i, chunk.columns.length)}`;
      return { column, notes, outerStyle };
    });
  });
</script>

{#each columnsWithNotes as { column, notes, outerStyle }, i (i)}
  <div class="frame-outer-background" style={outerStyle}>
    <div class={['frame-outer', column.notes.length === 0 && 'visualizer-ball']}>
      <!-- Dead code, deliberately kept inert (disabled in old too, never rendered either
                 way): a never-finished "emptyAhead" hourglass-icon counter. Not a cleanup miss -
                 check with product before deleting or reviving it. -->
      {#if column.notes.length === 0}
        <div></div>
      {:else}
        <div class="visualizer-frame" style="grid-template-columns:repeat({columnsPerRow},1fr)">
          {#each notes as exists, j (j)}
            <div
              class={exists ? 'frame-note-s' : 'frame-note-ns'}
              style="{!exists
                ? `background-color:${colors.none};`
                : ''}--selected-note-background:{colors.rows[Math.floor(j / columnsPerRow)]}"
            >
              {exists && hasText ? baseInstrument.getNoteText(j, keyboardLayout, 'C') : ''}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/each}
