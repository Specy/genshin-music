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
    /** A tool whose STATE is on (the open View Lock, the open tools) — wears the `.tool-toggled` tint below. */
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

<style>
  /* A tool whose STATE is on — the open View Lock and the open tools panel (user additions
     2026-08-22): the button that turns the state back off says so, in a half-accent tint of the
     column's own resting surface. Two classes so it also holds through `.tool:hover`, which stays
     in App.css beside `.tool`'s own shape and colour. */
  .tool.tool-toggled {
    background-color: color-mix(in srgb, var(--accent) 50%, var(--primary-darken-10));
  }
</style>
