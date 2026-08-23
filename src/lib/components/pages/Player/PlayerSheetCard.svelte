<script lang="ts">
  import { tick } from 'svelte';
  import type { Chunk } from '$core/Songs/RecordedSong';
  import { chunkIndexAt } from '$core/Songs/sectionChunks';
  import { playerControlsStore } from '$stores/PlayerControlsStore.svelte';
  import { playerStore } from '$stores/PlayerStore.svelte';
  import IconButton from '$cmp/inputs/IconButton.svelte';
  import PlayerPagesRenderer from './PlayerPagesRenderer.svelte';
  import PlayerFramePopover from './PlayerFramePopover.svelte';
  import { t } from '$i18n/binding.svelte';

  // THE SHEET CARD (ADR-0010): the frames plus the chrome that makes them an input. Inline it holds
  // the current page at the position and width the bare grid used to have; expanded it keeps that
  // width and every other frame measurement and only grows downwards, so the user can match by eye
  // where they were before opening it.
  let {
    columns,
    onSeek,
    onSectionChange,
  }: {
    columns: number;
    /** Restart the run at an absolute note index; the Section is left alone. */
    onSeek: (noteIndex: number) => void;
    /** Light the restart hint, exactly as a slider thumb does. */
    onSectionChange: () => void;
  } = $props();

  type OpenPopover = {
    element: HTMLElement;
    chunk: Chunk;
    index: number;
    /** What the frame list looked like when it opened - see `popover` below. */
    pages: Chunk[][];
    pageIndex: number;
    fullscreen: boolean;
  };

  let cardElement: HTMLDivElement | undefined = $state();
  let scrollElement: HTMLDivElement | undefined = $state();
  let collapsedHeight = $state(0);
  let hasCenteredThisOpen = false;
  /**
   * The fullscreen view is a three-state machine, because BOTH directions animate: `closing` keeps
   * the expanded box (and every frame in it) on screen while the collapse animation shrinks it, and
   * only its animationend hands the card back to the inline layout.
   */
  let fullscreenPhase: 'closed' | 'open' | 'closing' = $state('closed');
  let popover = $state<OpenPopover | null>(null);

  const pages = $derived(playerControlsStore.pagesState.pages);
  //$derived.by, not $derived: the plain form checks inline, where TS has flow-narrowed the just
  //initialized `let` to 'closed' and rejects the comparison as overlap-free
  const isFullscreen = $derived.by(() => fullscreenPhase === 'open');
  //while closing, the card still shows ALL frames - the shrink clips over the content the user was
  //scrolling instead of snapping to one page mid-flight
  const showsAllFrames = $derived(fullscreenPhase !== 'closed');
  // The card STAYS MOUNTED through a fullscreen run transition: every restart empties the pages
  // for a moment (stopSong clears, the mode repopulates), and unmounting on that made "Go to here"
  // from inside the expanded view close and reopen it, replaying the grow animation. A real stop
  // is told apart from the transient by the event type - and the phase reset below ends the
  // fullscreen itself on that path.
  const cardVisible = $derived(
    pages.length > 0 || (fullscreenPhase !== 'closed' && playerStore.eventType !== 'stop')
  );

  // The fullscreen is DROPPED on a real STOP, not merely ignored while the sheet is missing. This
  // component is gated on the setting, not on the run, so it outlives every stop: a phase left
  // standing would hand the next SELECTED song a card that is already expanded, with a stale
  // collapsed height to animate from. Snapped straight to closed - there is nothing left on screen
  // worth animating a collapse over.
  let centeredPages: Chunk[][] | null = null;
  $effect(() => {
    if (playerStore.eventType === 'stop') {
      fullscreenPhase = 'closed';
      hasCenteredThisOpen = false;
      centeredPages = null;
    }
  });

  // A NEW page set arriving while fullscreen stands (a loop repeat, a speed change, a seek) keeps
  // the view open and re-centres it on that run's current frame: the run transition emptied and
  // refilled the scroll content, so "leave the scroll alone" - the rule while a run plays - has
  // no position to preserve here. Identity-tracked so an unrelated rerun cannot re-centre a view
  // the user has already scrolled.
  $effect(() => {
    if (fullscreenPhase !== 'open' || pages.length === 0 || centeredPages === pages) return;
    centeredPages = pages;
    hasCenteredThisOpen = false;
    tick().then(() => {
      centerOnCurrentFrame();
      updateScrollThumb();
    });
  });
  const allChunks = $derived(pages.flat());
  const pageIndexOffset = $derived.by(() => {
    let offset = 0;
    for (let i = 0; i < playerControlsStore.currentPageIndex; i++) offset += pages[i].length;
    return offset;
  });
  const visibleChunks = $derived(showsAllFrames ? allChunks : playerControlsStore.currentPage);
  const indexOffset = $derived(showsAllFrames ? 0 : pageIndexOffset);

  /**
   * The two frames the Section's markers go on: the first and the last frame its note range
   * touches. Deriving both bounds from the same intersection test is what keeps the brackets and
   * the dimming from disagreeing - the markers always enclose exactly the undimmed run, however
   * many absolute indices the mode's playability filter left with no frame of their own.
   */
  const sectionFrames = $derived.by(() => {
    const { position, end } = playerControlsStore.state;
    let first = -1;
    let last = -1;
    allChunks.forEach((chunk, i) => {
      if (chunk.lastNoteIndex < position || chunk.firstNoteIndex >= end) return;
      if (first < 0) first = i;
      last = i;
    });
    //a Section that touches no frame at all still shows where it sits rather than losing its markers
    if (first < 0) {
      const fallback = chunkIndexAt(allChunks, position);
      return { first: fallback, last: fallback };
    }
    return { first, last };
  });

  /**
   * An open popover is anchored to a frame ELEMENT, and the frames are keyed by position: a page
   * flip under the inline card leaves that anchor showing a different chunk, and a new run or a
   * fullscreen toggle replaces the element outright. Rather than closing it from an effect, the
   * open state carries what it was opened against and simply stops matching. Fullscreen holds every
   * frame at once, so a page flip there moves nothing and is not a reason to close.
   */
  const activePopover = $derived.by(() => {
    if (!popover || popover.pages !== pages || popover.fullscreen !== isFullscreen) return null;
    if (!isFullscreen && popover.pageIndex !== playerControlsStore.currentPageIndex) return null;
    return popover;
  });

  function toggleFramePopover(element: HTMLElement, chunk: Chunk, index: number) {
    popover =
      activePopover?.index === index
        ? null
        : {
            element,
            chunk,
            index,
            pages,
            pageIndex: playerControlsStore.currentPageIndex,
            fullscreen: isFullscreen,
          };
  }

  function withPopoverChunk(action: (chunk: Chunk) => void) {
    const chunk = activePopover?.chunk;
    popover = null;
    if (chunk) action(chunk);
  }

  function setSectionStart() {
    withPopoverChunk((chunk) => {
      playerControlsStore.setSectionStart(chunk.firstNoteIndex);
      onSectionChange();
    });
  }

  function setSectionEnd() {
    withPopoverChunk((chunk) => {
      //the frame is INCLUDED: `end` is exclusive, so it lands one past the frame's last note
      playerControlsStore.setSectionEnd(chunk.lastNoteIndex + 1);
      onSectionChange();
    });
  }

  function goToFrame() {
    withPopoverChunk((chunk) => onSeek(chunk.firstNoteIndex));
  }

  function centerOnCurrentFrame() {
    const index = playerControlsStore.currentGlobalChunkIndex;
    if (index < 0 || !scrollElement) return;
    const frame = scrollElement.querySelector<HTMLElement>(`[data-frame-index="${index}"]`);
    if (!frame) return;
    scrollElement.scrollTop =
      frame.offsetTop + frame.offsetHeight / 2 - scrollElement.clientHeight / 2;
  }

  /**
   * The overlay scroll THUMB: an indicator of how far into the song the expanded view sits, not a
   * control (pointer-events: none, not draggable). The native scrollbar stays hidden because a
   * classic one takes its width out of the content box - the expanded frames rendered narrower
   * than the same frames inline, a layout shift the expansion exists to avoid. Updated from the
   * box's own scroll events (programmatic scrollTop writes fire those too) plus the explicit
   * calls at the moments the box RESIZES without scrolling: open, animation end, window resize.
   */
  let scrollThumb = $state({ top: 0, height: 0, visible: false });

  function updateScrollThumb() {
    const el = scrollElement;
    if (!el || fullscreenPhase !== 'open') {
      scrollThumb = { top: 0, height: 0, visible: false };
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight <= clientHeight) {
      scrollThumb = { top: 0, height: 0, visible: false };
      return;
    }
    const height = Math.max(24, (clientHeight / scrollHeight) * clientHeight);
    //the travel is shortened by what the minimum height added, or the thumb overshoots the box
    const travel = clientHeight - height;
    const progress = scrollTop / (scrollHeight - clientHeight);
    scrollThumb = { top: el.offsetTop + progress * travel, height, visible: true };
  }

  async function openFullscreen() {
    //guarded on closed: mid-collapse the card's height is whatever the animation reached, and
    //measuring THAT as the collapsed height would seed the next open with a moving target
    if (fullscreenPhase !== 'closed') return;
    //measured BEFORE the phase flips: it is where the growth animation starts from, and where the
    //collapse animation returns to
    collapsedHeight = cardElement?.clientHeight ?? 0;
    hasCenteredThisOpen = false;
    fullscreenPhase = 'open';
    await tick();
    centerOnCurrentFrame();
    updateScrollThumb();
  }

  function collapseFullscreen() {
    if (fullscreenPhase !== 'open') return;
    fullscreenPhase = 'closing';
    //the indicator leaves with the interactive view, not 150ms after it
    updateScrollThumb();
  }

  function handleCardAnimationEnd(e: AnimationEvent) {
    //animationend BUBBLES: only the card's own animations may drive the phase machine - a child's
    //ending mid-collapse would otherwise cut the closing animation short
    if (e.target !== cardElement) return;
    //the collapse's end is what actually returns the card to the inline layout
    if (fullscreenPhase === 'closing') {
      fullscreenPhase = 'closed';
      return;
    }
    // Centred once more when the growth finishes, because the scroll box was still short while it
    // animated - and then never again. The highlight moves on, the view deliberately does not.
    if (!isFullscreen || hasCenteredThisOpen) return;
    hasCenteredThisOpen = true;
    centerOnCurrentFrame();
    updateScrollThumb();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (isFullscreen && e.code === 'Escape') collapseFullscreen();
  }

  function handleWindowPointerDown(e: PointerEvent) {
    if (fullscreenPhase !== 'open') return;
    const target = e.target as Element | null;
    if (!target || cardElement?.contains(target)) return;
    //the frame popover is a SIBLING of the card (the containing-block trap) - a press on one of
    //its items belongs to this surface, and "Go to here" must not also collapse the view
    if (target.closest?.('.frame-popover')) return;
    collapseFullscreen();
  }
