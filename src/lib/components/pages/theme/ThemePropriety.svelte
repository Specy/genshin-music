<script lang="ts">
  import LibColorPicker from 'svelte-awesome-color-picker';
  import Color from 'color';
  import { game } from '$game';
  import { ThemeProvider as theme, type ThemeKeys } from '$core/theme/ThemeProvider.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import { t } from '$i18n/binding.svelte';

  let {
    name,
    value,
    onChange,
    isModified,
    setSelectedProp,
    isSelected,
    handlePropReset,
    canReset,
  }: {
    name: ThemeKeys;
    value: string;
    isSelected: boolean;
    isModified: boolean;
    canReset: boolean;
    setSelectedProp: (name: ThemeKeys | '') => void;
    onChange: (name: ThemeKeys, value: string) => void;
    handlePropReset: (name: ThemeKeys) => void;
  } = $props();

  let color = $derived(Color(value));

  function handleChange(hex: string) {
    color = Color(hex);
  }

  function sendEvent() {
    const parsed = color.alpha() === 1 ? color.hex() : color.hexa();
    onChange(name, parsed);
    setSelectedProp('');
  }

  // Unlike inputs/ColorPicker.svelte's own cancel button, this one does NOT call onChange - there
  // is nothing to commit, only the local color needs reverting.
  function cancel() {
    color = Color(value);
    setSelectedProp('');
  }

  // Wider than inputs/ColorPicker.svelte's own HEX_DIGITS (which deliberately excludes the
  // 8-digit form) - this picker handles alpha, so 8-digit (RRGGBBAA) hex must be accepted here.
  const HEX_DIGITS = /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/;

  function handleHexInput(e: Event & { currentTarget: EventTarget & HTMLInputElement }) {
    const digits = e.currentTarget.value;
    if (HEX_DIGITS.test(digits)) handleChange('#' + digits);
  }

  const textColor = $derived(
    color.isDark() ? game.themes.baseConfig.text.light : game.themes.baseConfig.text.dark
  );
</script>

{#snippet faCheckIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M173.898 439.404l-166.4-166.4c-9.997-9.997-9.997-26.206 0-36.204l36.203-36.204c9.997-9.998 26.207-9.998 36.204 0L192 312.69 432.095 72.596c9.997-9.997 26.207-9.997 36.204 0l36.203 36.204c9.997 9.997 9.997 26.206 0 36.204l-294.4 294.401c-9.998 9.997-26.207 9.997-36.204-.001z"
    /></svg
  >
{/snippet}

{#snippet faTimesIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 352 512"
    height="16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"
    /></svg
  >
{/snippet}

<div
  class="theme-row {isSelected ? 'selected' : ''}"
  style={isSelected ? `background-color:${color.toString()};color:${textColor}` : ''}
>
  <div>
    {t(`theme:colors.${name}`)}
  </div>
  <div class="color-input-wrapper">
    {#if canReset && isModified}
      <AppButton onclick={() => handlePropReset(name)} toggled={isModified} class="theme-reset">
        {t('common:reset').toUpperCase()}
      </AppButton>
    {/if}
    {#if isSelected}
      <!-- QUIRK: named color-picker-wrapper, not the more natural color-picker - the
                 svelte-awesome-color-picker library's own root element carries the literal class
                 "color-picker" internally, so a same-named wrapper class here would collide with
                 the vendor's class and pick up its styles unintentionally. Don't rename this back. -->
      <div class="color-picker-wrapper">
        <LibColorPicker
          hex={color.hexa()}
          isAlpha={true}
          isDialog={false}
          isTextInput={false}
          onInput={(c) => {
            if (c.hex) handleChange(c.hex);
          }}
        />
        <div class="color-picker-row">
          <div
            class="color-picker-input"
            style="background-color:{color.toString()};color:{textColor}"
          >
            <div style="font-family:Arial">#</div>
            <input
              value={(color.alpha() === 1 ? color.hex() : color.hexa()).replace('#', '')}
              oninput={handleHexInput}
              style="color:{textColor}"
            />
          </div>
          <button
            class="color-picker-check"
            onclick={cancel}
            style="background-color:{color.toString()};color:{textColor}"
          >
            {@render faTimesIcon()}
          </button>
          <button
            class="color-picker-check"
            onclick={sendEvent}
            style="background-color:{color.toString()};color:{textColor}"
          >
            {@render faCheckIcon()}
          </button>
        </div>
      </div>
    {:else}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        onclick={() => setSelectedProp(name)}
        class="color-preview"
        style="background-color:{theme.get(name).toString()};color:{theme.getText(name).toString()}"
      >
        Text
      </div>
    {/if}
  </div>
</div>

<style>
  /* PORTRAIT. The label/swatch row survives a phone as-is - the swatch is already a 5x3rem
     target - so only the space around it gives ground, and only the picker's own controls, which
     were sized for a mouse, grow. Everything is scoped under `.color-input-wrapper` on purpose:
     Theme.css's `.color-picker-*` rules are shared with `inputs/ColorPicker.svelte` (Settings,
     the VSRG composer), and those instances must not inherit this page's phone sizing. */
  @media (orientation: portrait) {
    /* 2rem of empty gutter is a luxury a 361px row cannot pay for: with it, "Composer secondary
       layer" wraps to two lines while the gutter sits empty. flex-shrink keeps the swatch (and,
       when a theme is editable, the reset chip) at full size as the label takes the slack. */
    .color-input-wrapper {
      margin-left: 0.75rem;
      flex-shrink: 0;
    }

    /* Same reason, on the chip that only appears for a modified key on an editable theme: its
       5rem box plus a 1rem margin is a third of the row. */
    .color-input-wrapper :global(.theme-reset) {
      width: auto;
      margin-right: 0.5rem;
    }

    /* The picker opens leftwards from the wrapper's right edge, so it can only run out of room on
       a phone narrower than about 330px - this is the guard for that, not a resize. */
    .color-input-wrapper :global(.color-picker-wrapper) {
      max-width: calc(100vw - 3rem);
    }

    /* 2rem confirm/cancel buttons are mouse-sized. The hex field's width is stated as "the row
       minus the two buttons and their margins", so it has to be restated with them. */
    .color-input-wrapper :global(.color-picker-row) {
      height: 2.6rem;
    }

    .color-input-wrapper :global(.color-picker-check) {
      width: 2.6rem;
      height: 2.6rem;
    }

    .color-input-wrapper :global(.color-picker-input) {
      width: calc(100% - 5.8rem);
    }
  }
</style>
