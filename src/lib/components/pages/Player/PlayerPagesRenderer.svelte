<script lang="ts">
  import { game } from '$game';
  import type { Chunk } from '$core/Songs/RecordedSong';
  import { ThemeProvider as theme } from '$core/theme/ThemeProvider.svelte';
  import PlayerSheetFrame from './PlayerSheetFrame.svelte';

  // One grid of Sheet Frames. The inline card feeds it the current page and the fullscreen card a
  // row window into the full song, so the frames are addressed by their WHOLE-SONG index
  // (`indexOffset` + the each-index) - the Section markers and the playback cursor are both
  // computed in that space and would otherwise disagree between the two views.
  let {
    chunks,
    columns,
    indexOffset,
    sectionFirstIndex,
    sectionLastIndex,
    openFrameIndex,
    onFrameSelect,
    virtualLayout,
  }: {
    chunks: Chunk[];
    columns: number;
    indexOffset: number;
    /** First and last frame the Section touches; everything outside the pair dims. */
    sectionFirstIndex: number;
    sectionLastIndex: number;
    openFrameIndex: number;
    onFrameSelect: (element: HTMLElement, chunk: Chunk, index: number) => void;
    /** Spacer geometry for the fullscreen row window; absent for the ordinary inline page. */
    virtualLayout?: { paddingTop: number; paddingBottom: number };
  } = $props();

  const layoutType = game.settings.defaultNoteNameType.sheetVisualizer;
  const dotColor = $derived(theme.layer('primary', 0.2).toString());
</script>

{#snippet frames()}
  <!-- QUIRK: keyed by POSITION on purpose — chunks carry no stable id. Inline keeps the old
       page-local index reconciliation; the virtual window uses the whole-song index so rows that
       remain mounted are not rebuilt when an overscan row enters or leaves. This is the one place
       the "never key by index" rule does not apply. -->
  {#each chunks as chunk, i (virtualLayout ? indexOffset + i : i)}
    {@const index = indexOffset + i}
    <PlayerSheetFrame
      {chunk}
      {index}
      keyboardLayout={layoutType}
      dimmed={index < sectionFirstIndex || index > sectionLastIndex}
      bracketStart={index === sectionFirstIndex}
      bracketEnd={index === sectionLastIndex}
      expanded={index === openFrameIndex}
      onSelect={onFrameSelect}
    />
  {/each}
{/snippet}

<div
  class={['player-chunks-page', virtualLayout && 'player-chunks-page-virtual']}
  style={`grid-template-columns:repeat(${columns}, 1fr);--sheet-cols:${game.notes.perRow};--sheet-dot-color:${dotColor}${virtualLayout ? `;padding-top:${virtualLayout.paddingTop}px;padding-bottom:${virtualLayout.paddingBottom}px` : ''}`}
>
  {#if virtualLayout}
    <!-- Kept separate from the tall spacer so opening can animate this small mounted band only. -->
    <div class="player-chunks-window" style="grid-template-columns:repeat({columns}, 1fr)">
      {@render frames()}
    </div>
  {:else}
    {@render frames()}
  {/if}
</div>

<style>
  /* Grid only: PlayerSheetCard owns where the sheet sits and how wide it is, because the same grid is
     rendered twice - one page inside the inline card, every frame inside the expanded one. */
  .player-chunks-page {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.2rem;
  }

  /* The virtual page's padding is the logical full-song height. Its child is only the mounted row
     window, which stays cheap to translate during the opening reveal. */
  .player-chunks-page.player-chunks-page-virtual {
    display: block;
  }

  .player-chunks-window {
    display: grid;
    gap: 0.2rem;
  }
</style>
