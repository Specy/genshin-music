<script lang="ts">
    import type {Snippet} from 'svelte'
    import type {TooltipPosition} from './tooltip'

    // Old: src/components/shared/Utility/Tooltip.tsx
    // CSS (.tooltip, .tooltip-<position>, .has-tooltip) is global (App.css),
    // ported alongside this component in the same task - no component <style>.
    let {children, position = 'bottom', style}: {children: Snippet, position?: TooltipPosition, style?: string} = $props()
</script>

<span class="tooltip tooltip-{position}" {style}>
    {@render children()}
</span>
