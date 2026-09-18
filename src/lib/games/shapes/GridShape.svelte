<script lang="ts" generics="N extends ShapeNote">
  // Default Shape arrangement (ADR-0003): a rows×columns CSS grid, shared by every
  // grid-like Shape (genshin-3x7, sky-3x5, *-2x4, sky-2x3). Geometry is inline so it
  // wins over any legacy .keyboard/.keyboard-N class rules a surface still passes.
  //
  // It draws SLOTS in order (row-major auto-flow = the grid's own placement), asking the
  // Shape where each note goes rather than assuming authored order (ADR-0005 §2). Every
  // shipped Shape uses the identity assignment, so this is exactly the notes array in
  // order — but a content-aware grid can hand back a different placement and this
  // component needs no change.
  import type { ShapeComponentProps, ShapeNote } from '../types';
  import { placeNotes } from './assignment';

  let {
    shape,
    notes,
    button,
    class: className = '',
    style = '',
  }: ShapeComponentProps<N> = $props();

  const slots = $derived(placeNotes(shape, notes));
  const rows = $derived(Math.ceil(slots.length / shape.columns));
</script>

<div
  class={className}
  style="display:grid;grid-template-columns:repeat({shape.columns},1fr);grid-template-rows:repeat({rows},1fr);{style}"
>
  {#each slots as placed, slot (slot)}
    {#if placed}
      {@render button(placed.note, placed.button)}
    {:else}
      <!-- a slot no note takes: only possible under a non-identity assignment, and the
           cell must still be occupied so the following slots keep their positions -->
      <div></div>
    {/if}
  {/each}
</div>