</script>

<svelte:window
  onkeydown={handleKeyDown}
  onpointerdown={handleWindowPointerDown}
  onresize={updateScrollThumb}
/>

{#snippet expandIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M32 32C14.3 32 0 46.3 0 64v96c0 17.7 14.3 32 32 32s32-14.3 32-32V96h64c17.7 0 32-14.3 32-32s-14.3-32-32-32H32zM64 352c0-17.7-14.3-32-32-32s-32 14.3-32 32v96c0 17.7 14.3 32 32 32h96c17.7 0 32-14.3 32-32s-14.3-32-32-32H64V352zM320 32c-17.7 0-32 14.3-32 32s14.3 32 32 32h64v64c0 17.7 14.3 32 32 32s32-14.3 32-32V64c0-17.7-14.3-32-32-32H320zM448 352c0-17.7-14.3-32-32-32s-32 14.3-32 32v64H320c-17.7 0-32 14.3-32 32s14.3 32 32 32h96c17.7 0 32-14.3 32-32V352z"
    /></svg
  >
{/snippet}

{#snippet collapseIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M160 64c0-17.7-14.3-32-32-32s-32 14.3-32 32v64H32c-17.7 0-32 14.3-32 32s14.3 32 32 32h96c17.7 0 32-14.3 32-32V64zM32 320c-17.7 0-32 14.3-32 32s14.3 32 32 32H96v64c0 17.7 14.3 32 32 32s32-14.3 32-32V352c0-17.7-14.3-32-32-32H32zM352 64c0-17.7-14.3-32-32-32s-32 14.3-32 32v96c0 17.7 14.3 32 32 32h96c17.7 0 32-14.3 32-32s-14.3-32-32-32H352V64zM320 320c-17.7 0-32 14.3-32 32v96c0 17.7 14.3 32 32 32s32-14.3 32-32V384h64c17.7 0 32-14.3 32-32s-14.3-32-32-32H320z"
    /></svg
  >
{/snippet}

{#if cardVisible}
  <div
    bind:this={cardElement}
    class={[
      'player-sheet-card',
      isFullscreen && 'player-sheet-card-expanded',
      fullscreenPhase === 'closing' && 'player-sheet-card-closing',
    ]}
    style={showsAllFrames ? `--sheet-collapsed-height:${collapsedHeight}px` : ''}
    onanimationend={handleCardAnimationEnd}
  >
    <div class="player-sheet-scroll" bind:this={scrollElement} onscroll={updateScrollThumb}>
      <PlayerPagesRenderer
        chunks={visibleChunks}
        {columns}
        {indexOffset}
        sectionFirstIndex={sectionFrames.first}
        sectionLastIndex={sectionFrames.last}
        openFrameIndex={activePopover?.index ?? -1}
        onFrameSelect={toggleFramePopover}
      />
    </div>
    {#if scrollThumb.visible}
      <!-- A sibling of the scroll box, not a child: an absolutely-positioned descendant of a
           scrolling box lives in its scroll layer and would ride away with the content. -->
      <div
        class="player-sheet-scroll-thumb"
        style="top:{scrollThumb.top}px;height:{scrollThumb.height}px"
      ></div>
    {/if}
    <!-- Outside the card's own box on purpose: anywhere inside it would sit on top of a frame. -->
    <div class="player-sheet-expand">
      <IconButton
        size="1.7rem"
        onclick={isFullscreen ? collapseFullscreen : openFullscreen}
        tooltip={isFullscreen ? t('player:collapse_sheet') : t('player:expand_sheet')}
        tooltipPosition="left"
        ariaLabel={isFullscreen ? t('player:collapse_sheet') : t('player:expand_sheet')}
      >
        {#if isFullscreen}
          {@render collapseIcon()}
        {:else}
          {@render expandIcon()}
        {/if}
      </IconButton>
    </div>
  </div>
{/if}

{#if activePopover}
  <PlayerFramePopover
    anchor={activePopover.element}
    onSectionStart={setSectionStart}
    onSectionEnd={setSectionEnd}
    onGoTo={goToFrame}
    onClose={() => (popover = null)}
  />
{/if}

<style>
  /* Same containing block (body, i.e. the viewport - every ancestor is static) and the same static
     horizontal position as the bare grid this replaced, so the card lands where the frames used to
     and `.app { justify-content: center }` keeps centring it. */
  .player-sheet-card {
    position: absolute;
    top: 0.4rem;
    width: 65vw;
    max-width: 45rem;
    margin-left: auto;
    margin-right: auto;
    border-radius: 0.5rem;
    background-color: var(--background-layer-15);
  }

  /* The card's inset lives on the GRID as margin, never on the card as padding: expanded, the
     scroll box clips at its own padding edge, and the Section brackets overhang their frames - as
     padding that overhang sat outside the scrollable content and was cut off. Both views are
     unchanged otherwise: the card establishes a block formatting context (absolute), so the
     margin is contained by its height exactly as the padding was. */
  .player-sheet-scroll :global(.player-chunks-page) {
    margin: 0.4rem;
  }

  @media only screen and (max-width: 920px) {
    .player-sheet-card {
      width: 55vw;
    }
  }

  .player-sheet-scroll {
    /* the offsetParent the fullscreen centring measures frame positions against */
    position: relative;
  }

  /* Vertical growth ONLY: width, inset, column count and frame size are all untouched, which is
     what lets the user find the frame they were looking at. Above the keyboard (10), the hold ring
     (11) and the menu column (11); below Home (100), the logger and prompts. The closing card
     keeps the same box - only its animation runs the other way, and its end is what hands the
     card back to the inline layout (see handleCardAnimationEnd). */
  .player-sheet-card-expanded,
  .player-sheet-card-closing {
    height: calc(100vh - 1.6rem);
    z-index: 40;
    display: flex;
    flex-direction: column;
  }

  .player-sheet-card-expanded {
    animation: sheetCardExpand 0.15s ease-out;
  }

  /* forwards: the shrunken height must hold until animationend flips the phase, or the card
     snaps back to full for the one frame between the animation ending and the class leaving */
  .player-sheet-card-closing {
    animation: sheetCardCollapse 0.15s ease-in forwards;
  }

  /* The NATIVE scrollbar stays hidden: a classic one takes its width out of the content box, so
     the expanded frames rendered narrower than the same frames inline - a layout shift on every
     open. The overlay thumb below is the scroll indicator instead. */
  .player-sheet-card-expanded .player-sheet-scroll,
  .player-sheet-card-closing .player-sheet-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: none;
  }

  .player-sheet-card-expanded .player-sheet-scroll::-webkit-scrollbar,
  .player-sheet-card-closing .player-sheet-scroll::-webkit-scrollbar {
    display: none;
  }

  /* Indicator only, never a control: it overlays the frames' right edge without taking layout
     space, and pointer-events stay off so it cannot swallow a frame's own click. */
  .player-sheet-scroll-thumb {
    position: absolute;
    right: 0.05rem;
    width: 0.3rem;
    border-radius: 1rem;
    background-color: var(--secondary);
    opacity: 0.8;
    pointer-events: none;
    z-index: 1;
  }

  /* Height is the only property that animates, and the expanded card carries no backdrop-filter:
     what sits under it is separated by the translucent background alone. */
  @keyframes sheetCardExpand {
    from {
      height: var(--sheet-collapsed-height, 8rem);
    }
    to {
      height: calc(100vh - 1.6rem);
    }
  }

  @keyframes sheetCardCollapse {
    from {
      height: calc(100vh - 1.6rem);
    }
    to {
      height: var(--sheet-collapsed-height, 8rem);
    }
  }

  .player-sheet-expand {
    position: absolute;
    top: 0.4rem;
    right: -1.9rem;
  }
</style>
