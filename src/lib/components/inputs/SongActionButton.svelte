<script lang="ts">
    import type {Snippet} from 'svelte'
    import Tooltip from '../utility/Tooltip.svelte'
    import {hasTooltip} from '../utility/tooltip'

    // Old: src/components/shared/Inputs/SongActionButton.tsx
    // `.song-button` is global CSS, already ported into App.css in Phase 4a Task 3 - no
    // component-local <style> needed here.
    // Old's `onClick={onClick || (() => {})}` defensive no-op fallback is dropped: an `undefined`
    // Svelte event-prop simply attaches no handler, which is behaviorally identical to attaching a
    // no-op one (clicking does nothing either way) - so the fallback was redundant even under old's
    // own semantics, just more visible there since React always wants *some* callable in the slot.
    let {
        onclick,
        children,
        style = '',
        tooltip,
        ariaLabel,
        className = '',
    }: {
        onclick?: (e: MouseEvent) => void
        style?: string
        tooltip?: string
        ariaLabel?: string
        className?: string
        children: Snippet
    } = $props()
</script>

<button class="song-button {hasTooltip(tooltip)} {className}" {onclick} {style} aria-label={ariaLabel}>
    {@render children()}
    {#if tooltip}
        <Tooltip>
            {tooltip}
        </Tooltip>
    {/if}
</button>
