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
        ctx.setCurrent(id)
        // old: `if (isActive) { setOpen(false) } else { setOpen(true) }` - collapsed to the
        // equivalent `setOpen(!isActive)` below.
        ctx.setOpen(!isActive)
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
