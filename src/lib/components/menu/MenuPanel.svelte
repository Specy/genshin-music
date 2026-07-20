<script lang="ts" generics="T extends string">
    import type {Snippet} from 'svelte'
    import {getMenuContext} from './menuContext'

    // Old: src/components/shared/Menu/MenuPanel.tsx (MenuPanel<T> export - the only generic
    // component in the old menu system; old code's own comment: "for some reason react doesn't
    // infer the generics properly", worked around there with a cast + @ts-ignore on the wrapping
    // forwardRef. Svelte 5's <script generics> gives this a real generic component signature
    // without that workaround).
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

<div class="menu-panel {isVisible ? 'menu-panel-visible' : ''}">
    {#if title}
        <div class="menu-title">{title}</div>
    {/if}
    <div class="panel-content-wrapper">
        {@render children?.()}
    </div>
</div>
