<script lang="ts">
  import LibColorPicker from 'svelte-awesome-color-picker';
  import Color from 'color';
  import { game } from '$game';

  // `isDialog={false}`: always visible, no built-in open/close toggle.
  // `isTextInput={false}`: suppresses the library's own hex/rgb/hsv input
  // row so this component can own `.color-picker-input` itself below -
  // Theme.css's `.color-picker*` rules target that exact class name, so
  // only this hand-rolled input will pick up that styling.
  // `isAlpha={false}`: hex-only, no alpha channel.
  //
  // One-way controlled (hex + onInput), not Svelte's bind:hex two-way sugar
  // - handleChange below is the single point that updates `color`.
  let {
    onChange,
    value,
    absolute = true,
    style = '',
  }: {
    value: string;
    absolute?: boolean;
    style?: string;
    onChange?: (color: string) => void;
  } = $props();

  // A writable $derived: reading `color` tracks `value`, but handleChange/
  // cancel below can still locally reassign it to diverge (e.g. while the
  // user drags/types) until `value` itself changes again.
  let color = $derived(Color(value));

  function handleChange(hex: string) {
    color = Color(hex);
  }

  function sendEvent() {
    onChange?.(color.toString());
  }

  function cancel() {
    color = Color(value);
    onChange?.(value);
  }

  const HEX_DIGITS = /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/;

  function handleHexInput(e: Event & { currentTarget: EventTarget & HTMLInputElement }) {
    const digits = e.currentTarget.value;
    if (HEX_DIGITS.test(digits)) handleChange('#' + digits);
  }

  const textColor = $derived(
    color.isDark() ? game.themes.baseConfig.text.light : game.themes.baseConfig.text.dark
  );
</script>

<!-- Named `.color-picker-wrapper`, not `.color-picker`: the vendor library
     uses that exact class internally. All of this component's styling comes
     from global Theme.css's `.color-picker-wrapper`/`.color-picker*` rules -
     there is no local <style> block here. -->
<div class="color-picker-wrapper" style="position:{absolute ? 'absolute' : 'unset'};{style}">
  <LibColorPicker
    hex={color.hex()}
    isAlpha={false}
    isDialog={false}
    isTextInput={false}
    onInput={(c) => {
      if (c.hex) handleChange(c.hex);
    }}
  />
  <div class="color-picker-row">
    <div class="color-picker-input" style="background-color:{color.toString()};color:{textColor}">
      <div style="font-family:Arial">#</div>
      <input
        value={color.hex().replace('#', '')}
        oninput={handleHexInput}
        style="color:{textColor}"
      />
    </div>
    <!-- Preserved a11y gap: neither button below has an aria-label, only
             the bare icon. The ignore suppresses the compiler's (otherwise
             correct) icon-only-button nudge for this pair. -->
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button
      class="color-picker-check"
      onclick={cancel}
      style="background-color:{color.toString()};color:{textColor}"
    >
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
    </button>
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button
      class="color-picker-check"
      onclick={sendEvent}
      style="background-color:{color.toString()};color:{textColor}"
    >
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
    </button>
  </div>
</div>
