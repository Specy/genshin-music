<script lang="ts">
  import * as workerTimers from 'worker-timers';
  import { on } from 'svelte/events';
  import type { Attachment } from 'svelte/attachments';
  import { DEFAULT_DOM_RECT } from '$core/legacyConfig';
  import { clamp } from '$core/utils/Utilities';
  import { playerControlsStore } from '$stores/PlayerControlsStore.svelte';

  let {
    onChange,
    onCommit,
  }: {
    /** Live Section feedback while a thumb moves or a frame number is typed. */
    onChange?: (start: number, end: number) => void;
    /** One completed selector gesture; active playback restarts from the new Section here. */
    onCommit?: (start: number, end: number) => void;
  } = $props();

  /**
   * Enters an arrow handle into the browser's TOUCH ADJUSTMENT contest, which it otherwise loses.
   *
   * A finger never lands exactly on a 1em glyph, so every engine re-targets a touch to the nearest
   * element it considers pressable. Blink's candidate test (WebKit's and Firefox-for-Android's are
   * the same shape) counts mouse-button listeners, links and focusable form controls - nothing
   * else. `pointerdown` does not qualify, and Svelte delegates it to the root anyway, so an arrow
   * declared nothing an engine could see and every press near one was handed to a pressable
   * NEIGHBOUR instead: the frame-number input beside it, where `handleSliderClick`'s deliberate
   * early return swallowed it, or the speed select above the track, which is outside the slider
   * entirely so the press never arrived at all. That was the whole "the thumbs cannot be dragged
   * with a finger" bug - the mouse was unaffected because adjustment is a touch-only step.
   *
   * One real, empty mousedown listener is the whole declaration; the press itself keeps flowing
   * through `.slider-outer`'s pointer handlers, which read coordinates and never the target. It is
   * registered through `on()` rather than an `onmousedown` attribute because Svelte would delegate
   * that one too, leaving the element as invisible to the engine as before.
   */
  const touchAdjustmentTarget: Attachment<HTMLElement> = (element) =>
    on(element, 'mousedown', () => {});

  let selectedThumb: 'start' | 'end' | null = $state(null);
  let selectionChanged = false;
  let inputDimension: DOMRect = $state(DEFAULT_DOM_RECT);
  let inputsEnabled = $state(true);
  let thumb1: HTMLDivElement | undefined;
  let thumb2: HTMLDivElement | undefined;
  let slider: HTMLDivElement | undefined;

  $effect(() => {
    //TODO remove the dependency and instead use the callback for the set state
    if (selectedThumb === null) return;

    window.addEventListener('pointerup', finishSelection);
    window.addEventListener('pointercancel', finishSelection);
    window.addEventListener('blur', finishSelection);
    return () => {
      window.removeEventListener('pointerup', finishSelection);
      window.removeEventListener('pointercancel', finishSelection);
      window.removeEventListener('blur', finishSelection);
    };
  });

  function publishChange(beforePosition: number, beforeEnd: number) {
    if (beforePosition === playerControlsStore.position && beforeEnd === playerControlsStore.end)
      return;
    selectionChanged = true;
    onChange?.(playerControlsStore.position, playerControlsStore.end);
  }

  /**
   * Slider coordinates are FRAME BOUNDARIES: start 0 is before frame one, end N is after frame N.
   * Converting only here keeps the store's playback bounds in their native absolute-note space.
   */
  function setFrameBoundary(value: number, type: 'start' | 'end') {
    const count = frames.length;
    if (count === 0) return;
    const beforePosition = playerControlsStore.position;
    const beforeEnd = playerControlsStore.end;
    if (type === 'start') {
      const lastAllowed = Math.max(0, sectionFrames.last);
      const frameIndex = clamp(Math.round(value), 0, lastAllowed);
      playerControlsStore.setSectionStart(frames[frameIndex].firstNoteIndex);
    } else {
      const firstAllowed = Math.max(0, sectionFrames.first);
      const boundary = clamp(Math.round(value), firstAllowed + 1, count);
      playerControlsStore.setSectionEnd(frames[boundary - 1].lastNoteIndex + 1);
    }
    publishChange(beforePosition, beforeEnd);
  }

  function handleSelectChange(val: number, type: 'start' | 'end') {
    // Inputs show human-facing frame ordinals (1..N); only the start needs converting to its
    // zero-based boundary. The end ordinal already equals the boundary after that frame.
    setFrameBoundary(type === 'start' ? val - 1 : val, type);
  }

  function handleSliderClick(event: PointerEvent) {
    // The frame-number fields sit beside the thumbs but are descendants of this hit area. Let a
    // press in one edit/focus that field; treating its off-track coordinate as a drag would move
    // the Section before the user had typed anything.
    if ((event.target as Element | null)?.closest('.slider-input')) return;
    if (slider && thumb1 && thumb2) {
      const size = slider.getBoundingClientRect();
      const offset = event.clientY;
      const thumb1Position = thumb1.getBoundingClientRect().y;
      const thumb2Position = thumb2.getBoundingClientRect().y;
      const left = Math.abs(thumb1Position - offset);
      const right = Math.abs(thumb2Position - offset);
      inputDimension = size;
      const currentThumb = left >= right ? 'end' : 'start';
      selectedThumb = currentThumb;
      selectionChanged = false;
      slider.setPointerCapture?.(event.pointerId);
      handleSliderMove(event, currentThumb);
    }
  }

  function finishSelection() {
    if (selectedThumb === null) return;
    selectedThumb = null;
    if (!selectionChanged) return;
    selectionChanged = false;
    onCommit?.(playerControlsStore.position, playerControlsStore.end);
  }

  function commitInputChange() {
    if (!selectionChanged) return;
    selectionChanged = false;
    onCommit?.(playerControlsStore.position, playerControlsStore.end);
  }

  function enableInputs(e: MouseEvent) {
    inputsEnabled = true;
    workerTimers.setTimeout(() => {
      (e.currentTarget as HTMLInputElement | null)?.focus();
    }, 50);
  }

  function disableInputs() {
    inputsEnabled = false;
  }

  function handleSliderMove(event: PointerEvent, override?: 'start' | 'end') {
    const currentThumb = override ?? selectedThumb;
    if (currentThumb === null) return;
    const sliderSize = inputDimension.height;
    const sliderOffset = inputDimension.y;
    const eventPosition = event.clientY - sliderOffset;
    //reverse the order from top to bottom
    if (sliderSize <= 0 || frames.length === 0) return;
    const value = clamp(
      Math.round((1 - eventPosition / sliderSize) * frames.length),
      0,
      frames.length
    );
    setFrameBoundary(value, currentThumb);
  }

  const frames = $derived(playerControlsStore.frames);
  const sectionFrames = $derived(playerControlsStore.sectionFrames);
  const startBoundary = $derived(sectionFrames.first < 0 ? 0 : sectionFrames.first);
  const endBoundary = $derived(sectionFrames.last < 0 ? 0 : sectionFrames.last + 1);
  const start = $derived(frames.length > 0 ? (startBoundary / frames.length) * 100 : 0);
  const end = $derived(frames.length > 0 ? (endBoundary / frames.length) * 100 : 100);
  const current = $derived(
    frames.length > 0 ? (playerControlsStore.currentFrameBoundary / frames.length) * 100 : 0
  );
