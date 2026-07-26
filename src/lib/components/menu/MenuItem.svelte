<script lang="ts">
    import type {Snippet} from 'svelte'
    import {blurEvent} from '$core/utils/Utilities'
    import {getMenuContext} from './menuContext'

    // Old: src/components/shared/Menu/MenuItem.tsx (MenuItem export only - MenuButton is its own
    // file here, see MenuButton.svelte). `id`/`ariaLabel` unchanged old prop names; `onClick` ->
    // `onclick`, `className` -> `className` prop but rendered as `class`.
    let {
        className = '',
        style = '',
        onclick,
        children,
        ariaLabel,
        id,
    }: {
        className?: string
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
        // `isActive` MUST be sampled before setCurrent(id) runs. Old React read it from the
        // render closure, so it was frozen at the value it had when the handler was created and
        // setCurrent() could not affect it mid-handler. Here it is a live $derived over
        // ctx.current, so reading it after setCurrent(id) always yields `id === id && open` =
        // true for the item just clicked - which made `setOpen(!isActive)` CLOSE the menu on
        // every click instead of switching tabs (clicking Settings while Songs was open shut the
        // whole sidebar). Sampling first restores old's semantics exactly:
        // old: `if (isActive) { setOpen(false) } else { setOpen(true) }`.
        const wasActive = isActive
        ctx.setCurrent(id)
        ctx.setOpen(!wasActive)
    }
</script>

<button
    class="menu-item {isActive ? 'menu-item-active' : ''} {className}"
    style={style}
    aria-label={ariaLabel}
    onclick={handleClick}
>
    {@render children?.()}
</button>
