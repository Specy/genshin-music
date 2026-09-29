<script lang="ts">
  import type { InstrumentName } from '$core/types';
  import Select from './Select.svelte';
  import { t, tInstrument, tVariant } from '$i18n/binding.svelte';
  import {
    type InstrumentSettingValues,
    resolveInstrumentSettings,
    variantSettingOf,
  } from '$lib/games/instrumentSettings';

  /**
   * The settings an instrument declares for itself (ADR-0018), drawn the same way on every surface
   * that shows them: indented under a caption naming the instrument, each row hung from it by a
   * tree connector, so they read as that instrument's own and never as a setting every track has.
   * Surfaces place it BELOW their default settings. Renders nothing for an instrument that declares
   * none, and which instruments do is config's business, never this component's.
   */
  let {
    instrument,
    settings,
    onChange,
    disabled = false,
    style = '',
  }: {
    instrument: InstrumentName;
    /** As stored: may be partial, stale or absent - it resolves against the declaration here. */
    settings: InstrumentSettingValues | undefined;
    onChange: (settings: InstrumentSettingValues) => void;
    disabled?: boolean;
    /** On the block itself, so an instrument that declares nothing leaves no spacing behind. */
    style?: string;
  } = $props();

  const variant = $derived(variantSettingOf(instrument));
  const resolved = $derived(resolveInstrumentSettings(instrument, settings));
</script>

{#if variant}
  <div class="instrument-specific" {style}>
    <div class="instrument-specific-caption">
      {t('instrument_settings:only_for', { instrument: tInstrument(instrument) })}
    </div>
    <!-- a <label>, so the select is announced by the name written beside it -->
    <label class="instrument-specific-row">
      <span>{t('instrument_settings:variant')}</span>
      <Select
        style="padding:0.3rem;width:8rem;text-align:left"
        value={String(resolved[variant.id])}
        {disabled}
        onchange={(e) => onChange({ ...resolved, [variant.id]: e.currentTarget.value })}
      >
        {#each variant.definition.options as option (option.id)}
          <option value={option.id}>{tVariant(instrument, option.id)}</option>
        {/each}
      </Select>
    </label>
  </div>
{/if}

<style>
  .instrument-specific {
    /* The gap is also how far each branch reaches up to join what is above it, so they share it. */
    --instrument-specific-gap: 0.3rem;
    /* Where the trunk runs: under the pill's rounded start. */
    --instrument-specific-trunk: 0.65rem;
    display: flex;
    flex-direction: column;
    gap: var(--instrument-specific-gap);
  }

  /* The pill naming the instrument these belong to; the tree below grows out of it. */
  .instrument-specific-caption {
    align-self: flex-start;
    padding: 0.2rem 0.55rem;
    line-height: 1;
    border-radius: 2rem;
    font-size: 0.75rem;
    background-color: var(--secondary);
    color: var(--secondary-text);
  }

  .instrument-specific-row {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    padding-left: calc(var(--instrument-specific-trunk) + 0.85rem);
  }

  /* This row's branch: down from whatever is above it (the pill, or the trunk passing the row
     before) to the row's middle, then across to its label. */
  .instrument-specific-row::before {
    content: '';
    position: absolute;
    left: var(--instrument-specific-trunk);
    top: calc(-1 * var(--instrument-specific-gap));
    height: calc(50% + var(--instrument-specific-gap));
    width: 0.6rem;
    border-left: 0.1rem solid var(--secondary);
    border-bottom: 0.1rem solid var(--secondary);
    border-bottom-left-radius: 0.35rem;
  }

  /* The trunk carrying on past a row that is not the last, down to the next one's branch. */
  .instrument-specific-row:not(:last-child)::after {
    content: '';
    position: absolute;
    left: var(--instrument-specific-trunk);
    top: 50%;
    bottom: 0;
    border-left: 0.1rem solid var(--secondary);
  }
</style>
