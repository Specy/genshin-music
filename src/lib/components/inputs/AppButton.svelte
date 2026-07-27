<script module lang="ts">
    import type {Snippet} from 'svelte'
    import type {TooltipPosition} from '../utility/tooltip'

    export interface AppButtonProps {
        style?: string
        className?: string
        onclick?: (e: MouseEvent) => void
        children?: Snippet
        toggled?: boolean
        disabled?: boolean
        visible?: boolean
        cssVar?: string
        tooltip?: string
        tooltipPosition?: TooltipPosition
        ariaLabel?: string
    }
</script>

<script lang="ts">
    import Tooltip from '../utility/Tooltip.svelte'
    import {hasTooltip} from '../utility/tooltip'

    // CSS (.app-button, .icon-app-button, .active, :disabled, etc.) lives in
    // global App.css.
    let {
        style = '',
        className = '',
        cssVar,
        children,
        toggled = false,
        onclick,
        disabled = false,
        visible = true,
        tooltip,
        ariaLabel,
        tooltipPosition,
    }: AppButtonProps = $props()

    const computedStyle = $derived([
        cssVar ? `background-color:var(--${cssVar});color:var(--${cssVar}-text)` : '',
        style,
        !visible ? 'display:none' : '',
    ].filter(Boolean).join(';'))
</script>

<button
    class="app-button {className} {toggled ? 'active' : ''} {hasTooltip(tooltip)}"
    style={computedStyle}
    aria-label={ariaLabel}
    {onclick}
    {disabled}
>
    {@render children?.()}
    {#if tooltip}
        <Tooltip position={tooltipPosition}>
            {tooltip}
        </Tooltip>
    {/if}
</button>
