<script lang="ts">
    import type {Snippet} from 'svelte'
    import type {ClassValue} from 'svelte/elements'
    import {blurEvent} from '$core/utils/Utilities'
    import {getMenuContext} from './menuContext'

    let {
        class: cls = '',
        style = '',
        onclick,
        children,
        ariaLabel,
        id,
    }: {
        class?: ClassValue
        style?: string
        onclick?: () => void
        children?: Snippet
        ariaLabel: string
        id: string
    } = $props()

    const ctx = getMenuContext()
    const isActive = $derived(ctx.current === id && ctx.open && ctx.visible)

    function handleClick(e: MouseEvent) {
        blurEvent(e)
        onclick?.()
        // `isActive` MUST be sampled before setCurrent(id) runs: it's a live
        // $derived over ctx.current, so reading it AFTER setCurrent(id) would
        // always yield true for the item just clicked, making
        // setOpen(!isActive) close the menu on every click instead of
        // switching tabs.
        const wasActive = isActive
        ctx.setCurrent(id)
        ctx.setOpen(!wasActive)
    }
</script>

<button
    class="menu-item {isActive ? 'menu-item-active' : ''} {cls}"
    style={style}
    aria-label={ariaLabel}
    onclick={handleClick}
>
    {@render children?.()}
</button>
