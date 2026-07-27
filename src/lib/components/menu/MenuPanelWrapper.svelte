<script lang="ts">
    import type {Snippet} from 'svelte'
    import type {ClassValue} from 'svelte/elements'
    import {getMenuContext} from './menuContext'

    let {
        children,
        class: cls = '',
        style = '',
    }: {
        children?: Snippet
        class?: ClassValue
        style?: string
    } = $props()

    const ctx = getMenuContext()
    const isOpen = $derived(ctx.open && ctx.visible)
</script>

<div class={['side-menu', isOpen && 'side-menu-open', cls]} style={style}>
    {@render children?.()}
</div>
