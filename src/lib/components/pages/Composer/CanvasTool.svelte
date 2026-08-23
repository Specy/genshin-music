<script lang="ts">
  import type { Snippet } from 'svelte';
  import { hasTooltip } from '$cmp/utility/tooltip';
  import Tooltip from '$cmp/utility/Tooltip.svelte';

  interface CanvasToolProps {
    onclick: () => void;
    tooltip?: string;
    ariaLabel?: string;
    style?: string;
    disabled?: boolean;
    /** A tool whose STATE is on (the open View Lock, the open tools) — wears App.css's `.tool-toggled` tint. */
    toggled?: boolean;
    children: Snippet;
  }

  let {
    onclick,
    children,
    tooltip,
    style,
    ariaLabel,
    disabled = false,
    toggled = false,
  }: CanvasToolProps = $props();
</script>

<button
  class={['tool', toggled && 'tool-toggled', hasTooltip(tooltip)]}
  {onclick}
  {style}
  {disabled}
  aria-label={ariaLabel}
>
  {@render children()}
  {#if tooltip}
    <Tooltip>
      {tooltip}
    </Tooltip>
  {/if}
</button>
