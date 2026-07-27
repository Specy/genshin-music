<script lang="ts">
    import type {Snippet} from 'svelte'
    import type {ClassValue} from 'svelte/elements'
    import Tooltip from '../utility/Tooltip.svelte'
    import {hasTooltip} from '../utility/tooltip'

    // `.song-button` is global CSS (App.css) - no component-local <style>
    // is needed here.
    let {
        onclick,
        children,
        style = '',
        tooltip,
        ariaLabel,
        class: cls = '',
    }: {
        onclick?: (e: MouseEvent) => void
        style?: string
        tooltip?: string
        ariaLabel?: string
        class?: ClassValue
        children: Snippet
    } = $props()
</script>

<button class="song-button {hasTooltip(tooltip)} {cls}" {onclick} {style} aria-label={ariaLabel}>
    {@render children()}
    {#if tooltip}
        <Tooltip>
            {tooltip}
        </Tooltip>
    {/if}
</button>
