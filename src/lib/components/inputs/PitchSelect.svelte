<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';
  import { PITCHES } from '$core/sharedConfig';
  import type { Pitch } from '$lib/games/types';

  // PITCHES stopped being game-data with ADR-0003: it is shared music theory
  // (was byte-identical in both GameDefinitions), so it now lives in
  // $core/sharedConfig — a legitimate shared-constant import for UI code.
  let {
    selected,
    onChange,
    style = '',
    children,
    class: cls = '',
  }: {
    selected: Pitch;
    onChange: (pitch: Pitch) => void;
    style?: string;
    children?: Snippet;
    class?: ClassValue;
  } = $props();

  function handleChange(e: Event & { currentTarget: EventTarget & HTMLSelectElement }) {
    onChange(e.currentTarget.value as Pitch);
    e.currentTarget.blur();
  }
</script>

<select
  class={['select', cls]}
  style="width:100%;padding:0.3rem;{style}"
  onchange={handleChange}
  value={selected}
>
  {@render children?.()}
  {#each PITCHES as pitch (pitch)}
    <option>{pitch}</option>
  {/each}
</select>

<style>
  /* Same duplicated `.select`/`:focus`/`option:checked` block as `InstrumentSelect.svelte` (see
       its own comment for why this can't just cascade from `inputs/Select.svelte`). This file's
       own <option>s are rendered directly below (no `:global()` needed for `option:checked`), but
       `children` may inject additional caller-supplied <option>s via the snippet - `:global()` is
       still required so that pruning doesn't drop the rule for those. */
  .select {
    background-color: var(--primary);
    border-radius: 0.2rem;
    border: none;
    color: var(--primary-text);
    padding: 0.5rem;
  }

  .select:focus {
    outline: none;
  }

  .select :global(option:checked) {
    color: var(--accent);
  }
</style>
