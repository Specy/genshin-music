<script lang="ts">
  import * as workerTimers from 'worker-timers';
  import { DEFAULT_DOM_RECT } from '$core/legacyConfig';
  import { clamp } from '$core/utils/Utilities';
  import { playerControlsStore } from '$stores/PlayerControlsStore.svelte';
  import './Slider.css';

  let {
    onChange,
    onCommit,
  }: {
    /** Live Section feedback while a thumb moves or a frame number is typed. */
    onChange?: (start: number, end: number) => void;
    /** One completed selector gesture; active playback restarts from the new Section here. */
    onCommit?: (start: number, end: number) => void;
  } = $props();

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
    </div>
  </div>
</div>
