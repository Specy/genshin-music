<script lang="ts">
  import { t } from '$i18n/binding.svelte';
  import FloatingDropdownRow from '$cmp/utility/FloatingDropdownRow.svelte';
  import FloatingDropdownText from '$cmp/utility/FloatingDropdownText.svelte';
  import IconBackwardStep from '~icons/fa6-solid/backward-step';
  import IconForwardStep from '~icons/fa6-solid/forward-step';
  import IconPlay from '~icons/fa6-solid/play';

  // Anchored to one Sheet Frame. Neither FloatingDropdown nor FloatingSelection fits: both are flow
  // siblings of their own trigger button, and this one is opened by whichever of dozens of frames
  // was clicked. The mechanics follow ComposerDurationPopover (fixed box positioned off the
  // anchor's rect, dismissed on outside POINTERDOWN so the frame's own click can still toggle it);
  // the palette follows FloatingSelection's card.
  //
  // It is deliberately rendered as a SIBLING of the Sheet Card, never inside it: expanded, the card
  // is a clipping scroll container, so a box inside it could not reach past its edges, and any
  // transform or filter it ever grows would become the containing block for a fixed child and
  // offset every position computed here by the card's own box.
  let {
    anchor,
    onSectionStart,
    onSectionEnd,
    onGoTo,
    onClose,
  }: {
    anchor: HTMLElement;
    onSectionStart: () => void;
    onSectionEnd: () => void;
    onGoTo: () => void;
    onClose: () => void;
  } = $props();

  let popoverElement: HTMLDivElement | undefined = $state();
  let popoverWidth = $state(0);
  let popoverHeight = $state(0);
  let resizeTick = $state(0);

  const MARGIN = 8;
  //room for the wedge between the frame and the box: the wedge protrudes WEDGE px, plus a breath
  const GAP = 10;
  /** Half the wedge triangle's base, in px - keep in sync with the 8px borders in the CSS below. */
  const WEDGE = 8;

  const placement = $derived.by(() => {
    void resizeTick;
    const rect = anchor.getBoundingClientRect();
    const left = Math.max(
      MARGIN,
      Math.min(
        rect.x + rect.width / 2 - popoverWidth / 2,
        window.innerWidth - popoverWidth - MARGIN
      )
    );
    //below the frame unless that would run off the bottom, in which case above it - and either
    //branch clamped to the viewport: an anchor mid-scroll can hand over a rect that is already
    //past an edge for the one frame before the observer below closes this box
    const belowTop = rect.bottom + GAP;
    const below = belowTop + popoverHeight + MARGIN <= window.innerHeight;
    const top = below ? belowTop : rect.top - popoverHeight - GAP;
    //the wedge points at the FRAME's centre, not the box's: the box may be clamped at a viewport
    //edge while the frame is not, so the wedge is placed off the anchor and clamped to stay clear
    //of the box's rounded corners
    const wedgeLeft = Math.min(
      Math.max(rect.x + rect.width / 2 - left - WEDGE, MARGIN),
      popoverWidth - WEDGE * 2 - MARGIN
    );
    return {
      left,
      top: Math.min(Math.max(MARGIN, top), window.innerHeight - popoverHeight - MARGIN),
      below,
      wedgeLeft,
    };
  });

  // SCROLLING MOVES THE ANCHOR AND NOTHING ELSE SAYS SO: this box is fixed-positioned, and in
  // fullscreen its frame lives inside the card's own scroll container, whose scrolling fires no
  // resize and touches no tracked state - the popover would sit at the frame's old viewport
  // coordinates, over whatever frame scrolled into that spot. Capture phase because a scroll event
  // on an inner container never bubbles to the window.
  $effect(() => {
    const reposition = () => resizeTick++;
    window.addEventListener('scroll', reposition, true);
    return () => window.removeEventListener('scroll', reposition, true);
  });

  // ...and scrolling can take the anchor AWAY entirely: in fullscreen its frame lives inside the
  // card's clipping scroll box, and this box - fixed and unclipped - would otherwise stay behind,
  // attached to a frame nobody can see. An IntersectionObserver rather than a rect check because
  // intersection accounts for ancestor clipping: the frame's rect can be outside the card's box
  // while still well inside the viewport.
  $effect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => !entry.isIntersecting)) onClose();
    });
    observer.observe(anchor);
    return () => observer.disconnect();
  });

  function handleOutsidePointerDown(e: PointerEvent) {
    const target = e.target as Node | null;
    //the anchor is exempt so its own click can close this one; any OTHER frame closes it here and
    //then opens its own, which is what keeps a single popover open at a time
    if (popoverElement?.contains(target) || anchor.contains(target)) return;
    onClose();
  }
