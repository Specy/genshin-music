<script lang="ts">
    import type {Snippet} from 'svelte'
    import type {ClassValue} from 'svelte/elements'
    import {blurEvent} from '$core/utils/Utilities'

    // Unlike MenuItem (sibling file), this never reads menu context - it's a
    // plain action button styled like a menu item, for actions that don't
    // switch a "current" panel (back/discord/home-open/close-home).
    let {
        class: cls = '',
        style = '',
        onclick,
        children,
        ariaLabel,
    }: {
        class?: ClassValue
        style?: string
        onclick?: () => void
        children?: Snippet
        ariaLabel: string
    } = $props()

    function handleClick(e: MouseEvent) {
        blurEvent(e)
        onclick?.()
    }
</script>

<button
    class={['menu-item', cls]}
    style={style}
    aria-label={ariaLabel}
    onclick={handleClick}
>
    {@render children?.()}
</button>
