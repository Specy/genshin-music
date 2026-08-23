<script lang="ts">
  import { game } from '$game';
  import type { Chunk } from '$core/Songs/RecordedSong';
  import { ThemeProvider as theme } from '$core/theme/ThemeProvider.svelte';
  import PlayerSheetFrame from './PlayerSheetFrame.svelte';
  import './VisualSheet.css';

  // One grid of Sheet Frames. The inline card feeds it the current page and the fullscreen card
  // feeds it every frame of the song, so the frames are addressed by their WHOLE-SONG index
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
  }: {
    chunks: Chunk[];
    columns: number;
    indexOffset: number;
    /** First and last frame the Section touches; everything outside the pair dims. */
    sectionFirstIndex: number;
    sectionLastIndex: number;
    openFrameIndex: number;
    onFrameSelect: (element: HTMLElement, chunk: Chunk, index: number) => void;
  } = $props();

  const layoutType = game.settings.defaultNoteNameType.sheetVisualizer;
  const dotColor = $derived(theme.layer('primary', 0.2).toString());
</script>

<div
  class="player-chunks-page"
  style="grid-template-columns:repeat({columns}, 1fr);--sheet-cols:{game.notes
    .perRow};--sheet-dot-color:{dotColor}"
>
  <!-- QUIRK: keyed by index on purpose — old reconciled on the array index, and chunks carry no stable id. Switching to a content key changes re-render behaviour, so this is the one place the "never key by index" rule does not apply. -->
  {#each chunks as chunk, i (i)}
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
</div>
