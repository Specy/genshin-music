<script lang="ts">
  import { logger } from '$stores/LoggerStore.svelte';

  let {
    name,
    onChange,
    disabled,
    value,
    onLeave,
  }: {
    name: string;
    value: string;
    disabled: boolean;
    onChange: (value: string) => void;
    onLeave?: () => void;
  } = $props();

  let clicking = $state(false);

  // QUIRK: checks disabled && clicking BEFORE clearing clicking below, not after - clicking is a
  // live $state binding, so clearing first would make this check always read the just-cleared
  // false and the warning would never fire. This order is required, not incidental.
  function handlePointerUp() {
    if (disabled && clicking) logger.warn('Create a new theme first');
    clicking = false;
  }
</script>

<div class="theme-row">
  <div>
    {name}
  </div>
  <input
    class="theme-input"
    placeholder="Write here"
    {disabled}
    {value}
    onpointerdown={() => (clicking = true)}
    onpointerup={handlePointerUp}
    onpointerleave={() => (clicking = false)}
    onblur={() => onLeave?.()}
    oninput={(e) => onChange(e.currentTarget.value)}
  />
</div>

<style>
  .theme-row {
    margin-top: 0.5rem;
    display: flex;
    width: 100%;
    justify-content: space-between;
    align-items: center;
    font-size: 1.1rem;
    min-height: 3rem;
    border-radius: 0.4rem;
    padding: 0 0.6rem;
    transition: all 0.1s;
  }

  /* The 9rem width used to be an inline `style` on the input. It is a scoped rule now purely so
     the portrait block below can widen the field without having to out-shout an inline
     declaration with !important - the landscape width is the same 9rem it always was. */
  .theme-input {
    background-color: var(--primary);
    color: var(--primary-text);
    border-radius: 0.2rem;
    padding: 0.5rem 1rem;
    border: none;
    height: fit-content;
    cursor: text;
    min-width: 5rem;
    width: 9rem;
  }

  .theme-input:disabled {
    filter: brightness(0.8);
    cursor: not-allowed;
  }

  .theme-input::placeholder {
    color: var(--primary-text);
  }

  /* PORTRAIT: side by side, a label that wraps to three lines ("Composer Background image (URL)")
     sits next to a 144px box showing about a dozen characters of a URL, with the gutter between
     them empty. Stacked, the label gets the row's full width and the field becomes a full-width,
     thumb-height target. */
  @media (orientation: portrait) {
    .theme-row {
      flex-direction: column;
      align-items: stretch;
      gap: 0.4rem;
      padding: 0.6rem;
    }

    .theme-input {
      padding: 0.7rem 1rem;
    }
  }
</style>
