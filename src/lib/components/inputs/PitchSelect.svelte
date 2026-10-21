<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';
  import { PITCHES } from '$core/sharedConfig';
  import type { Pitch } from '$lib/games/types';
  import { ThemeProvider as theme } from '$core/theme/ThemeProvider.svelte';

  // PITCHES stopped being game-data with ADR-0003: it is shared music theory
  // (was byte-identical in both GameDefinitions), so it now lives in
  // $core/sharedConfig — a legitimate shared-constant import for UI code.
  let {
    selected,
    onChange,
    style = '',
    children,
    class: cls = '',
    disabled = false,
  }: {
    selected: Pitch;
    onChange: (pitch: Pitch) => void;
    style?: string;
    children?: Snippet;
    class?: ClassValue;
    disabled?: boolean;
  } = $props();

  function handleChange(e: Event & { currentTarget: EventTarget & HTMLSelectElement }) {
    onChange(e.currentTarget.value as Pitch);
    e.currentTarget.blur();
  }

  // Same inline-SVG-chevron-from-theme-text-color mechanism as inputs/Select.svelte and
  // InstrumentSelect.svelte - without it this select fell back to App.css's fixed grey chevron,
  // the one select in a row of them whose arrow did not follow the theme.
  const backgroundImage = $derived(
    `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' height='24' viewBox='0 0 24 24' width='24' fill='${theme.getText('primary').hex().replace('#', '%23')}'><path d='M0 0h24v24H0z' fill='none'/><path d='M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z'/></svg>")`
  );
</script>

<select
  class={['select', cls]}
  style="width:100%;padding:0.3rem;background-image:{backgroundImage};{style}"
  onchange={handleChange}
  value={selected}
  {disabled}
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

  .select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .select :global(option:checked) {
    color: var(--accent);
  }
</style>
