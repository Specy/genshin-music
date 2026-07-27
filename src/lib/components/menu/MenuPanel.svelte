<script lang="ts" generics="T extends string">
    import type {Snippet} from 'svelte'
    import {getMenuContext} from './menuContext'

    let {
        title,
        children,
        id,
    }: {
        title?: string
        children?: Snippet
        id: T
    } = $props()

    const ctx = getMenuContext<T>()
    const isVisible = $derived(ctx.current === id)
</script>

<div class={['menu-panel', isVisible && 'menu-panel-visible']}>
    {#if title}
        <div class="menu-title">{title}</div>
    {/if}
    <div class="panel-content-wrapper">
        {@render children?.()}
    </div>
</div>