</script>

<!-- Pointer handlers only, no keyboard equivalent - accepted a11y gap. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="slider-outer"
  bind:this={slider}
  onpointerup={finishSelection}
  onpointercancel={finishSelection}
  onpointermove={handleSliderMove}
  onpointerdown={handleSliderClick}
>
  <div class="slider-full">
    <div class="slider-current" style="transform:translateY({(100 - current).toFixed(1)}%)"></div>
  </div>
  <div class="two-way-slider">
    <div class="two-way-slider-thumb" style="bottom:calc({end}% - 18px)" bind:this={thumb2}>
      <!-- oninput updates live per keystroke, matching drag feedback; onchange commits once. -->
      <input
        type="number"
        class="slider-input"
        style="font-size:0.8rem"
        value={endBoundary}
        min={Math.max(1, startBoundary + 1)}
        max={frames.length}
        onclick={enableInputs}
        readonly={!inputsEnabled}
        onblur={disableInputs}
        oninput={(e) => handleSelectChange(+e.currentTarget.value, 'end')}
        onchange={commitInputChange}
      />
      <span class="two-way-slider-grab" {@attach touchAdjustmentTarget}>
        <svg
          stroke="currentColor"
          fill="currentColor"
          stroke-width="0"
          viewBox="0 0 16 16"
          height="1em"
          width="1em"
          style="filter:drop-shadow(rgba(0, 0, 0, 0.4) 0px 2px 2px)"
          xmlns="http://www.w3.org/2000/svg"
          ><path
            fill-rule="evenodd"
            d="M7.022 1.566a1.13 1.13 0 0 1 1.96 0l6.857 11.667c.457.778-.092 1.767-.98 1.767H1.144c-.889 0-1.437-.99-.98-1.767z"
          /></svg
        >
      </span>
    </div>
    <div class="two-way-slider-thumb" style="bottom:calc({start}% - 14px)" bind:this={thumb1}>
      <input
        type="number"
        class="slider-input"
        style="font-size:0.8rem"
        value={startBoundary + 1}
        min={1}
        max={Math.max(1, endBoundary)}
        onclick={enableInputs}
        readonly={!inputsEnabled}
        onblur={disableInputs}
        oninput={(e) => handleSelectChange(+e.currentTarget.value, 'start')}
        onchange={commitInputChange}
      />
      <span class="two-way-slider-grab" {@attach touchAdjustmentTarget}>
        <svg
          stroke="currentColor"
          fill="currentColor"
          stroke-width="0"
          viewBox="0 0 16 16"
          height="1em"
          width="1em"
          style="filter:drop-shadow(rgba(0, 0, 0, 0.4) 0px 2px 2px)"
          xmlns="http://www.w3.org/2000/svg"
          ><path
            fill-rule="evenodd"
            d="M7.022 1.566a1.13 1.13 0 0 1 1.96 0l6.857 11.667c.457.778-.092 1.767-.98 1.767H1.144c-.889 0-1.437-.99-.98-1.767z"
          /></svg
        >
      </span>
    </div>
  </div>