</script>

<svelte:window onpointerdown={handleOutsidePointerDown} onresize={() => resizeTick++} />

<!-- Hidden until it has been measured: `placement` needs the box's own width and height, and those
     only arrive from the bindings below after the first paint - laid out at zero size it would
     flash one frame off-centre, and a frame near the bottom edge would place itself below and then
     jump above. -->
<!-- The rows are the song dropdown's own (FloatingDropdownRow/Text), so the two menus read as one
     UI; only the container differs - this one is fixed-positioned off a frame and carries the
     wedge pointing back at it. Icons come from the iconify set (~icons/fa6-solid), never inlined
     by hand: the step markers are the "start of/end of" pair, the play triangle the seek. -->
<div
  class={['frame-popover', !placement.below && 'frame-popover-above']}
  role="menu"
  aria-label={t('player:sheet_frame_options')}
  bind:this={popoverElement}
  bind:offsetWidth={popoverWidth}
  bind:offsetHeight={popoverHeight}
  style="left:{placement.left}px;top:{placement.top}px;--wedge-left:{placement.wedgeLeft}px;visibility:{popoverHeight
    ? 'visible'
    : 'hidden'}"
>
  <FloatingDropdownRow onclick={onSectionStart}>
    <IconBackwardStep style="margin-right:0.4rem" />
    <FloatingDropdownText text={t('player:section_starts_here')} />
  </FloatingDropdownRow>
  <FloatingDropdownRow onclick={onSectionEnd}>
    <IconForwardStep style="margin-right:0.4rem" />
    <FloatingDropdownText text={t('player:section_ends_here')} />
  </FloatingDropdownRow>
  <FloatingDropdownRow onclick={onGoTo}>
    <IconPlay style="margin-right:0.4rem" />
    <FloatingDropdownText text={t('player:go_to_here')} />
  </FloatingDropdownRow>
</div>

<style>
  /* The song dropdown's box (.floating-dropdown-children): same padding, border, radius and
     shadow, so the two menus are visually one component. NO overflow:hidden - the wedge below
     protrudes past the box on purpose. */
  .frame-popover {
    position: fixed;
    z-index: 41;
    display: flex;
    flex-direction: column;
    min-width: 9rem;
    padding: 0.2rem;
    background-color: var(--primary);
    color: var(--primary-text);
    border: solid 1px var(--secondary);
    border-radius: 0.4rem;
    box-shadow:
      0 20px 25px -5px rgb(0 0 0 / 0.2),
      0 8px 10px -6px rgb(0 0 0 / 0.2);
    animation: fadeIn 0.15s;
  }

  /* The wedge pointing back at the frame: two stacked border-triangles, the outer in the box's
     border colour and the inner in its background, offset 2px so a sliver of the outer reads as
     the border continuing around the tip. Drawn outside the box (never inside it), which is why
     the container has no overflow:hidden. 8px = the WEDGE constant in the script. */
  .frame-popover::before,
  .frame-popover::after {
    content: '';
    position: absolute;
    left: var(--wedge-left, calc(50% - 8px));
    border: 8px solid transparent;
    pointer-events: none;
  }

  .frame-popover::before {
    top: -16px;
    border-bottom-color: var(--secondary);
  }

  .frame-popover::after {
    top: -14px;
    border-bottom-color: var(--primary);
  }

  /* Spawned above the frame: the wedge moves to the bottom edge and points down. */
  .frame-popover-above::before,
  .frame-popover-above::after {
    top: auto;
    border-bottom-color: transparent;
  }

  .frame-popover-above::before {
    bottom: -16px;
    border-top-color: var(--secondary);
  }

  .frame-popover-above::after {
    bottom: -14px;
    border-top-color: var(--primary);
  }
</style>
