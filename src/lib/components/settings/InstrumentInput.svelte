<script lang="ts">
  import type { InstrumentName } from '$core/types';
  import type {
    SettingInstrumentSettingsUpdate,
    SettingUpdate,
    SettingUpdateKey,
    SettingVolumeUpdate,
    SettingsInstrument,
  } from '$core/types/SettingsPropriety';
  import type { Snippet } from 'svelte';
  import InstrumentSelect from '../inputs/InstrumentSelect.svelte';
  import InstrumentSpecificSettings from '../inputs/InstrumentSpecificSettings.svelte';
  import { t } from '$i18n/binding.svelte';

  let {
    data,
    volume,
    onVolumeChange,
    onVolumeComplete,
    onInstrumentPick,
    onSettingsPick,
    objectKey,
    instrument,
    title,
  }: {
    data: SettingsInstrument;
    volume: number;
    instrument: InstrumentName;
    objectKey: SettingUpdateKey;
    onVolumeChange: (value: number) => void;
    onVolumeComplete: (data: SettingVolumeUpdate) => void;
    onInstrumentPick: (data: SettingUpdate) => void;
    /** Where the keyboard's own Instrument Settings go; without it none are shown. */
    onSettingsPick?: (data: SettingInstrumentSettingsUpdate) => void;
    /** The setting's title, drawn beside the instrument select. */
    title?: Snippet;
  } = $props();

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
  <div class="instrument-picker-line">
    {@render title?.()}
    <InstrumentSelect
      selected={instrument}
      onChange={handleInstrument}
      class="select"
      style="text-align:left;padding-left:0.4rem;width:8rem"
    />
  </div>
  <hr class="instrument-picker-divider" />
  <!-- the settings every instrument has first; the instrument's own always come after them -->
  <label class="instrument-picker-line">
    <span>{t('instrument_settings:volume')}</span>
    <input
      type="range"
      min={1}
      max={100}
      value={volume}
      oninput={handleVolumeChange}
      onpointerup={handleVolumePick}
    />
  </label>
  {#if onSettingsPick}
    <!-- stored settings may predate the field or name another instrument's ids: the block
         resolves them against this instrument's declaration, which turns either into its default -->
    <InstrumentSpecificSettings
      {instrument}
      settings={data.settings}
      onChange={(settings) => onSettingsPick({ key: objectKey, settings })}
    />
  {/if}
</div>

<style>
  .instrument-picker {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    width: 100%;
  }

  .instrument-picker-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
  }

  .instrument-picker-divider {
    width: 100%;
    margin: 0.1rem 0;
    border: none;
    border-top: 0.1rem solid var(--secondary);
  }
</style>