</div>

<style>
  .two-way-slider {
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
  }

  .two-way-slider-thumb {
    display: flex;
    transform: translate(-100%, -50%);
    color: var(--accent);
    position: absolute;
    text-shadow: rgba(0, 0, 0, 0.4) 0px 2px 4px;
  }

  .two-way-slider-thumb svg {
    transform: rotate(90deg);
    margin-left: 0.2rem;
  }

  /* The arrow's grab handle: a span whose only job is to BE an element the browser's touch
     adjustment can aim at - see PlayerSlider's `touchAdjustmentTarget` for why one is needed. Plain
     flow at its natural size, a stretched flex item exactly like the bare svg used to be, so the
     glyph lands on the pixels it always did.

     Deliberately NOT grown into a finger-sized hit box, though that is the obvious next step: a
     thumb parked at either end of the track sits FLUSH against the button rows above and below it -
     with the Section ending on the last frame, the arrow's top edge is already level with the Stop
     button's bottom edge - so padding here would paint nothing yet win hit-testing over a fifth of
     the Stop button and a sixth of the speed select, and a finger landing on either would silently
     drag the Section instead of pressing the button it aimed at. Candidacy is what fixes the
     targeting; size never was the missing piece, and there is no room to buy any. */
  .two-way-slider-grab {
    display: flex;
  }

  .slider-outer {
    width: 1rem;
    position: relative;
    margin-top: 0;
    touch-action: none;
    height: 100%;
    cursor: pointer;
  }

  .slider-full {
    height: 100%;
    width: 100%;
    background-color: var(--primary-darken-10);
    border-radius: 0.2rem;
    overflow: hidden;
  }

  .slider-input {
    user-select: none;
    font-family: 'Bonobo';
    font-weight: bold;
    width: 4ch;
    text-align: end;
    background: transparent;
    color: var(--accent);
    border: none;
    -moz-appearance: textfield;
    appearance: textfield;
  }

  .slider-input::-webkit-outer-spin-button,
  .slider-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .slider-current {
    height: 100%;
    width: 100%;
    transform: translateY(100%);
    transition: all 0.1s linear;
    background-color: var(--accent);
    left: 0;
    top: 0;
  }
</style>

