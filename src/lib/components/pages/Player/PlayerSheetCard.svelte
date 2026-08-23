<script lang="ts">
  import { onDestroy, tick } from 'svelte';
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

  type VirtualMetrics = {
    rowHeight: number;
    rowGap: number;
    marginTop: number;
    marginBottom: number;
  };

  type VirtualRange = { startRow: number; endRow: number };

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
  let surfaceElement: HTMLDivElement | undefined = $state();
  let scrollElement: HTMLDivElement | undefined = $state();
  let collapsedHeight = $state(0);
  let revealCenterShift = $state(0);
  /**
   * Where the reveal translate STARTS. Usually 0 - the initial scrollTop alone puts the current
   * page's rows exactly where the inline card had them - but near the song's tail that scrollTop
   * would exceed the scroll range, so the clamped remainder is carried by the transform instead:
   * the rows still open in place, wherever the page is.
   */
  let revealFromShift = $state(0);
  let revealFinalScrollTop = 0;
  /**
   * The reveal/hide are Web Animations with CONCRETE PIXEL keyframes, never CSS keyframes
   * reading var(): Chrome runs clip-path/transform animations on its compositor thread, and at
   * the animation's edges the compositor resolved `var(--sheet-collapsed-height, 8rem)` to the
   * 8rem FALLBACK for a few frames - the card visibly clipped ~30px short at the start of every
   * reveal and the end of every hide (Chrome-only; Edge/Firefox showed nothing). Values are
   * computed here at start time, so there is nothing left for the compositor to mis-resolve.
   * jsdom has no Element.animate; there the 250ms fallback timers drive the phase machine alone.
   */
  let revealAnimations: Animation[] = [];
  let hideAnimation: Animation | null = null;
  let hasCenteredThisOpen = $state(false);
  let collapseAfterReveal = false;
  let resizeRevision = 0;
  const ANIMATION_FALLBACK_MS = 250;
  let animationFallback: ReturnType<typeof setTimeout> | undefined;
  const VIRTUAL_OVERSCAN_ROWS = 2;
  // Browser layout replaces these before fullscreen opens. They are also deliberate zero-layout
  // fallbacks for tests and for the unlikely first frame whose intrinsic content has not resolved.
  let virtualMetrics = $state<VirtualMetrics>({
    rowHeight: 64,
    rowGap: 3.2,
    marginTop: 6.4,
    marginBottom: 6.4,
  });
  let virtualRange = $state<VirtualRange>({ startRow: 0, endRow: 1 });
  /**
   * The fullscreen view is a three-state machine, because BOTH directions animate: `closing`
   * keeps the full-song scroll surface in place while the hide animation masks it, and only its
   * animationend hands the card back to the inline layout.
   */
  let fullscreenPhase: 'closed' | 'open' | 'closing' = $state('closed');
  let popover = $state<OpenPopover | null>(null);

  function clearAnimationFallback() {
    if (animationFallback === undefined) return;
    clearTimeout(animationFallback);
    animationFallback = undefined;
  }

  function cancelRevealAnimations() {
    for (const animation of revealAnimations) animation.cancel();
    revealAnimations = [];
  }

  /** Clip the surface to the collapsed height and grow it open; slide the mounted rows along. */
  function animateReveal() {
    cancelRevealAnimations();
    if (!surfaceElement || typeof surfaceElement.animate !== 'function') return;
    const surfaceHeight = surfaceElement.getBoundingClientRect().height;
    const inset = Math.max(0, surfaceHeight - collapsedHeight);
    //`fill: both` so the from-state holds from creation (this runs before the phase flip's first
    //paint) and the end-state holds until finishReveal swaps it for the equivalent scroll offset
    const options: KeyframeAnimationOptions = { duration: 150, easing: 'ease-out', fill: 'both' };
    const surfaceAnimation = surfaceElement.animate(
      [
        { clipPath: `inset(0 0 ${inset}px 0 round 0.5rem)` },
        { clipPath: 'inset(0 0 0 0 round 0.5rem)' },
      ],
      options
    );
    revealAnimations = [surfaceAnimation];
    const windowElement = scrollElement?.querySelector('.player-chunks-window');
    if (windowElement) {
      revealAnimations.push(
        windowElement.animate(
          [
            { transform: `translateY(${revealFromShift}px)` },
            { transform: `translateY(${revealCenterShift}px)` },
          ],
          options
        )
      );
    }
    surfaceAnimation.finished.then(
      //a cancelled animation (fallback fired first, or a re-anchor replaced this one) must not
      //drive the phase machine a second time
      () => {
        if (revealAnimations.includes(surfaceAnimation)) finishReveal();
      },
      () => {}
    );
  }

  /** The reverse clip, held at the collapsed height until finishCollapse swaps the layout in. */
  function animateHide() {
    if (!surfaceElement || typeof surfaceElement.animate !== 'function') return;
    const surfaceHeight = surfaceElement.getBoundingClientRect().height;
    const inset = Math.max(0, surfaceHeight - collapsedHeight);
    const animation = surfaceElement.animate(
      [
        { clipPath: 'inset(0 0 0 0 round 0.5rem)' },
        { clipPath: `inset(0 0 ${inset}px 0 round 0.5rem)` },
      ],
      { duration: 150, easing: 'ease-in', fill: 'both' }
    );
    hideAnimation = animation;
    animation.finished.then(
      () => {
        if (hideAnimation === animation) finishCollapse();
      },
      () => {}
    );
  }

  function scheduleAnimationFallback(animation: 'reveal' | 'hide') {
    clearAnimationFallback();
    animationFallback = setTimeout(() => {
      animationFallback = undefined;
      if (animation === 'reveal') finishReveal();
      else finishCollapse();
    }, ANIMATION_FALLBACK_MS);
  }

  onDestroy(clearAnimationFallback);

  const pages = $derived(playerControlsStore.pagesState.pages);
  //$derived.by, not $derived: the plain form checks inline, where TS has flow-narrowed the just
  //initialized `let` to 'closed' and rejects the comparison as overlap-free
  const isFullscreen = $derived.by(() => fullscreenPhase === 'open');
  //while closing, the card still shows the full-song virtual surface - the shrink clips over the
  //content the user was scrolling instead of snapping to one page mid-flight
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
      clearAnimationFallback();
      cancelRevealAnimations();
      hideAnimation?.cancel();
      hideAnimation = null;
      fullscreenPhase = 'closed';
      hasCenteredThisOpen = false;
      collapseAfterReveal = false;
      revealFromShift = 0;
      revealCenterShift = 0;
      revealFinalScrollTop = 0;
      resizeRevision++;
      centeredPages = null;
      virtualRange = { startRow: 0, endRow: 1 };
      popover = null;
    }
  });

  // A NEW page set arriving while fullscreen stands (a loop repeat, a speed change, a seek) keeps
  // the view open and re-centres it on that run's current frame: the run transition emptied and
  // refilled the scroll content, so "leave the scroll alone" - the rule while a run plays - has
  // no position to preserve here. Identity-tracked so an unrelated rerun cannot re-centre a view
  // the user has already scrolled.
  $effect(() => {
    if (fullscreenPhase !== 'open' || pages.length === 0 || centeredPages === pages) return;
    const pageSet = pages;
    centeredPages = pageSet;
    const finalViewportHeight = scrollElement?.clientHeight || expandedViewportEstimate();
    const revealScrollTop = prepareVirtualWindowForCurrentFrame(finalViewportHeight);
    tick().then(() => {
      if (fullscreenPhase !== 'open' || pages !== pageSet || centeredPages !== pageSet) return;
      if (hasCenteredThisOpen) {
        centerOnCurrentFrame();
      } else {
        if (scrollElement) scrollElement.scrollTop = revealScrollTop;
        //the running reveal's keyframes captured the PREVIOUS page set's shifts; re-anchor it on
        //the fresh values or the animationend hand-off would jump by their difference
        animateReveal();
      }
      updateScrollThumb();
    });
  });
  const allChunks = $derived(pages.flat());
  const safeColumns = $derived(Math.max(1, columns));
  const totalRows = $derived(Math.ceil(allChunks.length / safeColumns));
  const mountedStartRow = $derived(Math.min(totalRows, virtualRange.startRow));
  const mountedEndRow = $derived(
    Math.max(mountedStartRow, Math.min(totalRows, virtualRange.endRow))
  );
  const virtualStartIndex = $derived(Math.min(allChunks.length, mountedStartRow * safeColumns));
  const virtualEndIndex = $derived(Math.min(allChunks.length, mountedEndRow * safeColumns));
  const virtualChunks = $derived(allChunks.slice(virtualStartIndex, virtualEndIndex));
  const virtualLayout = $derived.by(() => {
    if (!showsAllFrames) return undefined;
    const pitch = virtualMetrics.rowHeight + virtualMetrics.rowGap;
    return {
      paddingTop: mountedStartRow * pitch,
      paddingBottom: Math.max(0, totalRows - mountedEndRow) * pitch,
    };
  });
  const pageIndexOffset = $derived.by(() => {
    let offset = 0;
    for (let i = 0; i < playerControlsStore.currentPageIndex; i++) offset += pages[i].length;
    return offset;
  });
  const visibleChunks = $derived(showsAllFrames ? virtualChunks : playerControlsStore.currentPage);
  const indexOffset = $derived(showsAllFrames ? virtualStartIndex : pageIndexOffset);

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
   * open state carries what it was opened against and simply stops matching. Fullscreen addresses
   * frames in whole-song space, so a page flip there moves nothing and is not a reason to close;
   * scrolling the anchor outside the mounted row window explicitly clears it below.
   */
  const activePopover = $derived.by(() => {
    if (!popover || popover.pages !== pages || popover.fullscreen !== isFullscreen) return null;
    if (!isFullscreen && popover.pageIndex !== playerControlsStore.currentPageIndex) return null;
    if (isFullscreen && (popover.index < virtualStartIndex || popover.index >= virtualEndIndex))
      return null;
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

  function cssPixels(value: string, fallback: number, element: HTMLElement) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return fallback;
    if (value.endsWith('rem')) {
      const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      return parsed * (Number.isFinite(rootSize) ? rootSize : 16);
    }
    if (value.endsWith('em')) {
      const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
      return parsed * (Number.isFinite(fontSize) ? fontSize : 16);
    }
    return parsed;
  }

  /**
   * Every frame has the same responsive aspect and every grid row therefore has one pitch. Read it
   * from the already-mounted inline page BEFORE opening; fullscreen can then represent the other
   * hundreds of rows with padding instead of creating their DOM.
   */
  function measureVirtualMetrics() {
    const grid = scrollElement?.querySelector<HTMLElement>('.player-chunks-page');
    const frame = grid?.querySelector<HTMLElement>('.player-sheet-frame');
    if (!grid || !frame) return;
    const styles = getComputedStyle(grid);
    const rectHeight = frame.getBoundingClientRect().height;
    const measuredHeight = rectHeight > 0 ? rectHeight : frame.offsetHeight;
    virtualMetrics = {
      rowHeight: measuredHeight > 0 ? measuredHeight : virtualMetrics.rowHeight,
      rowGap: cssPixels(styles.rowGap, virtualMetrics.rowGap, grid),
      marginTop: cssPixels(styles.marginTop, virtualMetrics.marginTop, grid),
      marginBottom: cssPixels(styles.marginBottom, virtualMetrics.marginBottom, grid),
    };
  }

  function virtualContentHeight() {
    if (totalRows === 0) return 0;
    return (
      virtualMetrics.marginTop +
      virtualMetrics.marginBottom +
      totalRows * virtualMetrics.rowHeight +
      (totalRows - 1) * virtualMetrics.rowGap
    );
  }

  function clampScrollTop(scrollTop: number, viewportHeight: number) {
    return Math.max(0, Math.min(scrollTop, virtualContentHeight() - viewportHeight));
  }

  function centeredScrollTop(index: number, viewportHeight: number) {
    const row = Math.floor(index / safeColumns);
    const pitch = virtualMetrics.rowHeight + virtualMetrics.rowGap;
    const rowCenter = virtualMetrics.marginTop + row * pitch + virtualMetrics.rowHeight / 2;
    return clampScrollTop(rowCenter - viewportHeight / 2, viewportHeight);
  }

  function rangeAtScrollTop(scrollTop: number, viewportHeight: number): VirtualRange {
    if (totalRows === 0) return { startRow: 0, endRow: 0 };
    const pitch = Math.max(1, virtualMetrics.rowHeight + virtualMetrics.rowGap);
    const visibleHeight = Math.max(virtualMetrics.rowHeight, viewportHeight);
    const firstVisibleRow = Math.min(
      totalRows - 1,
      Math.floor(Math.max(0, scrollTop - virtualMetrics.marginTop) / pitch)
    );
    const lastVisibleRow = Math.min(
      totalRows - 1,
      Math.floor(Math.max(0, scrollTop + visibleHeight - virtualMetrics.marginTop) / pitch)
    );
    return {
      startRow: Math.max(0, firstVisibleRow - VIRTUAL_OVERSCAN_ROWS),
      endRow: Math.min(totalRows, lastVisibleRow + 1 + VIRTUAL_OVERSCAN_ROWS),
    };
  }

  function setVirtualRange(scrollTop: number, viewportHeight: number) {
    const next = rangeAtScrollTop(scrollTop, viewportHeight);
    if (next.startRow === virtualRange.startRow && next.endRow === virtualRange.endRow) return;
    const startIndex = next.startRow * safeColumns;
    const endIndex = Math.min(allChunks.length, next.endRow * safeColumns);
    // IntersectionObserver normally dismisses this too, but a jump can unmount the anchor before
    // its callback. Never leave a popover holding a detached, later-revivable element.
    if (popover?.fullscreen && (popover.index < startIndex || popover.index >= endIndex))
      popover = null;
    virtualRange = next;
  }

  function expandedViewportEstimate() {
    const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const cardInset = (Number.isFinite(rootSize) ? rootSize : 16) * 1.6;
    return Math.max(virtualMetrics.rowHeight, window.innerHeight - cardInset);
  }

  /**
   * THE REVEAL OPENS IN PLACE (anchorToPage): the initial scroll offset is the one that puts the
   * current PAGE's rows at exactly the viewport positions the inline card just showed them at, so
   * the first animation frame is pixel-identical to what was on screen - centring the current
   * frame in the collapsed window instead made every frame jump by up to a row-pitch the instant
   * the animation began. The translate then glides everything to the final centred position.
   * After the reveal (a page set replaced mid-fullscreen), there is no inline picture to match,
   * so the window is centred outright and the translate degenerates to zero.
   */
  function prepareVirtualWindowForCurrentFrame(
    finalViewportHeight = expandedViewportEstimate(),
    anchorToPage = !hasCenteredThisOpen
  ) {
    const index = playerControlsStore.currentGlobalChunkIndex;
    if (index < 0) {
      revealFromShift = 0;
      revealCenterShift = 0;
      revealFinalScrollTop = 0;
      return 0;
    }
    const finalHeight = Math.max(virtualMetrics.rowHeight, finalViewportHeight);
    const finalScrollTop = centeredScrollTop(index, finalHeight);
    // The page's first row sits marginTop below the card's top inline; at scrollTop = row * pitch
    // it sits there again, so every row of the page keeps its exact position.
    const pitch = virtualMetrics.rowHeight + virtualMetrics.rowGap;
    const desired = anchorToPage
      ? Math.floor(pageIndexOffset / safeColumns) * pitch
      : finalScrollTop;
    // scrollTop cannot exceed the scroll range; the shortfall rides the translate's start instead
    // (revealFromShift), so a tail page still opens in place.
    const clamped = clampScrollTop(desired, finalHeight);
    revealFinalScrollTop = finalScrollTop;
    revealFromShift = clamped - desired;
    revealCenterShift = clamped - finalScrollTop;
    // The surface has its final layout size from the first animation frame and is progressively
    // revealed. Seed enough rows for that whole size so the clip never uncovers an empty spacer,
    // and pre-mount what the final centred position needs too: animationend can then change only
    // scrollTop and remove surplus rows; it never has to create another band during hand-off.
    const rangeHeight = Math.max(expandedViewportEstimate(), finalHeight);
    const rangeTop = Math.min(desired, finalScrollTop);
    const rangeBottom = Math.max(desired + rangeHeight, finalScrollTop + rangeHeight);
    setVirtualRange(rangeTop, rangeBottom - rangeTop);
    return clamped;
  }

  function centerOnCurrentFrame(
    viewportHeight = scrollElement?.clientHeight || expandedViewportEstimate(),
    rangeViewportHeight = scrollElement?.clientHeight || viewportHeight
  ) {
    const index = playerControlsStore.currentGlobalChunkIndex;
    if (index < 0 || !scrollElement) return;
    const height = Math.max(virtualMetrics.rowHeight, viewportHeight);
    const scrollTop = centeredScrollTop(index, height);
    setVirtualRange(scrollTop, Math.max(height, rangeViewportHeight));
    scrollElement.scrollTop = scrollTop;
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

  function handleSheetScroll() {
    // The first programmatic scroll fires a native event. Until reveal ends, keep the deliberately
    // larger union band that already covers both initial and final centring positions; shrinking
    // it here would make animationend remount the missing upper rows at the hand-off.
    if (showsAllFrames && scrollElement && hasCenteredThisOpen) {
      setVirtualRange(scrollElement.scrollTop, scrollElement.clientHeight);
    }
    updateScrollThumb();
  }

  async function handleWindowResize() {
    const el = scrollElement;
    if (fullscreenPhase !== 'open' || !el) {
      updateScrollThumb();
      return;
    }
    const revision = ++resizeRevision;
    // Preserve the logical row under the viewport centre while responsive width changes alter the
    // frame aspect's pixel height. Keeping raw scrollTop would drift to a different chunk.
    const oldPitch = Math.max(1, virtualMetrics.rowHeight + virtualMetrics.rowGap);
    const anchorRow = (el.scrollTop + el.clientHeight / 2 - virtualMetrics.marginTop) / oldPitch;
    await tick();
    if (revision !== resizeRevision || fullscreenPhase !== 'open' || !scrollElement) return;
    measureVirtualMetrics();
    const newPitch = virtualMetrics.rowHeight + virtualMetrics.rowGap;
    const nextScrollTop = clampScrollTop(
      virtualMetrics.marginTop + anchorRow * newPitch - scrollElement.clientHeight / 2,
      scrollElement.clientHeight
    );
    setVirtualRange(nextScrollTop, scrollElement.clientHeight);
    // Spacer padding is reactive. Let it establish the new scrollHeight before assigning a larger
    // scrollTop, or the browser can clamp that write against the previous, shorter geometry.
    await tick();
    if (revision !== resizeRevision || fullscreenPhase !== 'open' || !scrollElement) return;
    scrollElement.scrollTop = nextScrollTop;
    updateScrollThumb();
  }

  async function openFullscreen() {
    //guarded on closed: mid-collapse the card's height is whatever the animation reached, and
    //measuring THAT as the collapsed height would seed the next open with a moving target
    if (fullscreenPhase !== 'closed') return;
    //measured BEFORE the phase flips: it is where the growth animation starts from, and where the
    //collapse animation returns to
    // clientHeight is integer-rounded. The responsive frame grid commonly gives the closed surface
    // a fractional height, and losing that fraction makes both clip endpoints visibly undershoot.
    const paintedHeight = surfaceElement?.getBoundingClientRect().height ?? 0;
    collapsedHeight =
      Number.isFinite(paintedHeight) && paintedHeight > 0
        ? paintedHeight
        : (cardElement?.clientHeight ?? 0);
    measureVirtualMetrics();
    //before the prepare call: anchorToPage defaults on this flag, and a previous open completed
    //with it true - the reveal must anchor to the page again, not re-centre
    hasCenteredThisOpen = false;
    prepareVirtualWindowForCurrentFrame(expandedViewportEstimate());
    collapseAfterReveal = false;
    centeredPages = pages;
    popover = null;
    fullscreenPhase = 'open';
    resizeRevision++;
    scheduleAnimationFallback('reveal');
    await tick();
    if (fullscreenPhase !== 'open') return;
    // `100vh` and `innerHeight` are not guaranteed to match on mobile. Now that final geometry is
    // measurable, enlarge the seeded band if needed and flush it before the first paint.
    const finalViewportHeight = scrollElement?.clientHeight || expandedViewportEstimate();
    const initialScrollTop = prepareVirtualWindowForCurrentFrame(finalViewportHeight);
    await tick();
    if (fullscreenPhase !== 'open') return;
    if (scrollElement) scrollElement.scrollTop = initialScrollTop;
    //still inside the click's task: the animation's from-state (fill both) is committed with the
    //same paint that first shows the expanded layout, so an unclipped card is never painted
    animateReveal();
    updateScrollThumb();
  }

  function collapseFullscreen() {
    if (fullscreenPhase !== 'open') return;
    popover = null;
    // Replacing the in-progress reveal keyframe with a hide keyframe would jump to the latter's
    // fully-open `from` frame. Queue the reversal for the reveal's end instead (at most 150ms).
    if (!hasCenteredThisOpen) {
      collapseAfterReveal = true;
      return;
    }
    startClosing();
  }

  function startClosing() {
    if (fullscreenPhase !== 'open') return;
    fullscreenPhase = 'closing';
    resizeRevision++;
    scheduleAnimationFallback('hide');
    animateHide();
    //the indicator leaves with the interactive view, not 150ms after it
    updateScrollThumb();
  }

  function finishCollapse() {
    if (fullscreenPhase !== 'closing') return;
    clearAnimationFallback();
    //cancelled in the same task as the phase flip: the held end clip and the inline layout that
    //replaces it land in one paint
    hideAnimation?.cancel();
    hideAnimation = null;
    fullscreenPhase = 'closed';
    revealFromShift = 0;
    revealCenterShift = 0;
    revealFinalScrollTop = 0;
    resizeRevision++;
    virtualRange = { startRow: 0, endRow: 1 };
    tick().then(() => {
      if (fullscreenPhase === 'closed' && scrollElement) scrollElement.scrollTop = 0;
    });
  }

  function finishReveal() {
    if (!isFullscreen || hasCenteredThisOpen) return;
    clearAnimationFallback();
    if (scrollElement) {
      const viewportHeight = scrollElement.clientHeight || expandedViewportEstimate();
      // The mounted-row wrapper has just finished moving by `initial - final`. Moving scrollTop by
      // that same delta while the transform drops away makes the hand-off pixel-continuous.
      setVirtualRange(revealFinalScrollTop, viewportHeight);
      scrollElement.scrollTop = revealFinalScrollTop;
    }
    // Cancelling the reveal drops its held transform in the same task, after the equivalent
    // scroll offset above has taken its place - the hand-off stays pixel-continuous.
    cancelRevealAnimations();
    hasCenteredThisOpen = true;
    if (collapseAfterReveal) {
      collapseAfterReveal = false;
      startClosing();
      return;
    }
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
  onresize={handleWindowResize}
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
      isFullscreen && !hasCenteredThisOpen && 'player-sheet-card-revealing',
      fullscreenPhase === 'closing' && 'player-sheet-card-closing',
    ]}
    style={showsAllFrames
      ? `--sheet-collapsed-height:${collapsedHeight}px;--sheet-reveal-from:${revealFromShift}px;--sheet-center-shift:${revealCenterShift}px`
      : ''}
  >
    <!-- The reveal/hide clips are Web Animations created in the script (see animateReveal); the
         style vars above are the same values, kept for tests and debugging. -->
    <div class="player-sheet-surface" bind:this={surfaceElement}>
      <div class="player-sheet-scroll" bind:this={scrollElement} onscroll={handleSheetScroll}>
        <PlayerPagesRenderer
          chunks={visibleChunks}
          {columns}
          {indexOffset}
          {virtualLayout}
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
    </div>
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
    /* Expanded, this shell already has its final height while only part of its surface is painted.
       Let clicks in the still-clipped transparent area reach what is visibly underneath. */
    pointer-events: none;
  }

  .player-sheet-surface {
    position: relative;
    display: flow-root;
    border-radius: 0.7rem;
    background-color: var(--background-layer-15);
    pointer-events: auto;
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
    /* Keep the virtual grid in a stable, local scroll-layer containing block. */
    position: relative;
  }

  /* Final geometry is installed immediately: width, inset, column count and frame size are all
     untouched, which lets the user find the frame they were looking at. The visual surface is
     revealed below without changing layout on every animation frame. Above the keyboard (10), the
     hold ring (11) and the menu column (11); below Home (100), the logger and prompts. */
  .player-sheet-card-expanded,
  .player-sheet-card-closing {
    height: calc(100vh - 1.6rem);
    z-index: 40;
  }

  .player-sheet-card-expanded .player-sheet-surface,
  .player-sheet-card-closing .player-sheet-surface {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  /* NO reveal/hide keyframes here, deliberately: the clip and row-slide animations are Web
     Animations with concrete pixel values (animateReveal/animateHide in the script). As CSS
     keyframes they read var(--sheet-collapsed-height), and Chrome's compositor resolved that
     var's 8rem fallback at the animation's edges - the card clipped visibly short for a few
     frames at every reveal start and hide end. Do not move them back into CSS keyframes. */

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
    background-color: var(--accent);
    opacity: 0.8;
    pointer-events: none;
    z-index: 1;
  }

  .player-sheet-expand {
    position: absolute;
    top: 0.4rem;
    right: -1.9rem;
    pointer-events: auto;
  }
</style>
