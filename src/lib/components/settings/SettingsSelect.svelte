<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ThemeProvider as theme } from '$core/theme/ThemeProvider.svelte';
  import type {
    SettingUpdate,
    SettingUpdateKey,
    SettingsSelect,
  } from '$core/types/SettingsPropriety';

  // Named `SettingsSelect` to avoid colliding with the generic
  // `inputs/Select.svelte` sibling component.
  //
  // No separate `type` prop: `data.options[0]`'s typeof (below) tells this
  // whether to parseInt the changed value, since `data` already carries it.
  //
  // Same inline-SVG-chevron-from-theme-text-color mechanism as
  // inputs/Select.svelte and InstrumentSelect.svelte - keep them in sync
  // if this changes.
  let {
    value,
    onChange,
    data,
    objectKey,
    children,
  }: {
    value: string | number;
    data: SettingsSelect;
    objectKey: SettingUpdateKey;
    children: Snippet;
    onChange: (data: SettingUpdate) => void;
  } = $props();

  function handleChange(e: Event & { currentTarget: EventTarget & HTMLSelectElement }) {
    onChange({
      key: objectKey,
      data: {
        ...data,
        value:
          typeof data.options[0] === 'number'
            ? parseInt(e.currentTarget.value)
            : e.currentTarget.value,
      },
    });
    e.currentTarget.blur();
  }

  const backgroundImage = $derived(
    `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' height='24' viewBox='0 0 24 24' width='24' fill='${theme.getText('primary').hex().replace('#', '%23')}'><path d='M0 0h24v24H0z' fill='none'/><path d='M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z'/></svg>")`
  );
</script>

<select {value} onchange={handleChange} style="background-image:{backgroundImage}">
  {@render children()}
</select>
