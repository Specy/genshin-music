<script module lang="ts">
  import type { Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';
  import type { TooltipPosition } from '../utility/tooltip';

  export interface AppButtonProps {
    style?: string;
    class?: ClassValue;
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
    //rendered before the label; its presence is what tightens the left padding
    //and adds the gap between the two (.app-button-with-icon in App.css)
    icon?: Snippet;
    toggled?: boolean;
    disabled?: boolean;
    visible?: boolean;
    cssVar?: string;
    tooltip?: string;
    tooltipPosition?: TooltipPosition;
    ariaLabel?: string;
  }
</script>

<script lang="ts">
  import Tooltip from '../utility/Tooltip.svelte';
  import { hasTooltip } from '../utility/tooltip';

  // CSS (.app-button, .icon-app-button, .active, :disabled, etc.) lives in
  // global App.css.
  let {
    style = '',
    class: cls = '',
    cssVar,
    children,
    icon,
    toggled = false,
    onclick,
    disabled = false,
    visible = true,
    tooltip,
    ariaLabel,
    tooltipPosition,
  }: AppButtonProps = $props();

  const computedStyle = $derived(
    [
      cssVar ? `background-color:var(--${cssVar});color:var(--${cssVar}-text)` : '',
      style,
      !visible ? 'display:none' : '',
    ]
      .filter(Boolean)
      .join(';')
  );
</script>

<button
  class={[
    'app-button',
    icon && 'app-button-with-icon',
    cls,
    toggled && 'active',
    hasTooltip(tooltip),
  ]}
  style={computedStyle}
  aria-label={ariaLabel}
  {onclick}
  {disabled}
>
  {@render icon?.()}
  {@render children?.()}
  {#if tooltip}
    <Tooltip position={tooltipPosition}>
      {tooltip}
    </Tooltip>
  {/if}
</button>
