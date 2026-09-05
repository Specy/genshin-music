<script module lang="ts">
  import { game } from '$game';

  // Read from `game.instruments.list` directly (not `$core/legacyConfig`'s
  // `INSTRUMENTS` re-export, reserved for CORE files) per the two-tier rule.
  //
  // Only group *membership* is frozen in `<script module>` (computed once at
  // module load, shared across every instance): `$game` is a build-time-static
  // import, so which instrument lands in which prefix group never changes.
  // The display *order* deliberately does NOT live here - options show
  // `tInstrument(name)`, which is localized, so the alphabetical order differs
  // per language and is re-derived per instance below.
  const UNGROUPED = 'instruments';
  const prefixes = new Set<string>(
    game.instruments.list.filter((ins) => ins.includes('_')).map((ins) => ins.split('_')[0])
  );
  const instrumentGroups: Record<string, readonly string[]> = {
    [UNGROUPED]: game.instruments.list.filter((ins) => !ins.includes('_')),
  };
  for (const prefix of prefixes) {
    instrumentGroups[prefix] = game.instruments.list.filter((ins) => ins.startsWith(prefix));
  }
  const groupEntries = Object.entries(instrumentGroups);
</script>

<script lang="ts">
  import type { ClassValue } from 'svelte/elements';
  import { ThemeProvider as theme } from '$core/theme/ThemeProvider.svelte';
  import { capitalize } from '$core/utils/Utilities';
  import { language, tInstrument } from '$i18n/binding.svelte';
  import type { InstrumentName } from '$core/types';

  let {
    selected,
    onChange,
    style = '',
    class: cls = '',
    disabled = false,
  }: {
    selected: InstrumentName;
    onChange: (instrument: InstrumentName) => void;
    style?: string;
    class?: ClassValue;
    disabled?: boolean;
  } = $props();

  function handleChange(e: Event & { currentTarget: EventTarget & HTMLSelectElement }) {
    onChange(e.currentTarget.value);
    e.currentTarget.blur();
  }

  // Alphabetical by what the user actually reads (`tInstrument`, localized -
  // "Lyre" is "Lira" in it, and Chinese names in zh), so both the collator and
  // the labels have to come from the active language. `language()` (not raw
  // `i18n.language`) reads the i18n binding's reactive tick, so switching
  // language re-runs this and re-sorts. `numeric` is future-proofing (nothing
  // is numbered today, but a "Drum 2"/"Drum 10" family would otherwise sort
  // digit-by-digit); `sensitivity: 'base'` keeps casing/accents from
  // outranking letters, at the cost of names differing only in those comparing
  // equal - `sort` is stable, so they keep config order.
  const sortedGroups = $derived.by(() => {
    const collator = new Intl.Collator(language(), { numeric: true, sensitivity: 'base' });
    const groups = groupEntries.map(([prefix, names]) => {
      const sorted = [...names].sort((a, b) => collator.compare(tInstrument(a), tInstrument(b)));
      return [prefix, sorted] as const;
    });
    // The ungrouped group is the game's plain instruments and stays first,
    // whatever it sorts as; the prefix groups follow A-Z by the label the
    // <optgroup> displays.
    return groups.sort(([a], [b]) => {
      if (a === UNGROUPED) return -1;
      if (b === UNGROUPED) return 1;
      return collator.compare(capitalize(a), capitalize(b));
    });
  });

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
  {disabled}
>
  {#if sortedGroups.length === 1}
    {#each sortedGroups[0][1] as ins (ins)}
      <option value={ins}>{tInstrument(ins)}</option>
    {/each}
  {:else}
    {#each sortedGroups as [prefix, ins] (prefix)}
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

  .select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .select option:checked {
    color: var(--accent);
  }
</style>
