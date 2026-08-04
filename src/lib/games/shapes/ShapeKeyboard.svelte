<script lang="ts">
  // The "switch on Shape" entry point (ADR-0003): keyboard surfaces render this with
  // the instrument's resolved ShapeDefinition, and it dispatches to that Shape's
  // registered arrangement component. Adding a novel arrangement = register a new
  // Shape id with its own component; no surface changes.
  import type { ShapeComponentProps } from '../types';

  let { shape, count, button, class: className = '', style = '' }: ShapeComponentProps = $props();

  const Arrangement = $derived(shape.component);
</script>

<Arrangement {shape} {count} {button} class={className} {style} />
