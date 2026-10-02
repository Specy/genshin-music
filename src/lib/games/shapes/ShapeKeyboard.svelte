<script lang="ts" generics="N extends ShapeNote">
  // The "switch on Shape" entry point (ADR-0003): keyboard surfaces render this with
  // the instrument's resolved ShapeDefinition and that instrument's notes, and it
  // dispatches to that Shape's registered arrangement component. Adding a novel
  // arrangement = register a new Shape id with its own component; no surface changes.
  import type { Component } from 'svelte';
  import type { ShapeComponentProps, ShapeNote } from '../types';

  let {
    shape,
    notes,
    button,
    class: className = '',
    style = '',
  }: ShapeComponentProps<N> = $props();

  // The registry stores every arrangement at the base ShapeNote (one Record, many Shapes).
  // Re-instantiating it at THIS surface's note type is sound and is what keeps the surface's
  // own note object flowing out of the `button` snippet: an arrangement reads only ShapeNote
  // fields and hands the snippet back the very element it was given.
  const Arrangement = $derived(shape.component as unknown as Component<ShapeComponentProps<N>>);
</script>

<Arrangement {shape} {notes} {button} class={className} {style} />
