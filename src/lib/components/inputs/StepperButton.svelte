<script lang="ts">
  import { t } from '$i18n/binding.svelte';

  // The `-`/`+` pair of a number stepper, look and press behaviour only: no value, no parsing,
  // no settings types. Shared so the settings screen and the MIDI importer step numbers with the
  // same control - they used to be two unrelated buttons (an SVG icon here, a text glyph with no
  // press feedback there) for the same gesture.
  let {
    direction,
    onclick,
    disabled = false,
    style = '',
  }: {
    direction: 'increment' | 'decrement';
    onclick: () => void;
    disabled?: boolean;
    style?: string;
  } = $props();
</script>

<button
  {onclick}
  {disabled}
  {style}
  class="stepper-button"
  aria-label={direction === 'increment' ? t('common:increment') : t('common:decrement')}
>
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d={direction === 'increment'
        ? 'M416 208H272V64c0-17.67-14.33-32-32-32h-32c-17.67 0-32 14.33-32 32v144H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h144v144c0 17.67 14.33 32 32 32h32c17.67 0 32-14.33 32-32V304h144c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z'
        : 'M416 208H32c-17.67 0-32 14.33-32 32v32c0 17.67 14.33 32 32 32h384c17.67 0 32-14.33 32-32v-32c0-17.67-14.33-32-32-32z'}
    /></svg
  >
</button>

<style>
  .stepper-button {
    width: 1.4rem;
    height: 1.4rem;
    font-weight: bold;
    font-family: Arial;
    display: flex;
    padding: 0;
    justify-content: center;
    align-items: center;
    border: none;
    background-color: var(--primary);
    color: var(--primary-text);
    border-radius: 0.2rem;
    cursor: pointer;
    font-size: 0.7rem;
    /* the RELEASE of the press below - a state rule's transition only runs on the way INTO it */
    transition: transform 0.12s;
  }

  /* THE PRESS, the same brightness and scale App.css gives `.app-button` and the composer's tools
     (its own comment carries the reasoning).

     IT MATTERS MOST HERE. Increment and decrement are the buttons a user presses repeatedly and
     often without looking at the number - so a press that shows nothing is a press they cannot
     count. */
  .stepper-button:not(:disabled):active {
    filter: brightness(0.9);
    transform: scale(0.98);
    transition:
      filter 0.06s,
      transform 0.06s;
  }

  .stepper-button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  @media (prefers-reduced-motion: reduce) {
    .stepper-button:not(:disabled):active {
      transform: none;
    }
  }
</style>
