<script lang="ts">
    import type {Snippet} from 'svelte'
    import {blurEvent} from '$core/utils/Utilities'

    // Old: src/components/shared/Menu/MenuItem.tsx (MenuButton export). Unlike MenuItem, this
    // never reads menu context - it's a plain action button styled like a menu item (used by
    // SimpleMenu/Home for back/discord/home-open/close-home, none of which switch a "current"
    // panel).
    let {
        className = '',
        style = '',
        onclick,
        children,
        ariaLabel,
    }: {
        className?: string
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
    class="menu-item {className}"
    style={style}
    aria-label={ariaLabel}
    onclick={handleClick}
>
    {@render children?.()}
</button>
