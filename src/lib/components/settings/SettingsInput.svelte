<script lang="ts">
  import type {
    SettingUpdate,
    SettingUpdateKey,
    SettingsNumber,
    SettingsText,
  } from '$core/types/SettingsPropriety';
  import StepperButton from '$cmp/inputs/StepperButton.svelte';

  // Old set el.value = '' before calling onChange to dodge a React-only
  // leading-zero rendering artifact - not ported: Svelte's controlled
  // inputs don't share that reconciliation quirk.
  let {
    data,
    objectKey,
    value,
    onChange,
    onComplete,
  }: {
    data: SettingsNumber | SettingsText;
    objectKey: SettingUpdateKey;
    value: string | number;
    onChange: (value: string | number) => void;
    onComplete: (data: SettingUpdate) => void;
  } = $props();

  function handleChange(e: Event & { currentTarget: EventTarget & HTMLInputElement }) {
    if (data.type === 'number') {
      const numValue = Number(e.currentTarget.value);
      if (!data.threshold || numValue < data.threshold[0] || numValue > data.threshold[1]) return;
      onChange(numValue);
    } else {
      onChange(e.currentTarget.value);
    }
  }

  function handleIncrement(sign: number) {
    if (data.type === 'number') {
      const nextValue = Number(value) + (data.increment || 0) * sign;
      if (!data.threshold || nextValue < data.threshold[0] || nextValue > data.threshold[1]) return;
      onComplete({
        key: objectKey,
        data: { ...data, value: nextValue },
      });
    }
  }

  function handleBlur() {
    if (data.value === value) return;
    // `data`/`value` are already the same variant at runtime (this
    // component's own `data` prop type guarantees it) - the shared
    // `SettingUpdate.data` type just can't express that narrowing across
    // an object spread, so this cast is type-level only.
    onComplete({
      key: objectKey,
      data: { ...data, value } as SettingUpdate['data'],
    });
  }
</script>

<div class="settings-input">
  {#if data.type === 'number'}
    <StepperButton
      direction="decrement"
      onclick={() => handleIncrement(-1)}
      style="margin-right:0.15rem"
    />
  {/if}
  <input
    type={data.type}
    {value}
    placeholder={data.placeholder || ''}
    onblur={handleBlur}
    oninput={handleChange}
    aria-label={data.name}
  />
  {#if data.type === 'number'}
    <StepperButton
      direction="increment"
      onclick={() => handleIncrement(1)}
      style="margin-left:0.15rem"
    />
  {/if}
</div>

<style>
  .settings-input {
    display: flex;
    width: 8rem;
  }

  .settings-input input {
    width: unset;
    min-width: 0;
    display: flex;
    text-align: center;
    height: 1rem;
    flex: 1;
  }

  .settings-input input::-webkit-outer-spin-button,
  .settings-input input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  /* Firefox */
  .settings-input input[type='number'] {
    appearance: textfield;
    -moz-appearance: textfield;
  }

  /* The `-`/`+` buttons and their press live in StepperButton.svelte: the MIDI importer's number
     inputs step with the same control, so the look is shared rather than declared here. */
</style>
