<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { TooltipPosition } from './tooltip';

  // CSS (.tooltip, .tooltip-<position>, .has-tooltip) lives in this file's
  // own style block at the bottom.
  //
  // (Careful with comments in this file now that it carries a style block:
  // spelling a literal style or script tag name in brackets makes
  // svelte-check's tag scanner pair it with the real closing tag below and
  // report a phantom "script left open" error.)
  let {
    children,
    position = 'bottom',
    style,
  }: { children: Snippet; position?: TooltipPosition; style?: string } = $props();
</script>

<span class={['tooltip', `tooltip-${position}`]} {style}>
  {@render children()}
</span>

<style>
  /* `.has-tooltip` never appears in this file's markup: hasTooltip() in
     ./tooltip.ts hands it to the CONSUMER's element as a runtime string, so
     Svelte can't scope that half and it has to be :global(...). The
     `.tooltip` half is this component's own span and stays scoped - every
     file that calls hasTooltip() also imports this component, so the two
     halves always ship together. */
  :global(.has-tooltip) {
    position: relative;
  }

  @media (hover: hover) {
    :global(.has-tooltip:hover:not(:focus)) {
      z-index: 2;
    }

    :global(.has-tooltip:hover:not(:focus)) .tooltip {
      display: block;
      animation: fadeIn 0.2s forwards;
      animation-delay: 0.5s;
    }
  }

  @media (hover: none) {
    :global(.has-tooltip:active) {
      z-index: 2;
    }

    :global(.has-tooltip:active) .tooltip {
      display: block;
      animation: fadeIn 0.2s forwards;
      animation-delay: 0.5s;
    }
  }

  .tooltip {
    display: none;
    opacity: 0;
    position: absolute;
    background-color: var(--secondary);
    color: var(--secondary-text);
    padding: 0.3rem 0.6rem;
    border-radius: 0.2rem;
    max-width: 10rem;
    width: fit-content;
    z-index: 20;
    box-shadow:
      0 4px 6px -1px rgb(0 0 0 / 0.15),
      0 2px 4px -2px rgb(0 0 0 / 0.15);
    font-size: 0.8rem;
    pointer-events: none;
    z-index: 2;
  }

  .tooltip-bottom {
    transform: translateY(100%);
    --existing-transform: translateY(100%);
    bottom: -0.4rem;
  }

  .tooltip-top {
    transform: translateY(-100%);
    --existing-transform: translateY(-100%);
    top: -0.4rem;
  }

  .tooltip-right {
    transform: translateX(calc(100% + 0.4rem));
    top: 0;
    --existing-transform: translateX(calc(100% + 0.4rem));
  }

  .tooltip-left {
    transform: translateX(calc(-100% - 0.4rem));
    top: 0;
    --existing-transform: translateX(calc(-100% - 0.4rem));
  }

  .tooltip::before {
    content: '';
    transform: translateY(-50%) rotate(45deg);
    position: absolute;
    width: 0.5rem;
    height: 0.5rem;
    background-color: var(--secondary);
  }

  .tooltip-bottom::before {
    right: calc(50% - 0.25rem);
    top: 0;
    border-top-right-radius: 2px;
  }

  .tooltip-top::before {
    bottom: 0;
    right: calc(50% - 0.25rem);
    border-bottom-right-radius: 2px;
    transform: translateY(50%) rotate(45deg);
  }

  .tooltip-left::before {
    right: -0.25rem;
    top: 50%;
    border-bottom-left-radius: 2px;
  }

  .tooltip-right::before {
    left: -0.25rem;
    top: 50%;
    border-bottom-right-radius: 2px;
    transform: translateY(50%) rotate(45deg);
  }
</style>
