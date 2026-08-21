<script lang="ts">
  import type { Snippet } from 'svelte';
  import { hasTooltip } from '$cmp/utility/tooltip';
  import Tooltip from '$cmp/utility/Tooltip.svelte';

  interface CanvasToolProps {
    onclick: () => void;
    tooltip?: string;
    ariaLabel?: string;
    style?: string;
    /** A tool whose STATE is on (the open View Lock, the open tools) — wears App.css's `.tool-toggled` tint. */
    toggled?: boolean;
    children: Snippet;
  }

  let { onclick, children, tooltip, style, ariaLabel, toggled = false }: CanvasToolProps = $props();
</script>

<button
  class={['tool', toggled && 'tool-toggled', hasTooltip(tooltip)]}
  {onclick}
  {style}
  aria-label={ariaLabel}
>
  {@render children()}
  {#if tooltip}
    <Tooltip>
      {tooltip}
    </Tooltip>
  {/if}
</button>
