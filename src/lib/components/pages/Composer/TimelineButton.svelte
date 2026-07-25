<script lang="ts">
    import type {Snippet} from 'svelte'
    import {hasTooltip} from '$cmp/utility/tooltip'
    import Tooltip from '$cmp/utility/Tooltip.svelte'

    // Old: src/components/pages/Composer/TimelineButton.tsx (24 lines) - thin generic button
    // wrapper, no icon baked in (old took `children: React.ReactNode`, always called with an icon
    // passed in by its caller). Zero call sites of this component exist within old
    // ComposerCanvas.tsx besides the three ComposerCanvas.svelte renders (Task 3's own file) - the
    // icons those three usages pass in are inlined there, not here, matching old's own
    // presentation-agnostic shape. `onClick`/`style`/`children`/`tooltip`/`ariaLabel` prop shape
    // kept 1:1 with `AppButton.svelte`'s established tooltip-button convention (P4a Task 4).
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
