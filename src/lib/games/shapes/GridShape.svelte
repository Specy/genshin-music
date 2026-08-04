<script lang="ts">
  // Default Shape arrangement (ADR-0003): a rows×columns CSS grid, shared by every
  // grid-like Shape (genshin-3x7, sky-3x5, *-2x4, sky-2x3). Geometry is inline so it
  // wins over any legacy .keyboard/.keyboard-N class rules a surface still passes.
  import type { ShapeComponentProps } from '../types';

  let { shape, count, button, class: className = '', style = '' }: ShapeComponentProps = $props();

  const rows = $derived(Math.ceil(count / shape.columns));
</script>

<div
  class={className}
  style="display:grid;grid-template-columns:repeat({shape.columns},1fr);grid-template-rows:repeat({rows},1fr);{style}"
>
  {#each { length: count }, index (index)}
    {@render button(index)}
  {/each}
</div>
