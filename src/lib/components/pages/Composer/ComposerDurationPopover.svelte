<script lang="ts">
  // Duration popover (spec 2026-08-03 §2 "Composer duration UX"): opened by long-pressing
  // a composer keyboard button, a Pro View cell, or a physical note key. Its four controls
  // (slider, two steppers, and the typable number since 2026-08-22) all edit the EXTRA hold
  // length in columns (0 = plain note, i.e. span - 1) through the one clamping setHoldAmount:
  // the slider's visual range is 0–20, and the `>` stepper and the box both keep going
  // past 20 — both steppers stay enabled and simply clamp against how far the hold can
  // still grow (next same-id note / song end, via maxSpan). Dismissed by outside click,
  // the X button, or a layer change / a column change once the opening press has been let go
  // (the owner handles those two, and it is the owner that knows a Duration Hold is still
  // running - while one is, the column it moves through EDITS the span instead of dismissing
  // this; CONTEXT.md: Duration Hold). The opening long-press's own pointerup can't dismiss it:
  // dismissal listens for pointerDOWN outside, and the opening gesture has none left.
  import { t } from '$i18n/binding.svelte';
  import type { ComposerPopoverAnchor } from './composerInput';

  let {
    span,
    maxSpan,
    anchor,
    holdActive,
    onChange,
    onClose,
  }: {
    span: number;
    maxSpan: number;
    /**
     * WHAT THIS POPOVER IS POSITIONED AGAINST, in either of two shapes (see ComposerPopoverAnchor):
     * the long-pressed keyboard BUTTON as a live element, so the popover follows window resizes, or
     * a bare screen RECT for a Pro View cell, which is painted pixels and has no element to follow.
     */
    anchor: ComposerPopoverAnchor;
    /**
     * CONTEXT.md: Duration Hold — whether the press that opened this popover is STILL DOWN. While it
     * is, an outside press does not dismiss: the second finger landing on the canvas to scroll it is
     * the hold's own gesture continuing (it grows the span by the columns it crosses), and a
     * pointerdown that closed the popover would end the hold with it. The owner clears this at the
     * release, after which the outside-press dismissal is exactly what it always was.
     */
    holdActive: boolean;
    onChange: (span: number) => void;
    onClose: () => void;
  } = $props();

  let popoverElement: HTMLDivElement | undefined = $state();
  //measured by bind:offsetWidth (the CSS width is viewport-relative)
  let popoverWidth = $state(280);
  //bumped on window resize so the anchor rect and clamps recompute
  let resizeTick = $state(0);

  const SLIDER_MAX = 20;
  //extra hold columns beyond the note itself
  const holdAmount = $derived(span - 1);
  const maxHoldAmount = $derived(Math.max(0, maxSpan - 1));
  //re-measured on every resize for an element anchor, which can reflow; a rect anchor is the
  //measurement itself and simply passes through (the cell it names cannot be re-measured - it is a
  //position on a canvas, not a node)
  const anchorRect = $derived.by(() => {
    void resizeTick;
    return 'element' in anchor ? anchor.element.getBoundingClientRect() : anchor.rect;
  });
  const left = $derived.by(() => {
    void resizeTick;
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : popoverWidth;
    return Math.max(
      8,
      Math.min(
        anchorRect.x + anchorRect.width / 2 - popoverWidth / 2,
        viewportWidth - popoverWidth - 8
      )
    );
  });

  function setHoldAmount(amount: number) {
    onChange(Math.max(0, Math.min(maxHoldAmount, amount)) + 1);
  }

  function handleOutsidePointerDown(e: PointerEvent) {
    if (holdActive) return;
    if (popoverElement && e.target instanceof Node && !popoverElement.contains(e.target)) onClose();
  }
</script>

<svelte:window onpointerdown={handleOutsidePointerDown} onresize={() => resizeTick++} />

