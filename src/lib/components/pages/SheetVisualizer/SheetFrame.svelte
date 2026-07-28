<script module lang="ts">
  import { Instrument } from '$lib/audio/Instrument.svelte';

  // Module-scope so it's one shared singleton across every rendered frame (this component is
  // instantiated once per chunk, often dozens of times per page) rather than rebuilt per instance.
  const baseInstrument = new Instrument();
</script>

<script lang="ts">
  import { game } from '$game';
  import type { Chunk } from '$core/Songs/VisualSong';
  import type { Theme } from '$core/theme/ThemeProvider.svelte';
  import type { NoteNameType } from '$lib/games/types';
  import { cn, cs } from '$core/utils/Utilities';
  import './SheetFrame.css';

  // One note-grid "frame" tile - the small per-chunk sheet-music preview block rendered under
  // the player keyboard (fed RecordedSong chunks, duck-typed against this file's `Chunk` type).
  let {
    chunk,
    rows,
    hasText,
    keyboardLayout,
    selected,
    theme,
  }: {
    chunk: Chunk;
    rows: number;
    hasText: boolean;
    keyboardLayout: NoteNameType;
    selected?: boolean;
    theme: Theme;
  } = $props();

  const columnsPerRow = $derived(game.notes.perRow);
  const color = $derived(theme.layer('primary', 0.2).toString());
  const notes = $derived.by(() => {
    const result = new Array(columnsPerRow * rows).fill(false);
    chunk.notes.forEach((note) => {
      result[note.index] = true;
    });
    return result;
  });
  // cs() returns a CSSProperties-shaped object; Svelte's style attribute is string-only, so only
  // the one property this call produces is read directly rather than stringifying the whole object.
  const borderColor = $derived(cs([selected, { borderColor: 'var(--accent)' }]).borderColor);
</script>

<div
  class={cn('frame-outer-smaller', [chunk.notes.length === 0, 'visualizer-ball'])}
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
