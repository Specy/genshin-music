<script lang="ts">
    import type {Snippet} from 'svelte'
    import {hasTooltip} from '$cmp/utility/tooltip'
    import Tooltip from '$cmp/utility/Tooltip.svelte'

    interface TimelineButtonProps {
        onclick: () => void
        tooltip?: string
        ariaLabel?: string
        style?: string
        children: Snippet
    }

    let {onclick, children, tooltip, style, ariaLabel}: TimelineButtonProps = $props()
</script>

<button class="timeline-button {hasTooltip(tooltip)}" {onclick} {style} aria-label={ariaLabel}>
    {@render children()}
    {#if tooltip}
        <Tooltip>
            {tooltip}
        </Tooltip>
    {/if}
</button>
