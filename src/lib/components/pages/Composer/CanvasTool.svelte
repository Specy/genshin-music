<script lang="ts">
    import type {Snippet} from 'svelte'
    import {hasTooltip} from '$cmp/utility/tooltip'
    import Tooltip from '$cmp/utility/Tooltip.svelte'

    interface CanvasToolProps {
        onclick: () => void
        tooltip?: string
        ariaLabel?: string
        style?: string
        children: Snippet
    }

    let {onclick, children, tooltip, style, ariaLabel}: CanvasToolProps = $props()
</script>

<button class={['tool', hasTooltip(tooltip)]} {onclick} {style} aria-label={ariaLabel}>
    {@render children()}
    {#if tooltip}
        <Tooltip>
            {tooltip}
        </Tooltip>
    {/if}
</button>
