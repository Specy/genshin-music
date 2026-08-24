<script module lang="ts">
  // `Option<T>` lives in this module block, not the generics-attributed
  // instance script below, because only a `<script module>` block's exports
  // are real ES exports a consumer can import.
  export type Option<T> = {
    value: T;
    text: string;
    color: string;
  };
</script>

<script lang="ts" generics="T extends string">
  import { capitalize } from '$core/utils/Utilities';

  let {
    options,
    selected,
    onChange,
  }: {
    options: Option<T>[];
    selected: T;
    onChange: (value: T) => void;
  } = $props();

  let rootEl: HTMLDivElement | undefined = $state();
  let overlayState: { width: number; left: number } | null = $state(null);

  const selectedOption = $derived(options.find((option) => option.value === selected));

  $effect(() => {
    const elements = rootEl?.querySelectorAll<HTMLButtonElement>('button');
    const index = options.findIndex((e) => e.value === selected);
    const selectedButton = elements?.[index];
    if (!rootEl || !selectedButton || index < 0) {
      overlayState = null;
      return;
    }
    const button = selectedButton;

    function positionOverlay() {
      // A slider inside a closed menu panel has no layout box (`display:none`). Do not replace a
      // valid position with zeroes; ResizeObserver runs this again as soon as the panel is shown.
      if (button.offsetWidth === 0) return;
      // offsetLeft is already relative to the positioned slider's padding edge. The old viewport
      // rect subtraction counted the slider border twice, which caused the persistent ~2 px
      // offset on the first option as well as stale measurements from hidden panels.
      overlayState = {
        width: button.offsetWidth,
        left: button.offsetLeft,
      };
    }

    positionOverlay();

    const observer = new ResizeObserver(positionOverlay);
    observer.observe(rootEl);
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  });
</script>

<div
  class="multiple-option-slider"
  bind:this={rootEl}
  style="border: solid 0.1rem {selectedOption?.color ?? 'var(--accent)'}"
>
  {#each options as option (option.value)}
    <button
      onclick={() => onChange(option.value)}
      class={option === selectedOption ? 'multiple-options-selected' : ''}
    >
      {capitalize(option.text)}
    </button>
  {/each}
  {#if overlayState}
    <div
      class="multiple-option-slider-overlay"
      style="width:calc({overlayState.width}px - 0.2rem);left:calc({overlayState.left}px + 0.1rem);background-color:{selectedOption?.color}"
    ></div>
  {/if}
</div>

<style>
  /* The max-width:1000px override below lives with this component rather
       than a page-level stylesheet because scoped CSS can't pierce into a
       child component from outside - a copy left on a host page would
       silently stop applying to this component's own buttons. */
  .multiple-option-slider {
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    height: 100%;
    width: fit-content;
    border-radius: 3rem;
    position: relative;
    transition: border 0.2s;
    background-color: var(--primary);
  }

  .multiple-option-slider button {
    height: 100%;
    padding: 0 1.4rem;
    /* Labels are localized and can run long ('Compositore normale', 'Обычный секвенсор');
       hosts pin the row's height (e.g. .composer-view-selector at 2.5rem), so a wrapped
       label would clip rather than grow the row. */
    white-space: nowrap;
    color: var(--primary-text);
    transition: color 0.2s;
    z-index: 2;
    cursor: pointer;
    background-color: transparent;
    border-radius: 0.4rem;
    border: none;
  }

  .multiple-options-selected {
    color: var(--accent-text) !important;
  }

  .multiple-option-slider-overlay {
    transition: all 0.15s ease-out;
    position: absolute;
    height: calc(100% - 0.2rem);
    top: 0.1rem;
    border-radius: 3rem;
    background-color: var(--accent);
  }

  @media only screen and (max-width: 1000px) {
    .multiple-option-slider button {
      padding: 0 1rem;
    }
  }
</style>
