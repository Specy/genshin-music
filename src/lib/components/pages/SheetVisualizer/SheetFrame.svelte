<script module lang="ts">
  import { Instrument } from '$lib/audio/Instrument.svelte';

  // Module-scope so it's one shared singleton across every rendered frame (this component is
  // instantiated once per chunk, often dozens of times per page) rather than rebuilt per instance.
  const baseInstrument = new Instrument();
</script>

<script lang="ts">
  import { game } from '$game';
  import { SUSTAIN_VISUAL_THRESHOLD_MS } from '$core/legacyConfig';
  import type { Chunk } from '$core/Songs/VisualSong';
  import { songGridSlotForId } from '$core/Songs/noteIds';
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
    const result: (false | { held: boolean })[] = new Array(columnsPerRow * rows).fill(false);
    chunk.notes.forEach((note) => {
      //the player pipeline resolves displayButton at queue-build; anything unresolved
      //falls back to the id's canonical Song-Grid slot (ADR-0004: a game-authored grid
      //position, not the default instrument's button — the two coincide for both shipped
      //games). This frame still places by the note's OWN button, deliberately untouched
      //by ADR-0004; only the fallback's definition moved. Deliberately NOT the note's
      //`keyboardButton`: that is the key on the player's on-screen keyboard, a different
      //coordinate space (see RecordedNote), and these frames are not that keyboard.
      const button = note.displayButton !== -1 ? note.displayButton : songGridSlotForId(note.id);
      if (button >= 0 && button < result.length) {
        const existing = result[button];
        const held =
          note.duration >= SUSTAIN_VISUAL_THRESHOLD_MS || (existing !== false && existing.held);
        result[button] = { held };
      }
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
          style={!exists ? `background-color:${color}` : 'position:relative'}
        >
          {exists && hasText ? baseInstrument.getNoteText(i, keyboardLayout, 'C') : ''}
          {#if exists && exists.held}
            <!-- held-note marker (Duration over the visual threshold) -->
            <div
              style="position:absolute;bottom:8%;left:22%;right:22%;height:0.14rem;border-radius:1rem;background-color:currentColor;opacity:0.75;pointer-events:none"
            ></div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
