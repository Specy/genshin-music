<script lang="ts">
  import { on } from 'svelte/events';
  import type { Attachment } from 'svelte/attachments';
  import { PRO_SCROLLBAR_WIDTH } from './composerCanvasGeometry';
  import { cameraYForScrollbarThumb, proScrollbarThumb, type ProScroll } from './proViewGeometry';

  // THE PRO VIEW'S VERTICAL SCROLLBAR (CONTEXT.md: Pro View): a DOM element standing over the
  // canvas' right edge - the Column Ruler's band and the notes region under it - showing how much
  // of the axis the camera window covers and where, and taking a drag on its thumb or a press on
  // its track.
  //
  // IT OWNS NO CAMERA. Where the thumb is comes from the renderer's onProScroll report, and what a
  // press does goes back through `onScrollTo` (ComposerRenderer.scrollProCameraTo) - so the stage
  // drag, the wheel, the zoom and a locked frame's ease all move this thumb the same way, and a
  // scrollbar drag is clamped and unlocks the View Lock by the same rules a wheel is.
  //
  // VISIBLE ALWAYS WHILE THE SONG IS STOPPED, and while it plays only under a hovering pointer (or
  // a drag already in progress): fading in quickly and out slowly, the two durations living on the
  // two states in the style block below. The hover half is behind `(hover: hover)` because a touch
  // LATCHES :hover until the next tap, which would leave the scrollbar stuck on over a playing song.
  let {
    scroll,
    top,
    trackHeight,
    isPlaying,
    onScrollTo,
    onWheel,
  }: {
    /** The camera as the renderer last reported it. */
    scroll: ProScroll;
    /** The track's top edge in the canvas box. */
    top: number;
    trackHeight: number;
    isPlaying: boolean;
    /** Put the camera at an absolute offset down the axis; `smooth` for a track press's jump. */
    onScrollTo: (cameraY: number, smooth: boolean) => void;
    onWheel: (e: WheelEvent) => void;
  } = $props();

  const thumb = $derived(proScrollbarThumb(scroll, trackHeight));

  /**
   * The press being dragged - which pointer, and where on the thumb it holds it, in px from the
   * thumb's top edge - or null. A press on the TRACK holds the thumb by its middle, which is what
   * makes it a jump to the pointer that then carries on as an ordinary drag.
   */
  let drag: { pointerId: number; grab: number } | null = $state(null);

  /**
   * Enters the track into the browser's TOUCH ADJUSTMENT contest - see PlayerSlider.svelte's
   * attachment of the same name for the whole story. A 14px strip standing on the side chevron's
   * edge (a <button>, which the engine counts as pressable) would otherwise lose every nearby touch
   * to it, and Svelte delegates `pointerdown`, so only a real element-level mousedown declares this one.
   */
  const touchAdjustmentTarget: Attachment<HTMLElement> = (element) =>
    on(element, 'mousedown', () => {});

  function cameraYAt(track: HTMLElement, clientY: number, grab: number): number {
    return cameraYForScrollbarThumb(
      scroll,
      clientY - track.getBoundingClientRect().top - grab,
      trackHeight
    );
  }

  function handlePointerDown(e: PointerEvent & { currentTarget: EventTarget & HTMLDivElement }) {
    if (!thumb || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const track = e.currentTarget;
    const y = e.clientY - track.getBoundingClientRect().top;
    const onThumb = y >= thumb.top && y <= thumb.top + thumb.height;
    const grab = onThumb ? y - thumb.top : thumb.height / 2;
    track.setPointerCapture(e.pointerId);
    drag = { pointerId: e.pointerId, grab };
    if (!onThumb) onScrollTo(cameraYAt(track, e.clientY, grab), true);
  }

  function handlePointerMove(e: PointerEvent & { currentTarget: EventTarget & HTMLDivElement }) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    onScrollTo(cameraYAt(e.currentTarget, e.clientY, drag.grab), false);
  }

  // Ended from the WINDOW as well as from the track's lost capture: the track unmounts when the
  // axis stops overflowing (a zoom-out mid-drag), and a drag nothing ended would hold the
  // scrollbar visible over a playing song from then on.
  function endDrag(e: PointerEvent) {
    if (drag && e.pointerId === drag.pointerId) drag = null;
  }
</script>

<svelte:window onpointerup={endDrag} onpointercancel={endDrag} onblur={() => (drag = null)} />

{#if thumb}
  <div
    class={[
      'pro-scrollbar',
      (!isPlaying || drag) && 'pro-scrollbar-shown',
      drag && 'pro-scrollbar-dragging',
    ]}
    style:top="{top}px"
    style:height="{trackHeight}px"
    style:width="{PRO_SCROLLBAR_WIDTH}px"
    aria-hidden="true"
    {@attach touchAdjustmentTarget}
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onlostpointercapture={endDrag}
    onwheel={(e) => {
      e.preventDefault();
      onWheel(e);
    }}
  >
    <div
      class="pro-scrollbar-thumb"
      style:height="{thumb.height}px"
      style:transform="translateY({thumb.top}px)"
    ></div>
  </div>
{/if}

<style>
  /* HIDDEN, and the transition that takes it there: disappearing is the slow one. */
  .pro-scrollbar {
    position: absolute;
    right: 0;
    /* over the right side chevron (z-index 2), whose gradient runs on underneath it to the edge */
    z-index: 3;
    touch-action: none;
    opacity: 0;
    pointer-events: none;
    transition: opacity 1s ease;
  }

  /* ...and SHOWN, with the quick transition that brings it in. */
  .pro-scrollbar-shown {
    opacity: 1;
    pointer-events: auto;
    transition: opacity 0.15s ease-out;
  }

  .pro-scrollbar-thumb {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    margin: 0 auto;
    width: 6px;
    border-radius: 5px;
    background-color: var(--primary-text);
    opacity: 0.4;
    transition:
      width 0.15s,
      opacity 0.15s;
  }

  .pro-scrollbar-dragging .pro-scrollbar-thumb {
    width: 10px;
    opacity: 0.75;
  }

  @media (hover: hover) {
    :global(.canvas-relative:hover) > .pro-scrollbar {
      opacity: 1;
      pointer-events: auto;
      transition: opacity 0.15s ease-out;
    }

    .pro-scrollbar:hover {
      background-color: color-mix(in srgb, var(--primary-text) 8%, transparent);
    }

    .pro-scrollbar:hover .pro-scrollbar-thumb {
      width: 10px;
      opacity: 0.6;
    }

    .pro-scrollbar-dragging:hover .pro-scrollbar-thumb {
      opacity: 0.75;
    }
  }
</style>
