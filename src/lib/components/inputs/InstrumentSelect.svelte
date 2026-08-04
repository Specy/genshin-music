<script module lang="ts">
  import { game } from '$game';

  // Read from `game.instruments.list` directly (not `$core/legacyConfig`'s
  // `INSTRUMENTS` re-export, reserved for CORE files) per the two-tier rule.
  //
  // This grouping lives in `<script module>` (computed once at module load,
  // shared across every instance) rather than the instance script below,
  // since `$game` is a build-time-static import and the grouping never
  // changes per-instance.
  const prefixes = new Set<string>(
    game.instruments.list.filter((ins) => ins.includes('_')).map((ins) => ins.split('_')[0])
  );
  const instrumentGroups: Record<string, readonly string[]> = {
    instruments: game.instruments.list.filter((ins) => !ins.includes('_')),
  };
  for (const prefix of prefixes) {
    instrumentGroups[prefix] = game.instruments.list.filter((ins) => ins.startsWith(prefix));
  }
  const entries = Object.entries(instrumentGroups);
</script>

<script lang="ts">
  import type { ClassValue } from 'svelte/elements';
  import { ThemeProvider as theme } from '$core/theme/ThemeProvider.svelte';
  import { capitalize } from '$core/utils/Utilities';
  import { tInstrument } from '$i18n/binding.svelte';
  import type { InstrumentName } from '$core/types';

  let {
    selected,
    onChange,
    style = '',
    class: cls = '',
  }: {
    selected: InstrumentName;
    onChange: (instrument: InstrumentName) => void;
    style?: string;
    class?: ClassValue;
  } = $props();

  function handleChange(e: Event & { currentTarget: EventTarget & HTMLSelectElement }) {
    onChange(e.currentTarget.value);
    e.currentTarget.blur();
  }

  // Same inline-SVG-chevron-from-theme-text-color mechanism as
  // inputs/Select.svelte and settings/SettingsSelect.svelte - keep them in
  // sync if this changes.
  const backgroundImage = $derived(
    `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' height='24' viewBox='0 0 24 24' width='24' fill='${theme.getText('primary').hex().replace('#', '%23')}'><path d='M0 0h24v24H0z' fill='none'/><path d='M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z'/></svg>")`
  );
</script>

<select
  class={['select', cls]}
  style="width:100%;padding:0.3rem;background-image:{backgroundImage};{style}"
  onchange={handleChange}
  value={selected}
>
  {#if entries.length === 1}
    {#each instrumentGroups.instruments as ins (ins)}
      <option value={ins}>{tInstrument(ins)}</option>
    {/each}
  {:else}
    {#each entries as [prefix, ins] (prefix)}
      <optgroup label={capitalize(prefix)}>
        {#each ins as instrumentName (instrumentName)}
          <option value={instrumentName}>{tInstrument(instrumentName)}</option>
        {/each}
      </optgroup>
    {/each}
  {/if}
</select>

<style>
  /* Duplicated, not shared/global: Svelte scopes <style> per component, so
       nothing here carries across files automatically. Unlike
       inputs/Select.svelte (whose <option>s arrive via a caller-supplied
       snippet, needing :global()), this file's <option>/<optgroup> render
       directly in its own template, so plain scoped CSS already reaches
       them. */
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

  .select option:checked {
    color: var(--accent);
  }
</style>
