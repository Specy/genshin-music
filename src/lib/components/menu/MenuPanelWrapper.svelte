<script lang="ts">
    import type {Snippet} from 'svelte'
    import {getMenuContext} from './menuContext'

    let {
        children,
        className = '',
        style = '',
    }: {
        children?: Snippet
        className?: string
        style?: string
    } = $props()

    const ctx = getMenuContext()
    const isOpen = $derived(ctx.open && ctx.visible)
</script>

<div class="side-menu {isOpen ? 'side-menu-open' : ''} {className}" style={style}>
    {@render children?.()}
</div>