{#snippet chevronLeftIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 320 512"
    height="0.9em"
    width="0.9em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M34.52 239.03L228.87 44.69c9.37-9.37 24.57-9.37 33.94 0l22.67 22.67c9.36 9.36 9.37 24.52.04 33.9L131.49 256l154.02 154.75c9.34 9.38 9.32 24.54-.04 33.9l-22.67 22.67c-9.37 9.37-24.57 9.37-33.94 0L34.52 272.97c-9.37-9.37-9.37-24.57 0-33.94z"
    /></svg
  >
{/snippet}

{#snippet chevronRightIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 320 512"
    height="0.9em"
    width="0.9em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M285.476 272.971L91.132 467.314c-9.373 9.373-24.569 9.373-33.941 0l-22.667-22.667c-9.357-9.357-9.375-24.522-.04-33.901L188.505 256 34.484 101.255c-9.335-9.379-9.317-24.544.04-33.901l22.667-22.667c9.373-9.373 24.569-9.373 33.941 0L285.475 239.03c9.373 9.372 9.373 24.568.001 33.941z"
    /></svg
  >
{/snippet}

{#snippet timesIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 352 512"
    height="0.9em"
    width="0.9em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"
    /></svg
  >
{/snippet}

<div
  bind:this={popoverElement}
  bind:offsetWidth={popoverWidth}
  class="duration-popover"
  style="left:{left}px;bottom:calc(100vh - {anchorRect.y}px + 0.6rem)"
  role="dialog"
  aria-label={t('composer:note_duration')}
>
  <button
    class="duration-popover-step"
    onclick={() => setHoldAmount(holdAmount - 1)}
    aria-label="-1"
  >
    {@render chevronLeftIcon()}
  </button>
  <input
    type="range"
    min="0"
    max={SLIDER_MAX}
    value={Math.min(holdAmount, SLIDER_MAX)}
    oninput={(e) => setHoldAmount(parseInt(e.currentTarget.value))}
    style="flex:1;accent-color:var(--accent)"
  />
  <button
    class="duration-popover-step"
    onclick={() => setHoldAmount(holdAmount + 1)}
    aria-label="+1"
  >
    {@render chevronRightIcon()}
  </button>
  <!-- THE NUMBER IS AN INPUT (user revision, 2026-08-22), and it holds the SAME 0-based currency
       everything else in this popover speaks - extra hold columns, i.e. span - 1 - so typing 8 and
       dragging the slider to 8 are the same edit. It applies LIVE, through the same clamping
       setHoldAmount the slider and the steppers go through, which is what lets a value past the
       slider's own 20 be typed rather than stepped to.

       `value=` with an `oninput` handler and NOT `bind:value`: `holdAmount` is a $derived of the
       song's own span, so a two-way binding would try to write back into a read-only value - and
       this way the box follows a span changed from OUTSIDE it (a Duration Hold's drag, the
       steppers) for free. An empty or half-typed box (`-`, or a cleared field) parses to NaN and
       simply does not apply: the note keeps the span it has until a real number arrives. -->
  <input
    type="number"
    class="duration-popover-value"
    min="0"
    max={maxHoldAmount}
    value={holdAmount}
    aria-label={t('composer:note_duration')}
    oninput={(e) => {
      const amount = parseInt(e.currentTarget.value);
      if (Number.isFinite(amount)) setHoldAmount(amount);
    }}
  />
  <button class="duration-popover-step" onclick={onClose} aria-label={t('common:close')}>
    {@render timesIcon()}
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
    width: min(max(25rem, 18vw), 50vw);
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
    border: none;
    border-radius: 0.3rem;
    background-color: var(--primary);
    color: var(--primary-text);
    cursor: pointer;
    flex-shrink: 0;
  }

  //the typable number. Sized in rem rather than by `size`, which a number input ignores, and the
  //spinner chrome is dropped in both engines: the two steppers beside it ARE the spinner, at a
  //size a finger can hit, and the browser's own arrows would sit inside a 3rem box next to them.
  .duration-popover-value {
    width: 3rem;
    flex-shrink: 0;
    padding: 0.15rem 0.2rem;
    border: none;
    border-radius: 0.3rem;
    background-color: var(--primary);
    color: var(--primary-text);
    font-family: inherit;
    font-size: 1rem;
    text-align: center;
    font-weight: bold;
    appearance: textfield;
    -moz-appearance: textfield;

    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      appearance: none;
      margin: 0;
    }
  }
</style>
