<script lang="ts">
    import type {Snippet} from 'svelte'
    import {hasTooltip} from '$cmp/utility/tooltip'
    import Tooltip from '$cmp/utility/Tooltip.svelte'

    // Old: src/components/pages/Composer/CanvasTool.tsx (26 lines) - thin generic button wrapper,
    // no icon baked in (old took `children: React.ReactNode`). Its four old call sites
    // (AddColumn/RemoveColumn/FaPlus/FaTools icons) all live in old composer/index.tsx's
    // `buttons-composer-wrapper-right` block, which is Task 6's file (Composer.svelte), not this
    // one - `git grep -n "<CanvasTool" migration/next16-react19 -- src` confirms zero usages
    // anywhere inside ComposerCanvas.tsx/RenderColumn.tsx/ComposerBreakpointsRenderer.tsx (this
    // task's source files). This component therefore stays presentation-agnostic here exactly as
    // old was; Task 6 supplies the icon snippets when it wires up `<CanvasTool>` instances.
    // `onClick`/`style`/`children`/`tooltip`/`ariaLabel` prop shape kept 1:1 with
    // `AppButton.svelte`'s established tooltip-button convention (P4a Task 4).
    interface CanvasToolProps {
        onclick: () => void
        tooltip?: string
        ariaLabel?: string
        style?: string
        children: Snippet
    }

    let {onclick, children, tooltip, style, ariaLabel}: CanvasToolProps = $props()
</script>

<button class="tool {hasTooltip(tooltip)}" {onclick} {style} aria-label={ariaLabel}>
    {@render children()}
    {#if tooltip}
        <Tooltip>
            {tooltip}
        </Tooltip>
    {/if}
</button>
