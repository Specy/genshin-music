<script lang="ts">
    import type {Snippet} from 'svelte'
    import type {TooltipPosition} from './tooltip'

    // CSS (.tooltip, .tooltip-<position>, .has-tooltip) lives in global
    // App.css - no component <style> here.
    let {children, position = 'bottom', style}: {children: Snippet, position?: TooltipPosition, style?: string} = $props()
</script>

<span class={['tooltip', `tooltip-${position}`]} {style}>
    {@render children()}
</span>
