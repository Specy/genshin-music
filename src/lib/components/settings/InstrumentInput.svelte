<script lang="ts">
  import type { InstrumentName } from '$core/types';
  import type {
    SettingInstrumentSettingsUpdate,
    SettingUpdate,
    SettingUpdateKey,
    SettingVolumeUpdate,
    SettingsInstrument,
  } from '$core/types/SettingsPropriety';
  import InstrumentSelect from '../inputs/InstrumentSelect.svelte';
  import Select from '../inputs/Select.svelte';
  import { tVariant } from '$i18n/binding.svelte';
  import { resolveInstrumentSettings, variantSettingOf } from '$lib/games/instrumentSettings';

  let {
    data,
    volume,
    onVolumeChange,
    onVolumeComplete,
    onInstrumentPick,
    onSettingsPick,
    objectKey,
    instrument,
  }: {
    data: SettingsInstrument;
    volume: number;
    instrument: InstrumentName;
    objectKey: SettingUpdateKey;
    onVolumeChange: (value: number) => void;
    onVolumeComplete: (data: SettingVolumeUpdate) => void;
    onInstrumentPick: (data: SettingUpdate) => void;
    /** Where a Variant pick goes; without it no Variant picker is shown. */
    onSettingsPick?: (data: SettingInstrumentSettingsUpdate) => void;
  } = $props();

  // The keyboard's own Variant (ADR-0017), for an instrument whose config declares one. The stored
  // settings may predate the field or name another instrument's ids: resolving them against this
  // instrument's declaration is what turns either into the default.
  const variant = $derived(variantSettingOf(instrument));
  const variantValue = $derived(
    variant ? String(resolveInstrumentSettings(instrument, data.settings)[variant.id]) : ''
  );

  function handleVariant(e: Event & { currentTarget: EventTarget & HTMLSelectElement }) {
    if (!variant) return;
    onSettingsPick?.({
      key: objectKey,
      settings: { ...(data.settings ?? {}), [variant.id]: e.currentTarget.value },
    });
  }

  // MUST be `oninput`, not `onchange`, below: `onchange` only fires once
  // the value is committed, so `onpointerup` (handleVolumePick) would fire
  // and commit the PREVIOUS value before the new one was ever reported -
  // picking 10% saved nothing, picking 50% next saved 10%. `oninput` fires
  // on every drag step, ahead of the pointerup commit.
  function handleVolumeChange(e: Event & { currentTarget: EventTarget & HTMLInputElement }) {
    onVolumeChange(Number(e.currentTarget.value));
  }

  function handleVolumePick() {
    onVolumeComplete({
      key: objectKey,
      value: volume,
    });
  }

  function handleInstrument(ins: InstrumentName) {
    onInstrumentPick({
      key: objectKey,
      data: { ...data, value: ins },
    });
  }
</script>

<div class="instrument-picker">
  <InstrumentSelect
    selected={instrument}
    onChange={handleInstrument}
    class="select"
    style="text-align:left;padding-left:0.4rem;"
  />
  {#if variant && onSettingsPick}
    <Select value={variantValue} onchange={handleVariant} style="margin-top:0.2rem">
      {#each variant.definition.options as option (option.id)}
        <option value={option.id}>{tVariant(instrument, option.id)}</option>
      {/each}
    </Select>
  {/if}
  <input
    type="range"
    min={1}
    max={100}
    value={volume}
    oninput={handleVolumeChange}
    onpointerup={handleVolumePick}
  />
</div>

<style>
  .instrument-picker {
    display: flex;
    flex-direction: column;
    width: 8rem;
  }

  .instrument-picker input[type='range'] {
    margin-top: 0.2rem;
  }
</style>
