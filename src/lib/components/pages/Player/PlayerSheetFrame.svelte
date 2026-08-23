<script lang="ts">
  import type { Chunk } from '$core/Songs/RecordedSong';
  import type { NoteNameType } from '$lib/games/types';
  import type { Theme } from '$core/theme/ThemeProvider.svelte';
  import SheetFrame from '$cmp/pages/SheetVisualizer/SheetFrame.svelte';
  import { playerControlsStore } from '$stores/PlayerControlsStore.svelte';
  import { t } from '$i18n/binding.svelte';

  // The player's half of a Sheet Frame. SheetFrame itself only draws the note grid, and it shares
  // SheetFrame.css with the sheet-visualizer's SheetFrame2 - the Section markers, the dimming and
  // the click target that opens the frame popover therefore live out here, in a component only the
  // player renders, rather than as props threaded into a shared one.
  //
  // RecordedSong.ts and VisualSong.ts each declare their own, unrelated Chunk class - SheetFrame's
  // chunk prop is typed against VisualSong's, but the value passed below is a RecordedSong Chunk.
  // TypeScript accepts this structurally; don't assume the two types stay in sync.
  let {
    chunk,
    index,
    dimmed,
    bracketStart,
    bracketEnd,
    expanded,
    keyboardLayout,
    theme,
    onSelect,
  }: {
    chunk: Chunk;
    /** Position in the WHOLE song's frame list, not in the page being rendered. */
    index: number;
    dimmed: boolean;
    bracketStart: boolean;
    bracketEnd: boolean;
    expanded: boolean;
    keyboardLayout: NoteNameType;
    theme: Theme;
    onSelect: (element: HTMLElement, chunk: Chunk, index: number) => void;
  } = $props();
</script>

<div class="player-sheet-frame" data-frame-index={index}>
  {#if bracketStart}
    <div class="sheet-frame-bracket sheet-frame-bracket-start"></div>
  {/if}
  {#if bracketEnd}
    <div class="sheet-frame-bracket sheet-frame-bracket-end"></div>
  {/if}
  <!-- Out-of-Section frames dim but stay live: they are the targets that let the Section be
       widened or moved, so an inert one would defeat the point of drawing them at all. -->
  <button
    class="sheet-frame-target"
    class:sheet-frame-dimmed={dimmed}
    aria-haspopup="menu"
    aria-expanded={expanded}
    aria-label={t('player:sheet_frame_options')}
    onclick={(e) => onSelect(e.currentTarget, chunk, index)}
  >
    <SheetFrame
      {chunk}
      {theme}
      {keyboardLayout}
      rows={3}
      hasText={false}
      selected={index === playerControlsStore.currentGlobalChunkIndex}
    />
  </button>
</div>

<style>
  .player-sheet-frame {
    position: relative;
  }

  .sheet-frame-target {
    display: block;
    width: 100%;
    padding: 0;
    margin: 0;
    border: none;
    background: none;
    color: inherit;
    cursor: pointer;
  }

  .sheet-frame-dimmed {
    opacity: 0.5;
  }

  /* The Section's bounds, drawn AROUND the frame rather than on it: the frame's own border is the
     playback cursor (SheetFrame's `selected`), and the two must stay distinguishable. Absolute and
     pointer-events:none so neither the grid's layout nor the frame's click target can shift. The
     0.25rem overhang eats into the 0.2rem grid gap, so the grid it is rendered in needs at least
     that much inset around it (PlayerSheetCard gives the grid a 0.4rem margin). */
  .sheet-frame-bracket {
    position: absolute;
    top: -0.25rem;
    bottom: -0.25rem;
    width: 32%;
    border: 0.15rem solid var(--accent);
    pointer-events: none;
    z-index: 1;
  }

  .sheet-frame-bracket-start {
    left: -0.25rem;
    border-right: none;
    border-radius: 0.65rem 0 0 0.65rem;
  }

  .sheet-frame-bracket-end {
    right: -0.25rem;
    border-left: none;
    border-radius: 0 0.65rem 0.65rem 0;
  }
</style>
