<script lang="ts">
  import type { Snippet } from 'svelte';
  import { hasTooltip } from '$cmp/utility/tooltip';
  import Tooltip from '$cmp/utility/Tooltip.svelte';

  interface TimelineButtonProps {
    onclick: () => void;
    tooltip?: string;
    ariaLabel?: string;
    style?: string;
    disabled?: boolean;
    children: Snippet;
  }

  let {
    onclick,
    children,
    tooltip,
    style,
    ariaLabel,
    disabled = false,
  }: TimelineButtonProps = $props();
</script>

<button
  class={['timeline-button', hasTooltip(tooltip)]}
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
