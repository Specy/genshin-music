<script lang="ts">
  // Duration popover (spec 2026-08-03 §2 "Composer duration UX"): opened by long-pressing
  // a composer keyboard button; drag the slider right to lengthen the hold, `<`/`>` step
  // ±1 column; dismissed by outside click, the X button, or a column/layer change (the
  // owner handles those two). The opening long-press's own pointerup can't dismiss it:
  // dismissal listens for pointerDOWN outside, and the opening gesture has none left.
  import { t } from '$i18n/binding.svelte';

  let {
    span,
    maxSpan,
    anchor,
    onChange,
    onClose,
  }: {
    span: number;
    maxSpan: number;
    /** Bounding rect of the long-pressed button, in viewport coordinates. */
    anchor: { x: number; y: number; width: number };
    onChange: (span: number) => void;
    onClose: () => void;
  } = $props();

  let popoverElement: HTMLDivElement | undefined = $state();

  const POPOVER_WIDTH = 280;
  const left = $derived(
    Math.max(
      8,
      Math.min(
        anchor.x + anchor.width / 2 - POPOVER_WIDTH / 2,
        (typeof window !== 'undefined' ? window.innerWidth : POPOVER_WIDTH) - POPOVER_WIDTH - 8
      )
    )
  );

  function step(amount: number) {
    onChange(Math.max(1, Math.min(maxSpan, span + amount)));
  }

  function handleOutsidePointerDown(e: PointerEvent) {
    if (popoverElement && !popoverElement.contains(e.target as Node)) onClose();
  }
</script>

<svelte:window onpointerdown={handleOutsidePointerDown} />

<div
  bind:this={popoverElement}
  class="duration-popover"
  style="left:{left}px;bottom:calc(100vh - {anchor.y}px + 0.6rem);width:{POPOVER_WIDTH}px"
  role="dialog"
  aria-label={t('composer:note_duration')}
>
  <button class="duration-popover-step" onclick={() => step(-1)} disabled={span <= 1}>
    &lt;
  </button>
  <input
    type="range"
    min="1"
    max={maxSpan}
    value={span}
    oninput={(e) => onChange(parseInt(e.currentTarget.value))}
    style="flex:1;accent-color:var(--accent)"
  />
  <button class="duration-popover-step" onclick={() => step(1)} disabled={span >= maxSpan}>
    &gt;
  </button>
  <div class="duration-popover-value">
    {span}
  </div>
  <button class="duration-popover-step" onclick={onClose} aria-label={t('common:close')}>
    ✕
  </button>
</div>

<style lang="scss">
  .duration-popover {
    position: fixed;
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.6rem;
    border-radius: 0.5rem;
    background-color: var(--menu-background);
    color: var(--menu-background-text);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4);
  }

  .duration-popover-step {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 0.3rem;
    background-color: var(--primary);
    color: var(--primary-text);
    flex-shrink: 0;

    &:disabled {
      opacity: 0.4;
    }
  }

  .duration-popover-value {
    min-width: 2rem;
    text-align: center;
    font-weight: bold;
  }
</style>
